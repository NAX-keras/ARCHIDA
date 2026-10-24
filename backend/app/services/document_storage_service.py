"""Canonical storage keys; local files outside production, private Blob in production."""

from dataclasses import dataclass
from pathlib import Path
import shutil
from tempfile import TemporaryDirectory

from fastapi.responses import FileResponse

from app.core.config import settings


BACKEND_DIRECTORY = Path(__file__).resolve().parents[2]
DOWNLOAD_HEADERS = {"Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"}


class StorageUnavailable(Exception):
    """Safe boundary: provider credentials/URLs/errors must not reach the client."""


def is_blob_storage_enabled() -> bool:
    return settings.APP_ENV == "production"


def normalize_storage_path(value: str | None, *, uploaded_only: bool = False) -> str | None:
    if not isinstance(value, str) or not value:
        return None
    # Never reinterpret URLs, Windows paths, encoded traversal or noncanonical keys.
    if any(ord(char) < 32 or ord(char) == 127 for char in value):
        return None
    if any(char in value for char in ("\\", ":", "%", "?", "#")):
        return None
    parts = value.split("/")
    if len(parts) < 2 or parts[0] != "storage" or any(p in {"", ".", ".."} for p in parts):
        return None
    if uploaded_only and (len(parts) < 3 or parts[1] != "documents"):
        return None
    return value


def resolve_local_path(key: str) -> Path:
    if normalize_storage_path(key) is None:
        raise ValueError("Invalid storage key")
    root = (BACKEND_DIRECTORY / "storage").resolve()
    target = (BACKEND_DIRECTORY / key).resolve()
    target.relative_to(root)  # Includes symlinks: never escape the local storage root.
    return target


@dataclass
class DocumentFile:
    path: Path
    temporary_directory: TemporaryDirectory | None = None

    def cleanup(self) -> None:
        if self.temporary_directory is not None:
            self.temporary_directory.cleanup()


class DocumentFileResponse(FileResponse):
    """Release a downloaded temporary file even when sending the response fails."""

    def __init__(self, document_file: DocumentFile, **kwargs):
        self.document_file = document_file
        super().__init__(path=str(document_file.path), **kwargs)

    async def __call__(self, scope, receive, send):
        try:
            await super().__call__(scope, receive, send)
        finally:
            self.document_file.cleanup()


def read_document(file_path: str | None) -> DocumentFile | None:
    key = normalize_storage_path(file_path)
    if key is None:
        return None
    if not is_blob_storage_enabled():
        try:
            path = resolve_local_path(key)
            return DocumentFile(path) if path.is_file() else None
        except (OSError, ValueError, RuntimeError):
            return None

    temporary = TemporaryDirectory(prefix="archida-download-")
    path = Path(temporary.name) / Path(key).name
    try:
        # Import lazily so local storage does not require Blob credentials or SDK setup.
        from vercel.blob import BlobNotFoundError, sync as blob

        try:
            # The SDK resolves managed OIDC credentials; never use public Blob URLs.
            with blob.stream_blob(key, access="private") as download:
                with path.open("wb") as output:
                    for chunk in download:
                        output.write(chunk)
        except BlobNotFoundError:
            temporary.cleanup()
            return None
        return DocumentFile(path, temporary)
    except Exception as error:
        temporary.cleanup()
        raise StorageUnavailable("Document storage is unavailable") from error


def prepare_upload(file_path: str) -> DocumentFile:
    key = normalize_storage_path(file_path, uploaded_only=True)
    if key is None:
        raise ValueError("Invalid uploaded document key")
    temporary = TemporaryDirectory(prefix="archida-upload-")
    return DocumentFile(Path(temporary.name) / Path(key).name, temporary)


def _uploaded_local_path(key: str) -> Path:
    path = resolve_local_path(key)
    path.relative_to((BACKEND_DIRECTORY / "storage/documents").resolve())
    return path


def save_uploaded_document(file_path: str, source: Path) -> None:
    """Persist only processed uploads, without overwriting any existing document."""
    key = normalize_storage_path(file_path, uploaded_only=True)
    if key is None:
        raise ValueError("Invalid uploaded document key")
    try:
        if is_blob_storage_enabled():
            from vercel.blob import sync as blob

            with source.open("rb") as body:
                blob.put_blob(key, body, access="private", content_type="application/pdf",
                              content_length=source.stat().st_size,
                              add_random_suffix=False, allow_overwrite=False)
        else:
            target = _uploaded_local_path(key)
            target.parent.mkdir(parents=True, exist_ok=True)
            # Exclusive creation: a collision must never overwrite another file.
            with target.open("xb") as output:
                try:
                    with source.open("rb") as body:
                        shutil.copyfileobj(body, output, length=65536)
                except BaseException:
                    output.close()
                    target.unlink(missing_ok=True)
                    raise
    except Exception as error:
        raise StorageUnavailable("Document could not be saved") from error


def delete_uploaded_document(file_path: str | None) -> bool:
    """Call only for a DB-selected document or this request's successful new upload."""
    key = normalize_storage_path(file_path, uploaded_only=True)
    if key is None:
        return False
    try:
        if is_blob_storage_enabled():
            from vercel.blob import sync as blob

            blob.delete_blob(key)
            return True  # SDK deletion is idempotent, including an already missing Blob.
        path = _uploaded_local_path(key)
        if path.is_file():
            path.unlink()
            return True
        return False
    except Exception as error:
        raise StorageUnavailable("Document file could not be deleted") from error
