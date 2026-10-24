import math
import re
from datetime import datetime, timezone
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.core.config import settings
from app.api.routes.documents import resolve_category, serialize_document
from app.schemas.document_metadata import UpdateDocumentMetadataRequest
from app.services.ai.metadata_text import build_embedding_text as build_metadata_embedding_text
from app.database.session import get_db
from app.models.document import Document
from app.models.document_metadata import DocumentMetadata
from app.models.document_embedding import DocumentEmbedding
from app.services.ai.pdf_extractor import extract_golden_pages_text
from app.services.ai.text_preprocessor import clean_extracted_text
from app.services.ai.embedding_service import generate_text_embedding
from app.models.user import User
from app.services.auth.dependencies import require_admin


router = APIRouter(prefix="/admin/documents", tags=["Admin Documents"],
                   dependencies=[Depends(require_admin)])


CATEGORY_MAPPING = {
    1: "Foto",
    3: "Surat Keputusan",
    4: "Surat Menyurat",
    5: "Sertifikat Akreditasi",
    6: "Panduan dan Pedoman",
    7: "Laporan Kegiatan",
    8: "SOP",
}

ALLOWED_ACCESS_LEVELS = {"PUBLIC", "PRIVATE"}


def sanitize_filename(filename: str) -> str:
    """
    Membersihkan nama file agar aman disimpan di storage lokal.
    """

    filename = filename.strip()
    filename = re.sub(r"[^\w\-. ]", "_", filename)
    filename = re.sub(r"\s+", " ", filename)

    return filename or "uploaded_document.pdf"


def get_backend_directory() -> Path:
    """
    Mengambil lokasi folder backend.

    Posisi file:
    backend/app/api/routes/admin_documents.py

    parents[3] = backend/
    """

    return Path(__file__).resolve().parents[3]


def get_storage_directory() -> Path:
    """
    Lokasi penyimpanan PDF upload admin.

    Struktur:
    backend/storage/documents/
    """

    backend_dir = get_backend_directory()
    storage_dir = backend_dir / "storage" / "documents"
    storage_dir.mkdir(parents=True, exist_ok=True)

    return storage_dir


def resolve_uploaded_document_file_path(file_path: str | None) -> Path | None:
    """
    Mengubah file_path dari database menjadi path file lokal yang aman.

    Hanya file di folder:
    backend/storage/documents/

    yang boleh dihapus.

    Tujuan:
    - Mencegah penghapusan file di luar folder storage.
    - Tidak menghapus file dataset metadata_import.
    - Tidak menghapus folder storage.
    """

    if not file_path:
        return None

    backend_dir = get_backend_directory()
    storage_documents_dir = (backend_dir / "storage" / "documents").resolve()

    candidate_path = Path(file_path)

    if candidate_path.is_absolute():
        resolved_path = candidate_path.resolve()
    else:
        resolved_path = (backend_dir / candidate_path).resolve()

    try:
        resolved_path.relative_to(storage_documents_dir)
    except ValueError:
        return None

    return resolved_path


def build_clean_description(description: str | None) -> str:
    """
    Mengembalikan deskripsi bersih untuk ditampilkan di detail dokumen.

    Catatan:
    - Nomor dokumen tetap dipakai untuk embedding_text.
    - Access level sudah disimpan pada kolom access_level.
    - Metadata teknis upload tidak ditempel ke description agar detail dokumen rapi.
    """

    return description.strip() if description else ""


