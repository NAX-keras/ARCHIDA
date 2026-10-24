import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import StudentNavbar from "../../layouts/StudentNavbar";
import SearchResultCard from "../../components/documents/SearchResultCard";
import { getDocuments, searchDocuments } from "../../services/api";

// Keep these options aligned with the current frontend until the backend is audited.
const CATEGORY_OPTIONS = [
  { value: "ALL", label: "Semua Kategori" },
  { value: "1", label: "Foto" },
  { value: "3", label: "Surat Keputusan" },
  { value: "4", label: "Surat Menyurat" },
  { value: "5", label: "Sertifikat Akreditasi" },
  { value: "6", label: "Panduan dan Pedoman" },
  { value: "7", label: "Laporan Kegiatan" },
  { value: "8", label: "SOP" },
];

const YEAR_OPTIONS = ["ALL", "2026", "2025", "2024", "2023", "2022", "2021", "2020", "2019", "2018"];
const QUICK_QUERY_OPTIONS = [
  "peraturan akademik",
  "SK wisuda",
  "MBKM",
  "SOP anggaran",
  "penerimaan mahasiswa baru",
];

function validOption(value, options) {
  return options.some((item) => (typeof item === "string" ? item : item.value) === value)
    ? value
    : "ALL";
}

function createSearchUrl(query, year, category) {
  const params = new URLSearchParams({ q: query.trim() });
  if (year !== "ALL") params.set("year", year);
  if (category !== "ALL") params.set("category", category);
  return params;
}

