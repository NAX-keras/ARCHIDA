import re
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.config import settings
from app.services.ai.embedding_service import generate_text_embedding


CATEGORY_MAPPING = {
    1: "Foto",
    3: "Surat Keputusan",
    4: "Surat Menyurat",
    5: "Sertifikat Akreditasi",
    6: "Panduan dan Pedoman",
    7: "Laporan Kegiatan",
    8: "SOP",
}


QUERY_EXPANSION_MAPPING = {
    "aturan": ["peraturan"],
    "peraturan": ["aturan"],
    "sk": ["surat keputusan"],
    "surat keputusan": ["sk"],
    "sop": ["standar operasional prosedur"],
    "standar operasional prosedur": ["sop"],
    "panduan": ["pedoman"],
    "pedoman": ["panduan"],
    "kerja sama": ["kerjasama"],
    "kerjasama": ["kerja sama"],
    "akademik": ["peraturan akademik"],
    "pkm": ["pengabdian kepada masyarakat"],
    "pmb": ["penerimaan mahasiswa baru"],

    # Expansion khusus istilah wisuda
    "wisuda": [
        "wisudawan",
        "wisudawati",
        "wisudawan wati",
        "wisudawan wisudawati",
    ],
    "wisudawan": [
        "wisuda",
        "wisudawati",
        "wisudawan wati",
    ],
    "wisudawati": [
        "wisuda",
        "wisudawan",
        "wisudawan wati",
    ],
}


GENERIC_TERMS = {
    "sk",
    "surat keputusan",
    "sop",
    "standar operasional prosedur",
    "pedoman",
    "panduan",
    "buku",
    "dokumen",
}


STOPWORDS = {
    "dan",
    "atau",
    "yang",
    "di",
    "ke",
    "dari",
    "pada",
    "dalam",
    "untuk",
    "dengan",
    "tentang",
    "serta",
    "oleh",
    "ini",
    "itu",
}


ALLOWED_EMBEDDING_SOURCES = [
    "metadata_import",
    "uploaded_pdf_golden_pages",
]