def build_embedding_text(
    title: str,
    file_name: str,
    category_id: int,
    year: int | None,
    document_number: str | None,
    faculty: str | None,
    description: str | None,
    keywords: str | None,
    golden_pages_text: str | None,
) -> str:
    """
    Membentuk teks gabungan untuk embedding dokumen upload.

    Embedding memakai:
    - title
    - file_name
    - document_number
    - category
    - year
    - faculty/unit
    - description
    - keywords
    - teks Golden Pages halaman 1-2
    """

    category_label = CATEGORY_MAPPING.get(category_id, f"Kategori {category_id}")

    parts = [
        f"Judul: {title}",
        f"Nama File: {file_name}",
        f"Nomor Dokumen: {document_number}" if document_number else None,
        f"Kategori: {category_label}",
        f"Tahun: {year}" if year else None,
        f"Fakultas/Unit: {faculty}" if faculty else None,
        f"Deskripsi: {description}" if description else None,
        f"Kata Kunci: {keywords}" if keywords else None,
        f"Teks Golden Pages: {golden_pages_text}" if golden_pages_text else None,
    ]

    return "\n".join(part for part in parts if part)


@router.post("/upload")
async def upload_admin_document(
    file: UploadFile = File(...),
    title: str = Form(...),
    category_id: int = Form(...),
    year: int | None = Form(default=None),
    document_number: str | None = Form(default=None),
    faculty: str | None = Form(default=None),
    access_level: str = Form(default="PUBLIC"),
    description: str | None = Form(default=None),
    keywords: str | None = Form(default=None),
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """
    Upload dokumen PDF manual oleh admin.

    Endpoint:
    POST /api/admin/documents/upload

    Form-data:
    - file: PDF, wajib
    - title: string, wajib
    - category_id: int, wajib
    - year: int, optional
    - document_number: string, optional
    - faculty: string, optional
    - access_level: PUBLIC/PRIVATE, default PUBLIC
    - description: string, optional
    - keywords: string, optional
    """

    if not title or not title.strip():
        raise HTTPException(
            status_code=400,
            detail="Title wajib diisi.",
        )

    if category_id not in CATEGORY_MAPPING:
        raise HTTPException(
            status_code=400,
            detail="category_id tidak valid.",
        )

    normalized_access_level = access_level.strip().upper()

    if normalized_access_level not in ALLOWED_ACCESS_LEVELS:
        raise HTTPException(
            status_code=400,
            detail="access_level hanya boleh PUBLIC atau PRIVATE.",
        )

    original_filename = file.filename or ""

    if not original_filename.lower().endswith(".pdf"):
        raise HTTPException(
            status_code=400,
            detail="File harus berformat PDF.",
        )

    safe_original_filename = sanitize_filename(original_filename)
    unique_filename = f"{uuid.uuid4()}_{safe_original_filename}"

    storage_dir = get_storage_directory()
    storage_path = storage_dir / unique_filename

    relative_file_path = f"storage/documents/{unique_filename}"
    committed = False

    try:
        file_content = await file.read()

        if not file_content:
            raise HTTPException(
                status_code=400,
                detail="File PDF kosong.",
            )

        storage_path.write_bytes(file_content)
        file_size = storage_path.stat().st_size

        raw_text = extract_golden_pages_text(str(storage_path))
        cleaned_text = clean_extracted_text(raw_text)

        if not cleaned_text or not cleaned_text.strip():
            raise ValueError("Teks Golden Pages kosong setelah ekstraksi.")

        document = Document(
            uploaded_by=current_user.id,
            file_name=safe_original_filename,
            file_path=relative_file_path,
            file_type="application/pdf",
            file_size=file_size,
            extracted_text=cleaned_text,
            extraction_method="uploaded_pdf_golden_pages",
            processing_status="processing",
        )

        db.add(document)
        db.flush()

        clean_description = build_clean_description(description)

        metadata = DocumentMetadata(
            document_id=document.id,
            title=title.strip(),
            category=str(category_id),
            document_type="PDF",
            year=year,
            faculty=faculty.strip() if faculty else None,
            description=clean_description,
            keywords=keywords.strip() if keywords else None,
            access_level=normalized_access_level,
        )

        db.add(metadata)
        db.flush()

        embedding_text = build_embedding_text(
            title=title.strip(),
            file_name=safe_original_filename,
            category_id=category_id,
            year=year,
            document_number=document_number.strip() if document_number else None,
            faculty=faculty.strip() if faculty else None,
            description=clean_description,
            keywords=keywords.strip() if keywords else None,
            golden_pages_text=cleaned_text,
        )

        embedding = generate_text_embedding(embedding_text)

        if len(embedding) != settings.AI_EMBEDDING_DIM:
            raise ValueError(
                f"Dimensi embedding tidak sesuai. "
                f"Expected {settings.AI_EMBEDDING_DIM}, got {len(embedding)}."
            )

        document_embedding = DocumentEmbedding(
            document_id=document.id,
            embedding=embedding,
            model_name=settings.AI_MODEL_NAME,
            embedding_source="uploaded_pdf_golden_pages",
        )

        db.add(document_embedding)

        document.processing_status = "completed"

        response = {
            "status": "success",
            "message": "Document uploaded and processed successfully",
            "data": {
                "id": document.id,
                "title": metadata.title,
                "file_name": document.file_name,
                "file_path": document.file_path,
                "file_type": document.file_type,
                "file_size": document.file_size,
                "category_id": category_id,
                "category": CATEGORY_MAPPING.get(category_id),
                "document_type": metadata.document_type,
                "year": metadata.year,
                "faculty": metadata.faculty,
                "access_level": metadata.access_level,
                "description": metadata.description,
                "keywords": metadata.keywords,
                "processing_status": document.processing_status,
                "extraction_method": document.extraction_method,
                "embedding_source": "uploaded_pdf_golden_pages",
                "model_name": settings.AI_MODEL_NAME,
                "embedding_dim": settings.AI_EMBEDDING_DIM,
            },
        }

        db.commit()
        committed = True
        return response

    except HTTPException:
        if not committed:
            db.rollback()

            if storage_path.exists():
                storage_path.unlink()

        raise

    except Exception as error:
        if not committed:
            db.rollback()

            if storage_path.exists():
                storage_path.unlink()

        raise HTTPException(
            status_code=500,
            detail=f"Upload document failed: {str(error)}",
        )



@router.patch("/{document_id}/metadata")
def update_admin_document_metadata(
    document_id: int,
    payload: UpdateDocumentMetadataRequest,
    db: Session = Depends(get_db),
):
    """Update stored metadata and this document's embedding atomically."""
    committed = False
    try:
        document = (
            db.query(Document).filter(Document.id == document_id)
            .with_for_update().first()
        )
        if document is None:
            raise HTTPException(status_code=404, detail="Dokumen tidak ditemukan.")
        metadata = (
            db.query(DocumentMetadata)
            .filter(DocumentMetadata.document_id == document_id)
            .with_for_update().first()
        )
        if metadata is None:
            raise HTTPException(status_code=409, detail="Metadata dokumen belum tersedia.")

        updates = payload.model_dump(exclude_unset=True)
        if "category_id" in updates and updates["category_id"] not in CATEGORY_MAPPING:
            raise HTTPException(status_code=422, detail="category_id tidak valid.")

        changed = False
        for field, value in updates.items():
            if field == "category_id":
                if resolve_category(metadata.category)[0] == value:
                    continue
                field, value = "category", str(value)
            if getattr(metadata, field) != value:
                setattr(metadata, field, value)
                changed = True

        if changed:
            document_embedding = (
                db.query(DocumentEmbedding)
                .filter(DocumentEmbedding.document_id == document_id)
                .with_for_update().first()
            )
            source = document.extraction_method
            if (
                source not in {"metadata_import", "uploaded_pdf_golden_pages"}
                or document.processing_status != "completed"
                or document_embedding is None
                or document_embedding.embedding_source != source
                or document_embedding.model_name != settings.AI_MODEL_NAME
            ):
                raise HTTPException(
                    status_code=409,
                    detail="Pipeline embedding dokumen belum siap untuk Edit metadata.",
                )

            if source == "metadata_import":
                embedding_text = build_metadata_embedding_text(document, metadata)
                # Imported extracted_text is derived metadata, not PDF content.
                # Replace it so lexical search does not keep the old metadata.
                document.extracted_text = embedding_text
            else:
                if not document.extracted_text or not document.extracted_text.strip():
                    raise HTTPException(
                        status_code=409, detail="Teks Golden Pages tersimpan belum tersedia."
                    )
                category_id, _ = resolve_category(metadata.category)
                if category_id not in CATEGORY_MAPPING:
                    raise HTTPException(status_code=409, detail="Kategori dokumen tidak valid.")
                embedding_text = build_embedding_text(
                    title=metadata.title,
                    file_name=document.file_name,
                    category_id=category_id,
                    year=metadata.year,
                    # Known limitation: upload does not persist this input.
                    # Never guess the original number from PDF text.
                    document_number=None,
                    faculty=metadata.faculty,
                    description=metadata.description,
                    keywords=metadata.keywords,
                    golden_pages_text=document.extracted_text,
                )

            embedding = generate_text_embedding(embedding_text)
            if len(embedding) != settings.AI_EMBEDDING_DIM or not all(
                math.isfinite(value) for value in embedding
            ):
                raise ValueError("Embedding dokumen tidak valid.")
            document_embedding.embedding = embedding
            document.updated_at = datetime.now(timezone.utc)

        response = {
            "status": "success",
            "message": "Metadata dokumen berhasil diperbarui.",
            "data": serialize_document(document, metadata, include_detail=True),
            "meta": {"embedding_regenerated": changed},
        }
        db.commit()
        committed = True
        return response
    except HTTPException:
        if not committed:
            db.rollback()
        raise
    except Exception as error:
        if not committed:
            db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Metadata gagal disimpan. Silakan coba lagi.",
        ) from error


