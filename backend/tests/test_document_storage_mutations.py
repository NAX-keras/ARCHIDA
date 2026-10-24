"""Upload/delete storage tests. No real DB, Blob writes or embedding inference."""

import os
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace
import unittest
from unittest.mock import MagicMock, patch

os.environ["DATABASE_URL"] = "sqlite://"
os.environ["SESSION_SECRET_KEY"] = "offline-storage-test-secret-not-for-deployment"
os.environ["APP_ENV"] = "development"

from fastapi import FastAPI
from fastapi.testclient import TestClient
from starlette.middleware.sessions import SessionMiddleware
from vercel.blob import sync as blob

from app.api.routes import admin_documents as admin
from app.database.session import get_db
from app.models.document import Document
from app.models.document_embedding import DocumentEmbedding
from app.services.auth.dependencies import get_current_user
from app.services import document_storage_service as storage


class StorageMutationTests(unittest.TestCase):
    def setUp(self):
        self.temporary = TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.addCleanup(patch.stopall)
        self.root = Path(self.temporary.name)
        patch.object(storage, "BACKEND_DIRECTORY", self.root).start()
        patch.object(storage.settings, "APP_ENV", "production").start()
        self.events = []
        self.put_body = None

        def put(key, body, **kwargs):
            self.events.append("put")
            self.put_body = body.read()
            return SimpleNamespace(pathname=key)

        self.put = patch.object(blob, "put_blob", side_effect=put).start()
        self.remove = patch.object(blob, "delete_blob", side_effect=lambda key: self.events.append("delete")).start()
        self.stream = patch.object(blob, "stream_blob", side_effect=AssertionError("Unexpected read")).start()
        self.extract = patch.object(admin, "extract_golden_pages_text", return_value="Golden Pages text").start()
        self.embed = patch.object(admin, "generate_text_embedding", return_value=[0.1] * 768).start()
        self.db = MagicMock()
        self.added = []

        def add(value):
            self.added.append(value)
            value.id = len(self.added)

        self.db.add.side_effect = add
        self.db.commit.side_effect = lambda: self.events.append("commit")
        self.db.rollback.side_effect = lambda: self.events.append("rollback")
        self.app = FastAPI()
        self.app.add_middleware(SessionMiddleware, secret_key="offline-test-only")
        self.app.include_router(admin.router, prefix="/api")
        self.app.dependency_overrides[get_db] = lambda: self.db
        self.user = SimpleNamespace(id=1, role="ADMIN", nim=None)
        self.app.dependency_overrides[get_current_user] = lambda: self.user
        self.client = TestClient(self.app)
        self.addCleanup(self.client.close)
        self.staged = []
        actual = admin.prepare_upload

        def prepare(key):
            result = actual(key)
            self.staged.append(result.path)
            return result

        patch.object(admin, "prepare_upload", side_effect=prepare).start()

    def upload(self, content=b"fixture PDF processed by mocked extractor", name="test.pdf"):
        return self.client.post("/api/admin/documents/upload", data={"title": "Test", "category_id": 3},
                                files={"file": (name, content, "application/pdf")})

    def existing(self, key="storage/documents/test.pdf"):
        self.db.query.return_value.filter.return_value.first.return_value = SimpleNamespace(file_path=key)

    def assert_staging_clean(self):
        self.assertTrue(self.staged)
        self.assertTrue(all(not path.parent.exists() for path in self.staged))

    def test_blob_upload_before_commit_with_canonical_key(self):
        response = self.upload()
        self.assertEqual(response.status_code, 200)
        key = response.json()["data"]["file_path"]
        self.assertTrue(key.startswith("storage/documents/"))
        self.assertNotIn("://", key)
        self.assertEqual(self.events, ["put", "commit"])
        self.assertEqual(self.put.call_args.args[0], key)
        self.assertEqual(self.put.call_args.kwargs, {
            "access": "private", "content_type": "application/pdf",
            "content_length": len(self.put_body), "add_random_suffix": False, "allow_overwrite": False,
        })
        document = next(value for value in self.added if isinstance(value, Document))
        embedding = next(value for value in self.added if isinstance(value, DocumentEmbedding))
        self.assertEqual(document.file_path, key)
        self.assertEqual(document.processing_status, "completed")
        self.assertEqual(embedding.embedding_source, "uploaded_pdf_golden_pages")
        self.assertEqual(len(embedding.embedding), 768)
        self.assert_staging_clean()
        self.assertFalse((self.root / "storage").exists())
        self.remove.assert_not_called()

    def test_local_upload_persists_file_without_blob(self):
        storage.settings.APP_ENV = "development"
        response = self.upload()
        self.assertEqual(response.status_code, 200)
        key = response.json()["data"]["file_path"]
        self.assertEqual((self.root / key).read_bytes(), b"fixture PDF processed by mocked extractor")
        self.put.assert_not_called()
        self.assert_staging_clean()

    def test_processing_failure_never_uploads(self):
        self.extract.side_effect = ValueError("invalid PDF")
        self.assertEqual(self.upload().status_code, 500)
        self.put.assert_not_called()
        self.remove.assert_not_called()
        self.db.commit.assert_not_called()
        self.db.rollback.assert_called_once()
        self.assert_staging_clean()

    def test_embedding_failure_never_uploads(self):
        self.embed.return_value = [0.1]
        self.assertEqual(self.upload().status_code, 500)
        self.put.assert_not_called()
        self.db.commit.assert_not_called()
        self.assert_staging_clean()

    def test_empty_file_rejected_and_cleaned(self):
        self.assertEqual(self.upload(content=b"").status_code, 400)
        self.put.assert_not_called()
        self.extract.assert_not_called()
        self.assert_staging_clean()

    def test_provider_failure_rolls_back_without_deleting_unknown_blob(self):
        self.put.side_effect = RuntimeError("credential must not be disclosed")
        response = self.upload()
        self.assertEqual(response.status_code, 500)
        self.assertNotIn("credential", response.text)
        self.db.commit.assert_not_called()
        self.db.rollback.assert_called_once()
        self.remove.assert_not_called()
        self.assert_staging_clean()

    def test_commit_failure_removes_only_successful_new_blob(self):
        self.db.commit.side_effect = RuntimeError("commit failed")
        self.assertEqual(self.upload().status_code, 500)
        self.assertEqual(self.events, ["put", "rollback", "delete"])
        self.remove.assert_called_once_with(self.put.call_args.args[0])
        self.assert_staging_clean()

    def test_local_commit_failure_removes_new_file(self):
        storage.settings.APP_ENV = "local"
        self.db.commit.side_effect = RuntimeError("commit failed")
        self.assertEqual(self.upload().status_code, 500)
        self.assertEqual(list((self.root / "storage/documents").iterdir()), [])
        self.remove.assert_not_called()
        self.assert_staging_clean()

    def test_cleanup_failure_does_not_disclose_provider_error(self):
        self.db.commit.side_effect = RuntimeError("commit failed")
        self.remove.side_effect = RuntimeError("private-provider-token")
        response = self.upload()
        self.assertEqual(response.status_code, 500)
        self.assertNotIn("private-provider-token", response.text)
        self.assert_staging_clean()

    def test_local_save_collision_does_not_overwrite(self):
        storage.settings.APP_ENV = "development"
        key = "storage/documents/existing.pdf"
        target = self.root / key
        target.parent.mkdir(parents=True)
        target.write_bytes(b"original")
        source = self.root / "new.pdf"
        source.write_bytes(b"replacement")
        with self.assertRaises(storage.StorageUnavailable):
            storage.save_uploaded_document(key, source)
        self.assertEqual(target.read_bytes(), b"original")

    def test_delete_commits_db_before_blob(self):
        self.existing()
        response = self.client.delete("/api/admin/documents/1")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["data"]["file_deleted"])
        self.assertEqual(self.events, ["commit", "delete"])
        self.remove.assert_called_once_with("storage/documents/test.pdf")

    def test_delete_commit_failure_does_not_delete_blob(self):
        self.existing()
        self.db.commit.side_effect = RuntimeError("commit failed")
        self.assertEqual(self.client.delete("/api/admin/documents/1").status_code, 500)
        self.remove.assert_not_called()

    def test_delete_blob_failure_reports_partial_cleanup(self):
        self.existing()
        self.remove.side_effect = RuntimeError("secret-url")
        response = self.client.delete("/api/admin/documents/1")
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.json()["data"]["file_deleted"])
        self.assertIn("file gagal dihapus", response.json()["data"]["note"])
        self.assertNotIn("secret-url", response.text)
        self.db.commit.assert_called_once()
        self.db.rollback.assert_not_called()

    def test_delete_guards_metadata_and_other_paths(self):
        for key in ("metadata_import/a.pdf", "storage/other/a.pdf", "storage/documents",
                    "storage/documents/../other.pdf", "/etc/passwd", "https://example.com/blob"):
            with self.subTest(key=key):
                self.existing(key)
                response = self.client.delete("/api/admin/documents/1")
                self.assertEqual(response.status_code, 200)
                self.assertFalse(response.json()["data"]["file_deleted"])
        self.remove.assert_not_called()

    def test_local_delete_is_scoped(self):
        storage.settings.APP_ENV = "development"
        key = "storage/documents/test.pdf"
        path = self.root / key
        path.parent.mkdir(parents=True)
        path.write_bytes(b"fixture")
        self.existing(key)
        self.assertTrue(self.client.delete("/api/admin/documents/1").json()["data"]["file_deleted"])
        self.assertFalse(path.exists())
        self.remove.assert_not_called()

    def test_student_cannot_upload_or_delete(self):
        self.user.role = "MAHASISWA"
        self.user.nim = "test"
        self.assertEqual(self.upload().status_code, 403)
        self.assertEqual(self.client.delete("/api/admin/documents/1").status_code, 403)
        self.put.assert_not_called()
        self.remove.assert_not_called()
        self.db.add.assert_not_called()
        self.db.delete.assert_not_called()

    def test_anonymous_cannot_upload_or_delete(self):
        self.app.dependency_overrides.pop(get_current_user)
        self.assertEqual(self.upload().status_code, 401)
        self.assertEqual(self.client.delete("/api/admin/documents/1").status_code, 401)
        self.put.assert_not_called()
        self.remove.assert_not_called()


if __name__ == "__main__":
    unittest.main()
