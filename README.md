# ArsipSemantik

ArsipSemantik adalah aplikasi semantic search untuk dokumen arsip universitas berbasis web interaktif.

## Keputusan Teknis Final

- Backend: FastAPI
- Database: PostgreSQL + pgvector
- Model AI: pre-trained DistilBERT dari Hugging Face
- Training/fine-tuning: tidak dilakukan
- Ekstraksi PDF: Golden Pages halaman 1–2
- Dataset lama: Batch Import Script
- Evaluasi: TF-IDF vs DistilBERT
- Metrik evaluasi: Precision, Recall, dan F1-Score
- Pengembangan awal: lokal di laptop HP Victus

## Modul Utama

1. Backend FastAPI
2. Frontend Web
3. Database PostgreSQL + pgvector
4. AI/PDF Processing DistilBERT + Golden Pages
5. Evaluasi Sistem TF-IDF vs DistilBERT