def resolve_category(raw_category):
    """
    Mengubah nilai category dari database menjadi category_id dan nama kategori.
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


def get_category_filter_values(category_id: int) -> dict:
    """
    Membuat kemungkinan nilai category yang tersimpan di database.

    Dataset metadata_import bisa menyimpan kategori sebagai:
    - "3"
    - "3.0"
    - "Surat Keputusan"
    """

    category_name = CATEGORY_MAPPING.get(category_id, "")

    return {
        "category_text": str(category_id),
        "category_float_text": f"{category_id}.0",
        "category_name": category_name,
    }


def normalize_text(value) -> str:
    """
    Normalisasi teks untuk lexical matching.
    Embedding tetap memakai query asli.
    """

    if value is None:
        return ""

    text_value = str(value).lower()
    text_value = re.sub(r"[^a-z0-9\s]", " ", text_value)
    text_value = re.sub(r"\s+", " ", text_value).strip()

    return text_value


def contains_term(text: str, term: str) -> bool:
    """
    Mengecek apakah term muncul di teks.

    - Frasa dicek sebagai substring normal.
    - Token tunggal dicek dengan word boundary agar "sk" tidak match sembarang kata.
    """

    normalized_text = normalize_text(text)
    normalized_term = normalize_text(term)

    if not normalized_text or not normalized_term:
        return False

    if " " in normalized_term:
        return normalized_term in normalized_text

    pattern = rf"\b{re.escape(normalized_term)}\b"
    return re.search(pattern, normalized_text) is not None


def vector_to_pgvector(embedding: list[float]) -> str:
    """
    Mengubah list embedding Python menjadi format string vector PostgreSQL.
    """

    return "[" + ",".join(str(float(value)) for value in embedding) + "]"


def limit_text(value, max_chars: int = 3000) -> str:
    """
    Membatasi teks panjang agar lexical boost tetap ringan.

    extracted_text dari Golden Pages ikut dipakai,
    tetapi dibatasi supaya reranking tetap cepat.
    """

    if value is None:
        return ""

    return str(value)[:max_chars]


def build_expanded_query_terms(query_text: str) -> list[str]:
    """
    Membuat daftar term hasil query expansion sederhana.

    Query asli tetap dipakai untuk embedding.
    Expanded terms hanya dipakai untuk lexical boost.
    """

    normalized_query = normalize_text(query_text)

    terms = []

    def add_term(term: str):
        normalized_term = normalize_text(term)

        if normalized_term and normalized_term not in terms:
            terms.append(normalized_term)

    add_term(normalized_query)

    # Expansion berdasarkan frasa
    for source_term, expanded_values in QUERY_EXPANSION_MAPPING.items():
        normalized_source = normalize_text(source_term)

        if normalized_source and normalized_source in normalized_query:
            for expanded_value in expanded_values:
                add_term(expanded_value)

    # Expansion berdasarkan token query asli
    for token in normalized_query.split():
        add_term(token)

        if token in QUERY_EXPANSION_MAPPING:
            for expanded_value in QUERY_EXPANSION_MAPPING[token]:
                add_term(expanded_value)

    return terms


def build_generic_token_set() -> set[str]:
    """
    Mengambil token dari generic terms.

    Contoh:
    - "surat keputusan" menghasilkan token "surat" dan "keputusan"
    - "standar operasional prosedur" menghasilkan token penyusunnya
    """

    tokens = set()

    for term in GENERIC_TERMS:
        normalized_term = normalize_text(term)

        for token in normalized_term.split():
            if token:
                tokens.add(token)

    return tokens


def analyze_query_terms(query_text: str, expanded_terms: list[str]) -> dict:
    """
    Memisahkan query menjadi generic_terms dan topic_terms.

    Contoh:
    query = "SK wisuda"

    generic_terms:
    - sk
    - surat keputusan

    topic_terms:
    - wisuda
    """

    normalized_query = normalize_text(query_text)
    generic_token_set = build_generic_token_set()

    generic_terms = []
    topic_terms = []
    topic_phrases = []

    def add_unique(target_list: list[str], value: str):
        normalized_value = normalize_text(value)

        if normalized_value and normalized_value not in target_list:
            target_list.append(normalized_value)

    # Deteksi generic terms dari query asli dan expanded terms
    for generic_term in GENERIC_TERMS:
        normalized_generic = normalize_text(generic_term)

        if contains_term(normalized_query, normalized_generic):
            add_unique(generic_terms, normalized_generic)

        for expanded_term in expanded_terms:
            if normalize_text(expanded_term) == normalized_generic:
                add_unique(generic_terms, normalized_generic)

    # Ambil topic terms dari token query asli
    for token in normalized_query.split():
        if token in STOPWORDS:
            continue

        if token in generic_token_set:
            continue

        add_unique(topic_terms, token)

    # Ambil topic terms tambahan dari expansion non-generic
    for term in expanded_terms:
        normalized_term = normalize_text(term)

        if not normalized_term:
            continue

        if normalized_term in GENERIC_TERMS:
            continue

        term_tokens = [
            token
            for token in normalized_term.split()
            if token not in STOPWORDS and token not in generic_token_set
        ]

        if not term_tokens:
            continue

        if " " in normalized_term:
            add_unique(topic_phrases, normalized_term)

        for token in term_tokens:
            add_unique(topic_terms, token)

    return {
        "generic_terms": generic_terms,
        "topic_terms": topic_terms,
        "topic_phrases": topic_phrases,
        "has_generic_and_topic": bool(generic_terms and topic_terms),
    }


def build_token_terms(query_text: str, expanded_terms: list[str]) -> list[str]:
    """
    Mengambil token penting dari query asli dan ekspansi satu kata.
    """

    tokens = []
    normalized_query = normalize_text(query_text)

    def add_token(token: str):
        normalized_token = normalize_text(token)

        if len(normalized_token) < 2:
            return

        if normalized_token in STOPWORDS:
            return

        if normalized_token not in tokens:
            tokens.append(normalized_token)

    # Token dari query asli
    for token in normalized_query.split():
        add_token(token)

    # Hanya expansion satu kata yang dimasukkan sebagai token
    for term in expanded_terms:
        normalized_term = normalize_text(term)

        if " " not in normalized_term:
            add_token(normalized_term)

    return tokens


def count_token_matches(field_text: str, tokens: list[str]) -> int:
    """
    Menghitung jumlah token query yang muncul pada suatu field.
    """

    if not field_text:
        return 0

    count = 0

    for token in tokens:
        if contains_term(field_text, token):
            count += 1

    return count


def calculate_field_boost(
    field_value,
    original_query: str,
    expanded_terms: list[str],
    token_terms: list[str],
    exact_phrase_weight: float,
    expanded_phrase_weight: float,
    token_weight: float,
    token_max: float,
) -> float:
    """
    Menghitung boost untuk satu field teks.
    """

    field_text = normalize_text(field_value)

    if not field_text:
        return 0.0

    boost = 0.0
    normalized_query = normalize_text(original_query)

    # Exact query phrase match
    if normalized_query and contains_term(field_text, normalized_query):
        boost += exact_phrase_weight

    # Expanded phrase match
    for term in expanded_terms:
        if term == normalized_query:
            continue

        if " " in term and contains_term(field_text, term):
            boost += expanded_phrase_weight

    # Token match
    matched_token_count = count_token_matches(field_text, token_terms)
    token_boost = min(matched_token_count * token_weight, token_max)

    boost += token_boost

    return boost


def calculate_topic_match_score(
    topic_terms: list[str],
    topic_phrases: list[str],
    title,
    file_name,
    keywords,
    description,
    extracted_text=None,
) -> float:
    """
    Menghitung skor kecocokan topic term.

    Ini penting untuk query seperti:
    - SK wisuda
    - SOP anggaran
    - pedoman kurikulum
    - proposal skripsi semantic search distilbert arsip

    Generic term seperti SK/SOP/Pedoman/Dokumen tidak boleh dominan
    jika topic term tidak cocok. extracted_text ikut dipakai agar dokumen upload
    hasil Golden Pages tetap bisa naik.
    """

    if not topic_terms and not topic_phrases:
        return 0.0

    all_topics = []

    for term in topic_terms + topic_phrases:
        normalized_term = normalize_text(term)

        if normalized_term and normalized_term not in all_topics:
            all_topics.append(normalized_term)

    extracted_text_limited = limit_text(extracted_text)

    score = 0.0

    for topic in all_topics:
        if contains_term(title, topic):
            score += 0.20

        if contains_term(file_name, topic):
            score += 0.18

        if contains_term(keywords, topic):
            score += 0.16

        if contains_term(description, topic):
            score += 0.08

        if contains_term(extracted_text_limited, topic):
            score += 0.10

    return round(min(score, 0.40), 4)


def has_generic_match(
    generic_terms: list[str],
    title,
    file_name,
    keywords,
    description,
    extracted_text=None,
) -> bool:
    """
    Mengecek apakah dokumen match minimal satu generic term.
    """

    combined_text = normalize_text(
        f"{title or ''} "
        f"{file_name or ''} "
        f"{keywords or ''} "
        f"{description or ''} "
        f"{limit_text(extracted_text) or ''}"
    )

    for term in generic_terms:
        if contains_term(combined_text, term):
            return True

    return False


def calculate_lexical_boost(
    query_text: str,
    title,
    file_name,
    keywords,
    description,
    extracted_text=None,
) -> float:
    """
    Menghitung lexical boost berdasarkan:
    - title
    - file_name
    - keywords
    - description
    - extracted_text Golden Pages

    Generic term seperti SK/SOP/Pedoman/Dokumen tidak boleh mendominasi.
    Jika query memiliki generic term + topic term, dokumen harus match topic term
    agar mendapat boost tinggi.
    """

    expanded_terms = build_expanded_query_terms(query_text)
    token_terms = build_token_terms(query_text, expanded_terms)
    term_analysis = analyze_query_terms(query_text, expanded_terms)

    boost = 0.0

    normalized_query = normalize_text(query_text)
    extracted_text_limited = limit_text(extracted_text)

    combined_text = normalize_text(
        f"{title or ''} "
        f"{file_name or ''} "
        f"{keywords or ''} "
        f"{description or ''} "
        f"{extracted_text_limited or ''}"
    )

    # Boost khusus frasa peraturan akademik.
    # Ini bukan hardcode ID tertentu, tetapi aturan umum untuk dokumen yang benar-benar
    # memuat frasa "peraturan akademik" saat user mencari aturan/peraturan akademik.
    if (
        ("aturan akademik" in normalized_query or "peraturan akademik" in normalized_query)
        and "peraturan akademik" in combined_text
    ):
        boost += 0.30

    # Boost khusus jika query lengkap muncul di Golden Pages.
    # Ini penting untuk dokumen upload admin, karena judul asli proposal sering muncul
    # di extracted_text, bukan di metadata title.
    if normalized_query and contains_term(extracted_text_limited, normalized_query):
        boost += 0.35

    # Judul adalah sinyal paling kuat
    boost += calculate_field_boost(
        field_value=title,
        original_query=query_text,
        expanded_terms=expanded_terms,
        token_terms=token_terms,
        exact_phrase_weight=0.24,
        expanded_phrase_weight=0.18,
        token_weight=0.035,
        token_max=0.14,
    )

    # Nama file juga penting karena arsip sering memakai nama file formal
    boost += calculate_field_boost(
        field_value=file_name,
        original_query=query_text,
        expanded_terms=expanded_terms,
        token_terms=token_terms,
        exact_phrase_weight=0.20,
        expanded_phrase_weight=0.16,
        token_weight=0.03,
        token_max=0.12,
    )

    # Keywords penting karena berasal dari metadata
    boost += calculate_field_boost(
        field_value=keywords,
        original_query=query_text,
        expanded_terms=expanded_terms,
        token_terms=token_terms,
        exact_phrase_weight=0.18,
        expanded_phrase_weight=0.14,
        token_weight=0.03,
        token_max=0.12,
    )

    # Description dipakai, tetapi bobotnya lebih kecil agar tidak terlalu dominan
    boost += calculate_field_boost(
        field_value=description,
        original_query=query_text,
        expanded_terms=expanded_terms,
        token_terms=token_terms,
        exact_phrase_weight=0.08,
        expanded_phrase_weight=0.06,
        token_weight=0.012,
        token_max=0.07,
    )

    # extracted_text dipakai khusus untuk dokumen upload Golden Pages.
    # Bobotnya lebih kecil dari title, tetapi cukup kuat untuk exact content match.
    boost += calculate_field_boost(
        field_value=extracted_text_limited,
        original_query=query_text,
        expanded_terms=expanded_terms,
        token_terms=token_terms,
        exact_phrase_weight=0.16,
        expanded_phrase_weight=0.10,
        token_weight=0.018,
        token_max=0.16,
    )

    # Generic + topic gate
    # Contoh: "SK wisuda", "SOP anggaran", "dokumen arsip distilbert".
    # Jika dokumen hanya cocok generic term tapi tidak cocok topic term,
    # boost dibatasi agar tidak mengalahkan dokumen dengan topic yang benar.
    if term_analysis["has_generic_and_topic"]:
        topic_match_score = calculate_topic_match_score(
            topic_terms=term_analysis["topic_terms"],
            topic_phrases=term_analysis["topic_phrases"],
            title=title,
            file_name=file_name,
            keywords=keywords,
            description=description,
            extracted_text=extracted_text_limited,
        )

        generic_match = has_generic_match(
            generic_terms=term_analysis["generic_terms"],
            title=title,
            file_name=file_name,
            keywords=keywords,
            description=description,
            extracted_text=extracted_text_limited,
        )

        if topic_match_score <= 0:
            return round(min(boost, 0.08), 4)

        boost += topic_match_score

        if generic_match:
            boost += 0.12

    max_boost = 1.25

    return round(min(boost, max_boost), 4)


def build_snippet(description, extracted_text) -> str | None:
    """
    Membuat snippet hasil pencarian.
    """

    if description and str(description).strip():
        return str(description).strip()[:250]

    if extracted_text and str(extracted_text).strip():
        return str(extracted_text).strip()[:250]

    return None


def semantic_search(
    db: Session,
    query_text: str,
    limit: int = 5,
    category_id: int | None = None,
    year: int | None = None,
    include_private: bool = False,
):
    """
    Semantic search dokumen arsip.

    - Query asli tetap dipakai untuk embedding DistilBERT.
    - Pgvector mengambil kandidat berdasarkan semantic similarity.
    - Filter kategori dan tahun bersifat opsional.
    - Backend melakukan reranking dengan lexical/title/topic boost.
    - Dokumen metadata_import dan uploaded_pdf_golden_pages sama-sama dicari.
    - Response JSON tetap kompatibel dengan frontend.
    """

    if query_text is None or not str(query_text).strip():
        raise ValueError("Query pencarian tidak boleh kosong.")

    safe_limit = max(1, min(int(limit), 50))

    # Dataset aktif sekitar 702+ dokumen.
    # Candidate 1000 masih aman untuk lokal dan memberi ruang reranking hybrid.
    candidate_limit = max(safe_limit * 100, 1000)
    candidate_limit = min(candidate_limit, 1000)

    query_embedding = generate_text_embedding(query_text)
    query_vector = vector_to_pgvector(query_embedding)

    where_clauses = [
        "de.model_name = :model_name",

        # Perbaikan utama:
        # Sebelumnya hanya metadata_import, sehingga upload admin tidak ikut dicari.
        """
        de.embedding_source IN (
            'metadata_import',
            'uploaded_pdf_golden_pages'
        )
        """,

        # Aman untuk dokumen upload admin dan metadata_import.
        # COALESCE menjaga data lama yang mungkin belum punya status tetap tidak crash.
        "COALESCE(d.processing_status, 'completed') = 'completed'",
    ]

    params = {
        "query_vector": query_vector,
        "model_name": settings.AI_MODEL_NAME,
        "candidate_limit": candidate_limit,
    }

    # Filter access before candidate selection and reranking. Only the route
    # may enable private access, based on the authenticated database role.
    if not include_private:
        where_clauses.append("dm.access_level = 'PUBLIC'")

    if category_id is not None:
        category_values = get_category_filter_values(category_id)

        where_clauses.append(
            """
            (
                dm.category = :category_text
                OR dm.category = :category_float_text
                OR dm.category = :category_name
            )
            """
        )

        params.update(category_values)

    if year is not None:
        where_clauses.append("dm.year = :year")
        params["year"] = year

    where_sql = " AND ".join(where_clauses)

    sql = text(
        f"""
        SELECT
            d.id AS document_id,
            COALESCE(dm.title, d.file_name) AS title,
            d.file_name AS file_name,
            dm.category AS raw_category,
            dm.year AS year,
            dm.access_level AS access_level,
            dm.keywords AS keywords,
            dm.description AS description,
            d.extracted_text AS extracted_text,
            d.processing_status AS processing_status,
            de.embedding_source AS embedding_source,
            (de.embedding <=> CAST(:query_vector AS vector)) AS cosine_distance,
            (1 - (de.embedding <=> CAST(:query_vector AS vector))) AS semantic_score
        FROM document_embeddings de
        JOIN documents d
            ON d.id = de.document_id
        LEFT JOIN document_metadata dm
            ON dm.document_id = d.id
        WHERE {where_sql}
        ORDER BY de.embedding <=> CAST(:query_vector AS vector)
        LIMIT :candidate_limit
        """
    )

    rows = (
        db.execute(
            sql,
            params,
        )
        .mappings()
        .all()
    )

    ranked_results = []

    for row in rows:
        semantic_score = float(row["semantic_score"] or 0.0)
        cosine_distance = float(row["cosine_distance"] or 0.0)

        lexical_boost = calculate_lexical_boost(
            query_text=query_text,
            title=row["title"],
            file_name=row["file_name"],
            keywords=row["keywords"],
            description=row["description"],
            extracted_text=row["extracted_text"],
        )

        ranking_score = semantic_score + lexical_boost

        # similarity_score dikunci maksimal 1.0 agar UI tidak menampilkan skor di atas 100%
        final_score = min(ranking_score, 1.0)

        category_id_value, category_name = resolve_category(row["raw_category"])

        ranked_results.append(
            {
                "document_id": row["document_id"],
                "title": row["title"],
                "file_name": row["file_name"],
                "category_id": category_id_value,
                "category": category_name,
                "year": row["year"],
                "access_level": row["access_level"],
                "cosine_distance": round(cosine_distance, 4),

                # Untuk kompatibilitas frontend lama
                "similarity_score": round(final_score, 4),

                # Field tambahan untuk debugging backend
                "semantic_score": round(semantic_score, 4),
                "lexical_boost": round(lexical_boost, 4),
                "final_score": round(final_score, 4),
                "ranking_score": round(ranking_score, 4),
                "embedding_source": row["embedding_source"],
                "processing_status": row["processing_status"],

                "snippet": build_snippet(
                    description=row["description"],
                    extracted_text=row["extracted_text"],
                ),
            }
        )

    ranked_results.sort(
        key=lambda item: (
            item["ranking_score"],
            item["semantic_score"],
        ),
        reverse=True,
    )

    return ranked_results[:safe_limit]
