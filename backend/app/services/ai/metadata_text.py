from app.models.document import Document
from app.models.document_metadata import DocumentMetadata


CATEGORY_MAPPING = {
    1: "Foto",
    3: "Surat Keputusan",
    4: "Surat Menyurat",
    5: "Sertifikat Akreditasi",
    6: "Panduan dan Pedoman",
    7: "Laporan Kegiatan",
    8: "SOP",
}


def resolve_category_label(raw_category):
    if raw_category is None:
        return None

    raw_text = str(raw_category).strip()

    if raw_text == "":
        return None

    try:
        raw_number = float(raw_text)

        if raw_number.is_integer():
            category_id = int(raw_number)
            return CATEGORY_MAPPING.get(category_id, f"Kategori {category_id}")

    except ValueError:
        pass

    return raw_text


def build_embedding_text(document: Document, metadata: DocumentMetadata) -> str:
    """
    Membuat teks gabungan untuk embedding dokumen metadata_import.
    """

    category_label = resolve_category_label(metadata.category)

    parts = [
        f"Judul: {metadata.title}" if metadata.title else None,
        f"Nama File: {document.file_name}" if document.file_name else None,
        f"Kategori: {category_label}" if category_label else None,
        f"Jenis Dokumen: {metadata.document_type}" if metadata.document_type else None,
        f"Tahun: {metadata.year}" if metadata.year else None,
        f"Unit/Fakultas: {metadata.faculty}" if metadata.faculty else None,
        f"Kata Kunci: {metadata.keywords}" if metadata.keywords else None,
        f"Deskripsi: {metadata.description}" if metadata.description else None,
    ]

    return "\n".join(part for part in parts if part)


