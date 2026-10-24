"""Offline storage regression tests: SQLite memory DB, temp files, mocked Blob I/O."""

import asyncio
import base64
from contextlib import contextmanager
import io
import os
from pathlib import Path
import struct
from tempfile import TemporaryDirectory
from types import SimpleNamespace
import unittest
from unittest.mock import patch
import zlib

# Never connect to the application's database, even if a real .env is present.
os.environ["DATABASE_URL"] = "sqlite://"
os.environ["SESSION_SECRET_KEY"] = "offline-storage-test-secret-not-for-deployment"
os.environ["APP_ENV"] = "development"

from fastapi import FastAPI
from fastapi.testclient import TestClient
from pypdf import PdfWriter
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool
from starlette.middleware.sessions import SessionMiddleware
from vercel.blob import BlobNotFoundError, sync as blob

from app.api.routes import documents
from app.database.session import get_db
from app.models.document import Document
from app.models.document_metadata import DocumentMetadata
from app.models.user import User
from app.services.auth.dependencies import get_current_user
from app.services import document_storage_service as storage


def pdf_bytes():
    output = io.BytesIO()
    writer = PdfWriter()
    writer.add_blank_page(width=72, height=72)
    writer.write(output)
    return output.getvalue()


def png_bytes():
    def chunk(kind, data):
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data))
    return (b"\x89PNG\r\n\x1a\n"
            + chunk(b"IHDR", struct.pack(">IIBBBBB", 1, 1, 8, 2, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(b"\x00\xff\x00\x00")) + chunk(b"IEND", b""))


def jpeg_bytes():
    # One red pixel generated in memory; no user document.
    return base64.b64decode(
        "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/2wBDAQMEBAUEBQkFBQkUDQsNFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBT/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD50ooor8MP9Uz/2Q=="
    )

@contextmanager
def streamed(data):
    yield iter(data[i:i + 64] for i in range(0, len(data), 64))


class DownloadTests(unittest.TestCase):
    def setUp(self):
        self.temporary = TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.addCleanup(patch.stopall)
        patch.object(storage, "BACKEND_DIRECTORY", self.root).start()
        patch.object(storage.settings, "APP_ENV", "development").start()
        self.stream = patch.object(blob, "stream_blob").start()
        # Fail immediately if a download accidentally performs a provider write.
        self.put = patch.object(blob, "put_blob", side_effect=AssertionError("Unexpected write")).start()
        self.delete = patch.object(blob, "delete_blob", side_effect=AssertionError("Unexpected delete")).start()
        self.engine = create_engine("sqlite://", poolclass=StaticPool,
                                    connect_args={"check_same_thread": False})
        self.addCleanup(self.engine.dispose)
        for model in (User, Document, DocumentMetadata):
            model.__table__.create(self.engine)
        self.db = Session(self.engine)
        self.addCleanup(self.db.close)
        self.user = SimpleNamespace(id=1, role="MAHASISWA", nim="test")
        self.app = FastAPI()
        self.app.add_middleware(SessionMiddleware, secret_key="offline-test-only")
        self.app.include_router(documents.router, prefix="/api")
        self.app.dependency_overrides[get_db] = lambda: self.db
        self.app.dependency_overrides[get_current_user] = lambda: self.user
        self.client = TestClient(self.app)
        self.addCleanup(self.client.close)
        self.captured = []
        actual = documents.read_document

        def capture(key):
            result = actual(key)
            if result is not None:
                self.captured.append(result)
            return result
        self.read = patch.object(documents, "read_document", side_effect=capture).start()

    def document(self, key="storage/documents/test.pdf", access="PUBLIC", name="test.pdf"):
        self.db.add(Document(id=1, file_name=name, file_path=key))
        if access is not None:
            self.db.add(DocumentMetadata(id=1, document_id=1, title="Test", access_level=access))
        self.db.commit()

    def request(self):
        return self.client.get("/api/documents/1/download")

    def test_canonical_key_guards(self):
        self.assertEqual(storage.normalize_storage_path("storage/documents/reconciliation/a.pdf"),
                         "storage/documents/reconciliation/a.pdf")
        for value in (None, "", "metadata_import/a.pdf", "../a.pdf", "/etc/passwd",
                      "C:/storage/a.pdf", "storage/../a.pdf", "storage//a.pdf", "storage/./a.pdf",
                      "storage\\a.pdf", "https://host/a.pdf", "storage/%2e%2e/a.pdf",
                      "storage/a.pdf?x=y", "storage/a\x00.pdf", "storage"):
            with self.subTest(value=value):
                self.assertIsNone(storage.normalize_storage_path(value))
        for value in ("storage/documents", "storage/other/a.pdf", "storage/documents/../a.pdf"):
            self.assertIsNone(storage.normalize_storage_path(value, uploaded_only=True))

    def test_local_pdf_download_without_blob(self):
        self.document()
        path = self.root / "storage/documents/test.pdf"
        path.parent.mkdir(parents=True)
        path.write_bytes(pdf_bytes())
        response = self.request()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.content, pdf_bytes())
        self.assertEqual(response.headers["cache-control"], "no-store")
        self.assertEqual(response.headers["x-content-type-options"], "nosniff")
        self.assertTrue(path.exists())
        self.stream.assert_not_called()

    def test_private_blob_pdf_and_cleanup(self):
        storage.settings.APP_ENV = "production"
        self.document(name="../../unsafe\r\nname.html")
        self.stream.return_value = streamed(pdf_bytes())
        response = self.request()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.content, pdf_bytes())
        self.assertEqual(response.headers["content-type"], "application/pdf")
        self.assertEqual(response.headers["cache-control"], "no-store")
        self.assertEqual(response.headers["x-content-type-options"], "nosniff")
        self.assertNotIn("..", response.headers["content-disposition"])
        self.assertNotIn(".html", response.headers["content-disposition"])
        self.assertIn(".pdf", response.headers["content-disposition"])
        self.stream.assert_called_once_with("storage/documents/test.pdf", access="private")
        self.assertFalse(self.captured[0].path.parent.exists())
        self.assertFalse((self.root / "storage").exists())

    def test_png_local_and_blob(self):
        self.document("storage/documents/test.png", name="test.png")
        path = self.root / "storage/documents/test.png"
        path.parent.mkdir(parents=True)
        path.write_bytes(png_bytes())
        for mode in ("development", "production"):
            with self.subTest(mode=mode):
                storage.settings.APP_ENV = mode
                self.stream.return_value = streamed(png_bytes())
                response = self.request()
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.headers["content-type"], "image/png")
                self.assertEqual(response.content, png_bytes())

    def test_jpeg_and_jpg_local_and_blob(self):
        self.document()
        for suffix in (".jpeg", ".jpg"):
            document = self.db.get(Document, 1)
            document.file_path = "storage/documents/test" + suffix
            document.file_name = "test" + suffix
            self.db.commit()
            path = self.root / document.file_path
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(jpeg_bytes())
            for mode in ("development", "production"):
                with self.subTest(suffix=suffix, mode=mode):
                    storage.settings.APP_ENV = mode
                    self.stream.return_value = streamed(jpeg_bytes())
                    response = self.request()
                    self.assertEqual(response.status_code, 200)
                    self.assertEqual(response.headers["content-type"], "image/jpeg")
                    self.assertEqual(response.content, jpeg_bytes())

    def test_private_denied_before_storage(self):
        self.document(access="PRIVATE")
        self.assertEqual(self.request().status_code, 404)
        self.read.assert_not_called()
        self.stream.assert_not_called()

    def test_admin_can_download_private_blob(self):
        self.user.role = "ADMIN"
        storage.settings.APP_ENV = "production"
        self.document(access="PRIVATE")
        self.stream.return_value = streamed(pdf_bytes())
        self.assertEqual(self.request().status_code, 200)

    def test_missing_metadata_denied_before_storage(self):
        self.document(access=None)
        self.assertEqual(self.request().status_code, 404)
        self.read.assert_not_called()

    def test_unauthenticated_denied_before_storage(self):
        self.app.dependency_overrides.pop(get_current_user)
        self.assertEqual(self.request().status_code, 401)
        self.read.assert_not_called()

    def test_metadata_import_never_requests_blob(self):
        storage.settings.APP_ENV = "production"
        self.document("metadata_import/test.pdf")
        self.assertEqual(self.request().status_code, 404)
        self.stream.assert_not_called()

    def test_missing_local_file(self):
        self.document()
        self.assertEqual(self.request().status_code, 404)
        self.stream.assert_not_called()

    def test_missing_blob(self):
        storage.settings.APP_ENV = "production"
        self.document()
        self.stream.side_effect = BlobNotFoundError()
        self.assertEqual(self.request().status_code, 404)

    def test_provider_error_is_safe_and_temp_removed(self):
        storage.settings.APP_ENV = "production"
        self.document()
        self.stream.side_effect = RuntimeError("secret-credential-private-url")
        directories = []

        def create_temporary(**kwargs):
            temporary = TemporaryDirectory(**kwargs)
            directories.append(Path(temporary.name))
            return temporary

        with patch.object(storage, "TemporaryDirectory", side_effect=create_temporary) as factory:
            response = self.request()
            self.assertEqual(response.status_code, 503)
            self.assertNotIn("secret", response.text)
            self.assertEqual(response.headers["cache-control"], "no-store")
        self.assertEqual(factory.call_count, 1)
        self.assertTrue(all(not path.exists() for path in directories))

    def test_partial_blob_stream_failure_is_safe_and_cleaned(self):
        storage.settings.APP_ENV = "production"
        self.document()
        directories = []

        def create_temporary(**kwargs):
            temporary = TemporaryDirectory(**kwargs)
            directories.append(Path(temporary.name))
            return temporary

        @contextmanager
        def broken_stream():
            def chunks():
                yield b"%PDF-1.7 partial"
                raise RuntimeError("provider private information")
            yield chunks()

        self.stream.return_value = broken_stream()
        with patch.object(storage, "TemporaryDirectory", side_effect=create_temporary):
            response = self.request()
        self.assertEqual(response.status_code, 503)
        self.assertNotIn("private information", response.text)
        self.assertTrue(directories)
        self.assertTrue(all(not path.exists() for path in directories))

    def test_invalid_blob_format_cleanup(self):
        storage.settings.APP_ENV = "production"
        self.document()
        self.stream.return_value = streamed(b"not a PDF")
        self.assertEqual(self.request().status_code, 400)
        self.assertFalse(self.captured[0].path.parent.exists())

    def test_local_symlink_escape_rejected(self):
        path = self.root / "storage/documents"
        path.mkdir(parents=True)
        (self.root / "outside.pdf").write_bytes(pdf_bytes())
        (path / "test.pdf").symlink_to(self.root / "outside.pdf")
        self.document()
        self.assertEqual(self.request().status_code, 404)

    def test_temp_removed_if_response_send_fails(self):
        temporary = TemporaryDirectory()
        path = Path(temporary.name) / "test.pdf"
        path.write_bytes(pdf_bytes())
        response = storage.DocumentFileResponse(storage.DocumentFile(path, temporary))

        async def send(message):
            raise RuntimeError("connection lost")

        async def receive():
            return {"type": "http.disconnect"}

        with self.assertRaises(RuntimeError):
            asyncio.run(response({"type": "http", "method": "GET", "headers": []}, receive, send))
        self.assertFalse(path.parent.exists())


if __name__ == "__main__":
    unittest.main()
