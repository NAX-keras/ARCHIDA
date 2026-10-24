# ARCHIDA

**Archive Intelligence with DistilBERT for UNIDA**

ARCHIDA adalah aplikasi berbasis web untuk pencarian semantik dokumen arsip Universitas Darussalam Gontor. Sistem dirancang untuk membantu pengguna menemukan dokumen berdasarkan makna dan konteks kueri, tidak hanya berdasarkan kecocokan kata secara literal.

Project ini dikembangkan sebagai bagian dari penelitian skripsi mengenai implementasi **DistilBERT** untuk semantic search pada dokumen arsip universitas.

---

## Overview

ARCHIDA menyediakan sistem pengelolaan dan pencarian arsip yang mengintegrasikan:

- semantic search berbasis DistilBERT,
- hybrid ranking untuk meningkatkan relevansi hasil pencarian,
- PostgreSQL dengan ekstensi pgvector untuk penyimpanan embedding,
- autentikasi dan role-based access,
- repository dokumen,
- preview dan download dokumen,
- serta antarmuka web untuk pengguna dan administrator.

Sistem mendukung dokumen arsip dalam format **PDF, JPEG, dan PNG**.

---

## Tech Stack

### Frontend

- React
- Vite
- Tailwind CSS

### Backend

- FastAPI
- SQLAlchemy
- Python

### Database

- PostgreSQL
- pgvector

### Semantic Search

- DistilBERT
- Hugging Face Transformers
- 768-dimensional document embeddings
- Cosine similarity
- Hybrid semantic and lexical ranking

Model utama yang digunakan:

```text
cahya/distilbert-base-indonesian
```

---

## Main Features

### Student / User

- Login dan autentikasi pengguna
- Semantic document search
- Filter dokumen berdasarkan metadata
- Ranking hasil pencarian berdasarkan relevansi
- Repository arsip
- Detail dokumen
- Preview dokumen
- Download dokumen sesuai hak akses
- Dukungan dokumen PDF dan gambar

### Administrator

- Dashboard administrator
- Repository management
- Upload dokumen
- Edit metadata dokumen
- Pengaturan akses PUBLIC / PRIVATE
- Preview dokumen
- Download dokumen
- Pengelolaan arsip

---

## Semantic Retrieval

ARCHIDA menggunakan representasi teks dari metadata dokumen sebagai input utama proses semantic retrieval.

Representasi tersebut diubah menjadi embedding menggunakan pretrained Indonesian DistilBERT. Embedding dokumen disimpan pada PostgreSQL menggunakan pgvector dan dibandingkan dengan embedding kueri menggunakan cosine similarity.

Ranking akhir menggunakan pendekatan hybrid yang menggabungkan sinyal semantic similarity dengan informasi lexical dan topic-related signals untuk meningkatkan kualitas hasil pencarian.

Model yang digunakan pada sistem production tetap menggunakan **pre-trained DistilBERT**.

Eksperimen fine-tuning dan pendekatan retrieval alternatif dilakukan dalam proses penelitian, tetapi konfigurasi yang tidak meningkatkan kualitas retrieval tidak diadopsi ke sistem production.

---

## System Architecture

```text
User
  │
  ▼
React + Vite Frontend
  │
  │ REST API
  ▼
FastAPI Backend
  │
  ├── Authentication & Authorization
  ├── Document Management
  ├── Semantic Search
  ├── Hybrid Ranking
  └── File Access
  │
  ▼
PostgreSQL + pgvector
  │
  ├── Users
  ├── Documents
  ├── Document Metadata
  └── Document Embeddings
```

File dokumen fisik dikelola secara terpisah dari database. Database menyimpan metadata, informasi akses, lokasi file, dan embedding dokumen.

---

## Project Structure

```text
ARCHIDA/
├── backend/
│   ├── alembic/
│   ├── app/
│   │   ├── api/
│   │   ├── core/
│   │   ├── database/
│   │   ├── models/
│   │   ├── schemas/
│   │   └── services/
│   ├── scripts/
│   └── requirements.txt
│
├── frontend/
│   ├── public/
│   ├── src/
│   │   ├── assets/
│   │   ├── auth/
│   │   ├── components/
│   │   ├── layouts/
│   │   ├── pages/
│   │   ├── routes/
│   │   ├── services/
│   │   └── utils/
│   └── package.json
│
├── database/
├── docs/
├── references/
├── scripts/
├── compose.yaml
└── README.md
```

---

## Environment Configuration

Environment variable lokal tidak disimpan pada repository.

Gunakan file berikut sebagai template konfigurasi:

```text
.env.example
backend/.env.example
```

Beberapa konfigurasi utama meliputi:

```env
APP_NAME=ArsipSemantik
APP_ENV=development

AI_MODEL_NAME=cahya/distilbert-base-indonesian
AI_EMBEDDING_DIM=768
AI_MODEL_TYPE=huggingface

DATABASE_URL=postgresql+psycopg2://DB_USER:DB_PASSWORD@localhost:5433/arsipsemantik_db

SESSION_SECRET_KEY=CHANGE_ME
```

> Jangan menyimpan password database, session secret, token, atau credential production di repository.

---

## Document Storage

Dokumen operasional tidak disimpan di repository Git.

Pada environment lokal, file dokumen berada pada:

```text
backend/storage/
```

Folder tersebut diabaikan melalui `.gitignore`.

Storage untuk environment production harus dikonfigurasi secara terpisah dari source code dan database.

---

## Research Context

ARCHIDA dikembangkan dalam penelitian:

**“Aplikasi Semantic Search untuk Dokumen Arsip Berbasis DistilBERT dengan Antarmuka Web Interaktif — Studi Kasus Universitas Darussalam Gontor.”**

Evaluasi penelitian menggunakan ukuran relevansi Information Retrieval seperti:

- Precision@5
- Recall@5
- F1-Score@5

Eksperimen penelitian dan konfigurasi alternatif dipisahkan dari fitur utama aplikasi production.

---

## Repository Status

Repository ini berisi source code aplikasi ARCHIDA yang digunakan sebagai basis deployment dan pengembangan sistem.

Data rahasia, environment production, dataset penelitian, checkpoint eksperimen, backup, dan dokumen arsip operasional tidak disimpan di Git repository.

---

## Author

**Muhammad Rizqi Anugrah**

Universitas Darussalam Gontor

---

## Academic Project

Project ini dikembangkan untuk kepentingan penelitian akademik dan pengembangan sistem semantic search arsip Universitas Darussalam Gontor.