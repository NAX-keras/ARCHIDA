import re


def clean_extracted_text(text: str) -> str:
    """
    Membersihkan teks hasil ekstraksi PDF secara ringan.

    Preprocessing ini bertujuan mengurangi noise tanpa mengubah makna teks.
    Cocok digunakan sebelum teks diproses menjadi embedding DistilBERT.
    """

    if not text:
        return ""

    cleaned_text = text

    # Hapus karakter null
    cleaned_text = cleaned_text.replace("\x00", " ")

    # Normalisasi line ending
    cleaned_text = cleaned_text.replace("\r\n", "\n")
    cleaned_text = cleaned_text.replace("\r", "\n")

    # Gabungkan kata yang terpotong karena pindah baris
    # Contoh: "seman-\ntik" menjadi "semantik"
    cleaned_text = re.sub(r"-\s*\n\s*", "", cleaned_text)

    # Hapus spasi dan tab berlebihan
    cleaned_text = re.sub(r"[ \t]+", " ", cleaned_text)

    # Rapikan setiap baris dan buang noise ringan
    lines = []
    for line in cleaned_text.split("\n"):
        line = line.strip()

        if not line:
            continue

        # Hapus nomor halaman angka pendek saja
        # Contoh: 1, 2, 15, 123
        # Angka panjang seperti tahun, NIM, nomor surat, atau kode dokumen tetap dipertahankan
        if re.fullmatch(r"\d{1,3}", line):
            continue

        # Hapus nomor halaman romawi sederhana
        # Contoh: i, ii, iii, iv, v
        if re.fullmatch(r"[ivxlcdm]+", line.lower()):
            continue

        lines.append(line)

    cleaned_text = "\n".join(lines)

    # Batasi enter berlebihan
    cleaned_text = re.sub(r"\n{3,}", "\n\n", cleaned_text)

    return cleaned_text.strip()