function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState("");
  const [selectedYear, setSelectedYear] = useState("ALL");
  const [selectedCategory, setSelectedCategory] = useState("ALL");
  const [results, setResults] = useState([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [inputError, setInputError] = useState("");
  const [availableDocumentCount, setAvailableDocumentCount] = useState(null);
  const [countLoading, setCountLoading] = useState(true);

  // Sequence IDs ignore stale responses without changing the API contract.
  const searchRequestIdRef = useRef(0);
  const lastAppliedKeyRef = useRef("");

  useEffect(() => {
    let active = true;
    getDocuments({ limit: 1, offset: 0 })
      .then((result) => {
        if (active && Number.isFinite(result.meta?.total)) {
          setAvailableDocumentCount(result.meta.total);
        }
      })
      .catch(() => { /* Count failure must not block searching. */ })
      .finally(() => { if (active) setCountLoading(false); });
    return () => { active = false; };
  }, []);

  const executeSearch = useCallback(async (searchQuery, filters) => {
    const trimmedQuery = searchQuery.trim();
    const requestId = ++searchRequestIdRef.current;
    lastAppliedKeyRef.current = createSearchUrl(trimmedQuery, filters.year, filters.category).toString();
    setIsLoading(true);
    setHasSearched(true);
    setErrorMessage("");
    setResults([]);

    try {
      const result = await searchDocuments(trimmedQuery, {
        limit: 5,
        year: filters.year !== "ALL" ? filters.year : null,
        category_id: filters.category !== "ALL" ? filters.category : null,
      });
      if (requestId !== searchRequestIdRef.current) return;
      setResults(Array.isArray(result.data) ? result.data : []);
    } catch (error) {
      if (requestId !== searchRequestIdRef.current) return;
      console.error("Search error:", error);
      setResults([]);
      setErrorMessage(error.message || "Pencarian gagal diproses. Silakan coba lagi.");
    } finally {
      if (requestId === searchRequestIdRef.current) setIsLoading(false);
    }
  }, []);

  const urlQuery = searchParams.get("q") || "";
  const appliedYear = validOption(searchParams.get("year") || "ALL", YEAR_OPTIONS);
  const appliedCategory = validOption(searchParams.get("category") || "ALL", CATEGORY_OPTIONS);

  useEffect(() => {
    const trimmedQuery = urlQuery.trim();
    setQuery(urlQuery);
    setSelectedYear(appliedYear);
    setSelectedCategory(appliedCategory);

    if (!trimmedQuery) {
      searchRequestIdRef.current += 1;
      lastAppliedKeyRef.current = "";
      setResults([]);
      setHasSearched(false);
      setIsLoading(false);
      setErrorMessage("");
      return;
    }

    setInputError("");
    const key = createSearchUrl(trimmedQuery, appliedYear, appliedCategory).toString();
    if (lastAppliedKeyRef.current !== key) {
      executeSearch(trimmedQuery, { year: appliedYear, category: appliedCategory });
    }
  }, [urlQuery, appliedYear, appliedCategory, executeSearch]);

  // URL is the source of truth for submitted query + filters (including Back/Forward).
  const submitSearch = (searchQuery, year, category) => {
    const trimmedQuery = searchQuery.trim();
    if (!trimmedQuery) {
      setInputError("Masukkan kata kunci pencarian terlebih dahulu.");
      searchRequestIdRef.current += 1;
      setSearchParams(new URLSearchParams());
      setResults([]);
      setHasSearched(false);
      setIsLoading(false);
      setErrorMessage("");
      return;
    }

    setInputError("");
    const nextParams = createSearchUrl(trimmedQuery, year, category);
    if (nextParams.toString() === createSearchUrl(urlQuery, appliedYear, appliedCategory).toString()) {
      // Searching the same query a second time should still refresh results.
      executeSearch(trimmedQuery, { year, category });
    } else {
      searchRequestIdRef.current += 1; // Invalidate in-flight requests immediately.
      setIsLoading(true);
      setHasSearched(true);
      setResults([]);
      setErrorMessage("");
      setSearchParams(nextParams);
    }
  };

  const handleSearch = (event) => {
    event.preventDefault();
    submitSearch(query, selectedYear, selectedCategory);
  };

  const handleQuickQueryClick = (quickQuery) => {
    setQuery(quickQuery);
    submitSearch(quickQuery, selectedYear, selectedCategory);
  };

  const categoryLabel = CATEGORY_OPTIONS.find((item) => item.value === appliedCategory)?.label || "Semua Kategori";
  const activeFilterParts = [
    ...(appliedYear !== "ALL" ? [`Tahun ${appliedYear}`] : []),
    ...(appliedCategory !== "ALL" ? [categoryLabel] : []),
  ];
  const hasActiveFilters = activeFilterParts.length > 0;
  const activeFilterText = hasActiveFilters ? activeFilterParts.join(", ") : "Semua tahun dan kategori";
  const hasDraftFilterChanges = selectedYear !== appliedYear || selectedCategory !== appliedCategory;

  const resetFilters = () => {
    setSelectedYear("ALL");
    setSelectedCategory("ALL");
    submitSearch(query, "ALL", "ALL");
  };

  return (
    <div className="app-shell student-shell">
      <StudentNavbar />
      <main id="main-content" tabIndex={-1} className="app-main">
        <div className="student-search-page">
          <section className="page-intro search-hero" aria-labelledby="student-search-title">
            <h1 id="student-search-title">Cari dokumen arsip</h1>
            <p className="search-lede">
              Temukan arsip dengan kata kunci atau kalimat sehari-hari.
            </p>

            <form onSubmit={handleSearch} className="search-form" role="search" aria-label="Cari arsip universitas">
              <div className="search-field">
                <svg viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4.5 4.5" /></svg>
                <label htmlFor="search-query" className="sr-only">Kata kunci dokumen</label>
                <input
                  id="search-query" type="search" value={query}
                  onChange={(event) => { setQuery(event.target.value); setInputError(""); }}
                  placeholder="Contoh: pedoman akademik"
                  aria-invalid={Boolean(inputError)}
                  aria-describedby={inputError ? "search-input-error" : "search-input-help"}
                />
                <button type="submit" disabled={isLoading} className="search-submit-btn inline-flex items-center justify-center gap-2 rounded-lg bg-blue-900 font-semibold text-white hover:bg-blue-800 disabled:opacity-60">
                  <svg viewBox="0 0 24 24" className="h-4 w-4" stroke="currentColor" strokeWidth="2" fill="none" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4.5 4.5" /></svg>
                  {isLoading ? "Mencari..." : "Cari"}
                </button>
              </div>

              <div className="search-filters">
                <div>
                  <label htmlFor="search-year">Tahun</label>
                  <select id="search-year" value={selectedYear} onChange={(event) => setSelectedYear(event.target.value)}>
                    {YEAR_OPTIONS.map((item) => <option key={item} value={item}>{item === "ALL" ? "Semua Tahun" : item}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="search-category">Kategori</label>
                  <select id="search-category" value={selectedCategory} onChange={(event) => setSelectedCategory(event.target.value)}>
                    {CATEGORY_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                  </select>
                </div>
              </div>
              <p id="search-input-help" className="search-hint">Gunakan filter bila ingin mempersempit hasil pencarian.</p>
              {inputError && <p id="search-input-error" role="alert" className="search-error">{inputError}</p>}

              <div className="search-quick-queries">
                <span>Coba pencarian:</span>
                <div className="flex flex-wrap gap-2">
                  {QUICK_QUERY_OPTIONS.map((quickQuery) => (
                    <button key={quickQuery} type="button" onClick={() => handleQuickQueryClick(quickQuery)}
                      aria-pressed={query.trim().toLowerCase() === quickQuery.toLowerCase()}>
                      {quickQuery}
                    </button>
                  ))}
                </div>
              </div>
            </form>
          </section>

          <section aria-label="Ringkasan pencarian" className="student-search-summary">
            <p>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M5 3h9l5 5v13H5z M14 3v6h5 M9 13h6 M9 17h6" /></svg>
              <strong>{countLoading ? "Memuat jumlah dokumen..." : availableDocumentCount === null ? "Jumlah dokumen belum tersedia" : `${availableDocumentCount.toLocaleString("id-ID")} Dokumen`}</strong>
              <span>di repositori</span>
            </p>
            <p>Pencarian berdasarkan makna</p>
            <p><span>Filter diterapkan:</span><strong>{activeFilterText}</strong></p>
            {hasDraftFilterChanges && <p className="draft-note">Klik Cari untuk menerapkan perubahan filter.</p>}
          </section>

          <section aria-labelledby="search-results-title" aria-busy={isLoading}>
            <div className="results-head">
              <div>
                <h2 id="search-results-title">Hasil Pencarian</h2>
                <p role="status" aria-live="polite">
                  {!hasSearched ? "Masukkan kata kunci atau pilih contoh pencarian di atas." : isLoading ? "Sedang mencari dokumen..." : errorMessage ? "Pencarian belum berhasil diproses." : `Menampilkan ${results.length} dokumen teratas (maksimal 5), bukan total seluruh dokumen relevan.`}
                </p>
              </div>
              {hasSearched && !isLoading && !errorMessage && results.length > 0 && (
                <span className="results-badge">Top-5 hasil pencarian</span>
              )}
            </div>

            {errorMessage && <div role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{errorMessage}</div>}
            {isLoading ? (
              <div role="status">
                <p className="search-status">
                  <span aria-hidden="true" className="h-5 w-5 animate-spin rounded-full border-2 border-slate-200 border-t-blue-900" />
                  Memproses pencarian dokumen. Mohon tunggu...
                </p>
                <div className="skeleton-list" aria-hidden="true">
                  {[0, 1, 2].map((item) => <div key={item} className="skeleton-card"><i /><i /><i /><i /></div>)}
                </div>
              </div>
            ) : hasSearched && results.length > 0 ? (
              <ol className="result-list">
                {results.map((document, index) => (
                  <li key={document.document_id ?? document.id}><SearchResultCard document={document} rank={index + 1} /></li>
                ))}
              </ol>
            ) : hasSearched && !errorMessage ? (
              <div className="empty-state">
                <svg className="empty-mark" viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="29" cy="29" r="11" /><path d="m37 37 10 10" /></svg>
                <h3>Dokumen tidak ditemukan</h3>
                <p>Coba kata kunci lain atau sesuaikan filter tahun dan kategori.</p>
                {hasActiveFilters && <button type="button" onClick={resetFilters}>Hapus semua filter</button>}
              </div>
            ) : (
              <div className="empty-state">
                <svg className="empty-mark" viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M8 58V30a24 24 0 0 1 48 0v28" /><path d="M18 58V30a14 14 0 0 1 28 0v28" /><path d="M28 58V30a4 4 0 0 1 8 0v28" /></svg>
                <h3>Mulai pencarian arsip</h3>
                <p>Hasil dokumen akan ditampilkan di sini setelah pencarian dilakukan.</p>
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}

export default SearchPage;
