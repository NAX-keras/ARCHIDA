# Catatan Bab IV - Kick-off Project

Pada tanggal 1 Juli 2026, pengembangan sistem ArsipSemantik dimulai dengan tahap kick-off proyek dan penataan rencana kerja. Tahap ini berfokus pada pembuatan struktur folder project, penetapan fitur prioritas, pembagian modul utama, serta pembatasan scope agar implementasi tetap sesuai dengan kebutuhan proposal dan target sidang.

ArsipSemantik dikembangkan sebagai aplikasi semantic search untuk dokumen arsip universitas berbasis web interaktif. Teknologi utama yang digunakan adalah FastAPI sebagai backend, PostgreSQL dengan pgvector sebagai database, serta pre-trained DistilBERT dari Hugging Face sebagai model representasi teks. Sistem tidak melakukan training maupun fine-tuning model. Ekstraksi PDF menggunakan strategi Golden Pages, yaitu halaman 1–2 dokumen.
