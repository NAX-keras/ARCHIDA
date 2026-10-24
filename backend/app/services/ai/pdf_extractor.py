from pathlib import Path
from pypdf import PdfReader


def extract_golden_pages_text(file_path: str | Path) -> str:
    """
    Mengekstrak teks dari Golden Pages dokumen PDF.
    Golden Pages ArsipSemantik hanya membaca halaman 1 sampai 2.

    Jika PDF hanya memiliki 1 halaman, fungsi tetap berjalan.
    Jika PDF tidak memiliki teks digital, hasil bisa berupa string kosong.
    """

    pdf_path = Path(file_path)

    if not pdf_path.exists():
        raise FileNotFoundError(f"File PDF tidak ditemukan: {pdf_path}")

    if pdf_path.suffix.lower() != ".pdf":
        raise ValueError("File harus berformat PDF.")

    reader = PdfReader(str(pdf_path))

    if reader.is_encrypted:
        raise ValueError("PDF terenkripsi sehingga tidak dapat diekstrak.")

    total_pages = len(reader.pages)

    if total_pages == 0:
        return ""

    pages_to_read = min(2, total_pages)
    extracted_text = []

    for page_index in range(pages_to_read):
        page = reader.pages[page_index]
        page_text = page.extract_text() or ""

        if page_text.strip():
            extracted_text.append(page_text)

    return "\n\n".join(extracted_text).strip()