@router.delete("/{document_id}")
def delete_admin_document(
    document_id: int,
    db: Session = Depends(get_db),
):
    """
    Menghapus dokumen admin berdasarkan document_id.

    Endpoint:
    DELETE /api/admin/documents/{document_id}

    Proses:
    1. Cari dokumen berdasarkan ID.
    2. Simpan file_path jika file berasal dari upload lokal.
    3. Hapus document_embeddings.
    4. Hapus document_metadata.
    5. Hapus documents.
    6. Commit database.
    7. Hapus file PDF lokal jika berada di backend/storage/documents/.
    """

    document = (
        db.query(Document)
        .filter(Document.id == document_id)
        .first()
    )

    if not document:
        return JSONResponse(
            status_code=404,
            content={
                "status": "error",
                "message": "Dokumen tidak ditemukan",
                "data": None,
            },
        )

    uploaded_file_path = resolve_uploaded_document_file_path(document.file_path)

    try:
        db.query(DocumentEmbedding).filter(
            DocumentEmbedding.document_id == document_id
        ).delete(synchronize_session=False)

        db.query(DocumentMetadata).filter(
            DocumentMetadata.document_id == document_id
        ).delete(synchronize_session=False)

        db.delete(document)

        db.commit()

    except Exception as error:
        db.rollback()

        return JSONResponse(
            status_code=500,
            content={
                "status": "error",
                "message": f"Gagal menghapus dokumen: {str(error)}",
                "data": None,
            },
        )

    file_deleted = False
    file_delete_note = "Tidak ada file lokal upload yang perlu dihapus."

    if uploaded_file_path is not None:
        try:
            if uploaded_file_path.exists() and uploaded_file_path.is_file():
                uploaded_file_path.unlink()
                file_deleted = True
                file_delete_note = "File lokal berhasil dihapus dari storage."
            else:
                file_delete_note = "File lokal tidak ditemukan, tetapi data database berhasil dihapus."

        except Exception as error:
            file_delete_note = (
                f"Data database berhasil dihapus, tetapi file lokal gagal dihapus: {str(error)}"
            )
            print(
                f"[WARNING] Dokumen ID {document_id} berhasil dihapus dari database, "
                f"tetapi file lokal gagal dihapus: {error}"
            )

    return {
        "status": "success",
        "message": "Dokumen berhasil dihapus",
        "data": {
            "document_id": document_id,
            "file_deleted": file_deleted,
            "note": file_delete_note,
        },
    }
