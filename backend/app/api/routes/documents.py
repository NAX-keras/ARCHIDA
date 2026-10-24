from datetime import timezone, timedelta
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse, JSONResponse
from sqlalchemy import case, func, or_
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.models.document import Document
from app.models.document_metadata import DocumentMetadata
from app.schemas.document_access import UpdateDocumentAccessRequest
from app.models.user import User
from app.services.document_download_service import (
    UnsupportedDocument, inspect_download_format, safe_download_name,
)
from app.services.auth.dependencies import (
    get_current_user, require_admin, filter_visible_documents,
)


router = APIRouter(prefix="/documents", tags=["Documents"])


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

WIB_TIMEZONE = timezone(timedelta(hours=7))


def get_backend_directory() -> Path:
    """
    Mengambil lokasi folder backend.

    Posisi file:
    backend/app/api/routes/documents.py

    parents[3] = backend/
    """

    return Path(__file__).resolve().parents[3]


def resolve_safe_storage_file_path(file_path: str | None) -> Path | None:
    """
    Mengubah file_path dari database menjadi path file lokal yang aman.

    Ketentuan keamanan:
    - Hanya file di dalam backend/storage/ yang boleh diakses.
    - Tidak menerima path langsung dari request user.
    - Mencegah path traversal seperti ../.
    - Jika file_path metadata_import tidak mengarah ke storage lokal, return None.
    """

    if not file_path:
        return None

    backend_dir = get_backend_directory()
    storage_dir = (backend_dir / "storage").resolve()

    candidate_path = Path(file_path)

    if candidate_path.is_absolute():
        resolved_path = candidate_path.resolve()
    else:
        resolved_path = (backend_dir / candidate_path).resolve()

    try:
        resolved_path.relative_to(storage_dir)
    except ValueError:
        return None

    return resolved_path


def convert_to_wib(value):
    """
    Mengubah datetime dari database menjadi waktu WIB.

    Catatan:
    - Jika datetime dari database belum memiliki timezone, dianggap sebagai UTC.
    - Response dikirim dalam format ISO 8601 dengan offset +07:00.
    """

    if value is None:
        return None

    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)

    return value.astimezone(WIB_TIMEZONE).isoformat()


def resolve_category(raw_category):
    """
    Mengubah nilai category dari database menjadi category_id dan nama kategori.

    Kondisi:
    - Dataset asli memakai categoryId.
    - Nilai category di document_metadata bisa tersimpan sebagai angka/string angka.
    - Frontend membutuhkan nama kategori, bukan angka.
    """

    if raw_category is None:
        return None, None

    raw_text = str(raw_category).strip()

    if raw_text == "":
        return None, None

    try:
        raw_number = float(raw_text)

        if raw_number.is_integer():
            category_id = int(raw_number)
            category_name = CATEGORY_MAPPING.get(
                category_id,
                f"Kategori {category_id}",
            )
            return category_id, category_name

    except ValueError:
        pass

    return None, raw_text


def get_category_filter_values(category_id: int):
    """
    Membuat daftar kemungkinan nilai category yang tersimpan di database.

    Contoh category_id 3 bisa tersimpan sebagai:
    - "3"
    - "3.0"
    - "Surat Keputusan"
    """

    values = [
        str(category_id),
        f"{category_id}.0",
    ]

    category_name = CATEGORY_MAPPING.get(category_id)

    if category_name:
        values.append(category_name)

    return values


def serialize_document(
    document: Document,
    metadata: DocumentMetadata | None = None,
    include_detail: bool = False,
):
    """
    Mengubah data Document + DocumentMetadata menjadi response flat.
    """

    raw_category = metadata.category if metadata else None
    category_id, category_name = resolve_category(raw_category)

    item = {
        "id": document.id,
        "uploaded_by": document.uploaded_by,
        "file_name": document.file_name,
        "file_type": document.file_type,
        "file_size": document.file_size,
        "processing_status": document.processing_status,
        "extraction_method": document.extraction_method,

        # Metadata flat untuk frontend
        "title": metadata.title if metadata and metadata.title else document.file_name,
        "category_id": category_id,
        "category": category_name,
        "document_type": metadata.document_type if metadata else None,
        "year": metadata.year if metadata else None,
        "faculty": metadata.faculty if metadata else None,
        "description": metadata.description if metadata else None,
        "keywords": metadata.keywords if metadata else None,

        # Access level asli dari database
        "access_level": metadata.access_level if metadata and metadata.access_level else "PUBLIC",

        # Waktu dikirim dalam WIB
        "created_at": convert_to_wib(document.created_at),
        "updated_at": convert_to_wib(document.updated_at),
    }

    if include_detail:
        item["file_path"] = document.file_path
        item["extracted_text"] = document.extracted_text

    return item


def apply_document_filters(
    query,
    category_id: int | None = None,
    access_level: str | None = None,
    search: str | None = None,
):
    """
    Menerapkan filter gabungan untuk GET /api/documents.

    Filter yang didukung:
    - search
    - category_id
    - access_level
    """

    if category_id is not None:
        category_filter_values = get_category_filter_values(category_id)

        query = query.filter(
            DocumentMetadata.category.in_(category_filter_values)
        )

    if access_level is not None:
        if access_level == "PUBLIC":
            query = query.filter(
                or_(
                    DocumentMetadata.access_level == "PUBLIC",
                    DocumentMetadata.access_level.is_(None),
                )
            )

        elif access_level == "PRIVATE":
            query = query.filter(
                DocumentMetadata.access_level == "PRIVATE"
            )

    if search is not None:
        search_text = search.strip()

        if search_text:
            search_pattern = f"%{search_text}%"

            query = query.filter(
                or_(
                    DocumentMetadata.title.ilike(search_pattern),
                    Document.file_name.ilike(search_pattern),
                    DocumentMetadata.description.ilike(search_pattern),
                    DocumentMetadata.keywords.ilike(search_pattern),
                )
            )

    return query


@router.get("/category-summary")
def get_document_category_summary(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Mengambil ringkasan jumlah dokumen per kategori.

    Endpoint:
    GET /api/documents/category-summary
    """

    summary_query = (
        db.query(
            DocumentMetadata.category.label("raw_category"),
            func.count(Document.id).label("total"),
            func.sum(
                case(
                    (
                        or_(
                            DocumentMetadata.access_level.is_(None),
                            DocumentMetadata.access_level == "PUBLIC",
                        ),
                        1,
                    ),
                    else_=0,
                )
            ).label("public_count"),
            func.sum(
                case(
                    (
                        DocumentMetadata.access_level == "PRIVATE",
                        1,
                    ),
                    else_=0,
                )
            ).label("private_count"),
        )
        .select_from(Document)
        .outerjoin(
            DocumentMetadata,
            Document.id == DocumentMetadata.document_id,
        )
    )
    rows = filter_visible_documents(summary_query, current_user).group_by(
        DocumentMetadata.category
    ).all()

    summary_map = {}

    for row in rows:
        category_id, category_name = resolve_category(row.raw_category)

        if category_id is None and category_name is None:
            category_name = "Tanpa Kategori"

        key = category_id if category_id is not None else f"label:{category_name}"

        if key not in summary_map:
            summary_map[key] = {
                "category_id": category_id,
                "category": category_name,
                "total": 0,
                "public_count": 0,
                "private_count": 0,
            }

        summary_map[key]["total"] += int(row.total or 0)
        summary_map[key]["public_count"] += int(row.public_count or 0)
        summary_map[key]["private_count"] += int(row.private_count or 0)

    data = list(summary_map.values())

    data.sort(
        key=lambda item: (
            item["category_id"] is None,
            item["category_id"] if item["category_id"] is not None else 9999,
            item["category"] or "",
        )
    )

    return {
        "status": "success",
        "message": "Document category summary retrieved successfully",
        "data": data,
        "meta": {
            "total_categories": len(data),
        },
    }


@router.get("")
def get_documents(
    search: str | None = Query(default=None),
    category_id: int | None = Query(default=None, ge=1),
    access_level: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Mengambil daftar dokumen untuk repository mahasiswa/admin.

    Endpoint:
    GET /api/documents?limit=50&offset=0
    GET /api/documents?search=wisuda&limit=50&offset=0
    GET /api/documents?category_id=3&limit=50&offset=0
    GET /api/documents?access_level=PUBLIC&limit=50&offset=0
    GET /api/documents?search=wisuda&category_id=3&access_level=PUBLIC&limit=50&offset=0
    """

    normalized_access_level = None
    normalized_search = None

    if access_level is not None:
        normalized_access_level = access_level.strip().upper()

        if normalized_access_level not in ALLOWED_ACCESS_LEVELS:
            raise HTTPException(
                status_code=400,
                detail="access_level hanya boleh bernilai PUBLIC atau PRIVATE.",
            )

    if search is not None:
        normalized_search = search.strip()

        if normalized_search == "":
            normalized_search = None

    base_query = (
        db.query(Document, DocumentMetadata)
        .outerjoin(
            DocumentMetadata,
            Document.id == DocumentMetadata.document_id,
        )
    )

    total_query = (
        db.query(func.count(Document.id))
        .select_from(Document)
        .outerjoin(
            DocumentMetadata,
            Document.id == DocumentMetadata.document_id,
        )
    )

    base_query = filter_visible_documents(base_query, current_user)
    total_query = filter_visible_documents(total_query, current_user)

    base_query = apply_document_filters(
        query=base_query,
        category_id=category_id,
        access_level=normalized_access_level,
        search=normalized_search,
    )

    total_query = apply_document_filters(
        query=total_query,
        category_id=category_id,
        access_level=normalized_access_level,
        search=normalized_search,
    )

    total = total_query.scalar() or 0

    rows = (
        base_query
        .order_by(Document.id.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )

    data = [
        serialize_document(
            document=document,
            metadata=metadata,
            include_detail=False,
        )
        for document, metadata in rows
    ]

    return {
        "status": "success",
        "message": "Documents retrieved successfully",
        "data": data,
        "meta": {
            "total": total,
            "limit": limit,
            "offset": offset,
            "search": normalized_search,
            "category_id": category_id,
            "access_level": normalized_access_level,
        },
    }


@router.get("/{document_id}/download")
def download_document_file(
    document_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Mengunduh file PDF/JPEG/PNG asli berdasarkan document_id.

    Endpoint:
    GET /api/documents/{document_id}/download

    Catatan:
    - File diambil dari documents.file_path.
    - Hanya file di backend/storage/ yang boleh diakses.
    - Dokumen metadata_import yang belum punya file fisik akan return 404 aman.
    """

    document_query = (
        db.query(Document)
        .outerjoin(DocumentMetadata, Document.id == DocumentMetadata.document_id)
        .filter(Document.id == document_id)
    )
    document = filter_visible_documents(document_query, current_user).first()

    if not document:
        return JSONResponse(
            status_code=404,
            content={
                "status": "error",
                "message": "Dokumen tidak ditemukan.",
                "data": None,
            },
        )

    try:
        real_file_path = resolve_safe_storage_file_path(document.file_path)
    except (OSError, ValueError, RuntimeError):
        real_file_path = None

    if real_file_path is None:
        return JSONResponse(
            status_code=404,
            content={
                "status": "error",
                "message": "File asli dokumen belum tersedia.",
                "data": None,
            },
        )

    if not real_file_path.exists() or not real_file_path.is_file():
        return JSONResponse(
            status_code=404,
            content={
                "status": "error",
                "message": "File asli dokumen belum tersedia.",
                "data": None,
            },
        )

    try:
        media_type = inspect_download_format(real_file_path)
    except OSError:
        return JSONResponse(status_code=404, content={
            "status": "error", "message": "File asli dokumen belum tersedia.", "data": None,
        })
    except UnsupportedDocument:
        return JSONResponse(
            status_code=400,
            content={
                "status": "error",
                "message": "Format file tidak didukung atau file tidak valid.",
                "data": None,
            },
        )

    download_filename = safe_download_name(document.file_name, real_file_path, media_type)

    return FileResponse(
        path=str(real_file_path),
        media_type=media_type,
        filename=download_filename,
        headers={"Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"},
    )


@router.get("/{document_id}")
def get_document_by_id(
    document_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Mengambil detail dokumen berdasarkan ID.

    Endpoint:
    GET /api/documents/{id}
    """

    document_query = (
        db.query(Document, DocumentMetadata)
        .outerjoin(
            DocumentMetadata,
            Document.id == DocumentMetadata.document_id,
        )
        .filter(Document.id == document_id)
    )
    row = filter_visible_documents(document_query, current_user).first()

    if not row:
        raise HTTPException(
            status_code=404,
            detail="Document not found",
        )

    document, metadata = row

    return {
        "status": "success",
        "message": "Document retrieved successfully",
        "data": serialize_document(
            document=document,
            metadata=metadata,
            include_detail=True,
        ),
    }


@router.patch("/{document_id}/access")
def update_document_access_level(
    document_id: int,
    payload: UpdateDocumentAccessRequest,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """
    Mengubah access_level dokumen.

    Endpoint:
    PATCH /api/documents/{id}/access

    Request:
    {
        "access_level": "PUBLIC"
    }

    atau:

    {
        "access_level": "PRIVATE"
    }
    """

    requested_access_level = payload.access_level.strip().upper()

    if requested_access_level not in ALLOWED_ACCESS_LEVELS:
        raise HTTPException(
            status_code=400,
            detail="access_level hanya boleh bernilai PUBLIC atau PRIVATE.",
        )

    document = (
        db.query(Document)
        .filter(Document.id == document_id)
        .first()
    )

    if not document:
        raise HTTPException(
            status_code=404,
            detail="Document not found",
        )

    metadata = (
        db.query(DocumentMetadata)
        .filter(DocumentMetadata.document_id == document_id)
        .first()
    )

    if not metadata:
        metadata = DocumentMetadata(
            document_id=document.id,
            title=document.file_name,
            access_level=requested_access_level,
        )
        db.add(metadata)
    else:
        metadata.access_level = requested_access_level

    db.commit()
    db.refresh(metadata)

    return {
        "status": "success",
        "message": "Document access level updated successfully",
        "data": {
            "id": document.id,
            "access_level": metadata.access_level,
        },
    }
