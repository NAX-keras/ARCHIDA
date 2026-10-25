import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import StudentNavbar from "../../layouts/StudentNavbar";
import {
  downloadDocument,
  getDocumentCategorySummary,
  getDocuments,
} from "../../services/api";

const DOCUMENT_LIMIT = 25;

function RepositoryPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const savedCategory = location.state?.repositoryCategory;
  const savedOffset = location.state?.repositoryOffset ?? 0;

  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState(savedCategory ?? null);

  const [documents, setDocuments] = useState([]);
  const [totalDocuments, setTotalDocuments] = useState(0);
  const [offset, setOffset] = useState(savedOffset);

  const [categoryLoading, setCategoryLoading] = useState(true);
  const [documentLoading, setDocumentLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [downloadMessage, setDownloadMessage] = useState("");
  const pendingDownloads = useRef(new Set());
  const [downloadingDocumentIds, setDownloadingDocumentIds] = useState(new Set());
  const [unavailableDownloads, setUnavailableDownloads] = useState(new Set());

  const loadCategorySummary = async () => {
    try {
      setCategoryLoading(true);
      setErrorMessage("");

      const result = await getDocumentCategorySummary();

      setCategories(result.data || []);
    } catch (error) {
      console.error("Category summary error:", error);

      setCategories([]);
      setErrorMessage(
        error.message ||
          "Ringkasan kategori dokumen gagal diambil.",
      );
    } finally {
      setCategoryLoading(false);
    }
  };

  const loadDocumentsByCategory = async (category, nextOffset = 0) => {
    if (category.category_id == null) return;
    try {
      setDocumentLoading(true);
      setErrorMessage("");
      setDownloadMessage("");

      const result = await getDocuments({
        category_id: category.category_id,
        limit: DOCUMENT_LIMIT,
        offset: nextOffset,
      });

      setDocuments(result.data || []);
      setTotalDocuments(result.meta?.total ?? result.data?.length ?? 0);
      setOffset(nextOffset);
    } catch (error) {
      console.error("Documents by category error:", error);

      setDocuments([]);
      setTotalDocuments(0);
      setErrorMessage(
        error.message || "Daftar dokumen kategori gagal diambil.",
      );
    } finally {
      setDocumentLoading(false);
    }
  };

  useEffect(() => {
    loadCategorySummary();
    if (savedCategory?.category_id != null) {
      loadDocumentsByCategory(savedCategory, savedOffset);
    }
  }, []);

  const handleCategoryClick = (category) => {
    if (category.category_id == null) return;
    setSelectedCategory(category);
    setDocuments([]);
    setTotalDocuments(0);
    setOffset(0);
    setDownloadMessage("");
    loadDocumentsByCategory(category, 0);
  };

  const handleBackToCategories = () => {
    setSelectedCategory(null);
    setDocuments([]);
    setTotalDocuments(0);
    setOffset(0);
    setErrorMessage("");
    setDownloadMessage("");
  };

  const handlePreviousPage = () => {
    if (!selectedCategory || offset === 0) {
      return;
    }

    const previousOffset = Math.max(offset - DOCUMENT_LIMIT, 0);
    loadDocumentsByCategory(selectedCategory, previousOffset);
  };

  const handleNextPage = () => {
    if (!selectedCategory) {
      return;
    }

    const nextOffset = offset + DOCUMENT_LIMIT;

    if (nextOffset >= totalDocuments) {
      return;
    }

    loadDocumentsByCategory(selectedCategory, nextOffset);
  };

  const handleDetailClick = (document) => {
    const documentId = document.document_id ?? document.id;

    // Keep the selected category/page on this history entry before opening detail.
    navigate(location.pathname + location.search, {
      replace: true,
      state: { ...location.state, repositoryCategory: selectedCategory, repositoryOffset: offset },
    });
    navigate(`/documents/${documentId}`, {
      state: {
        document,
      },
    });
  };

  const handleDownload = async (document) => {
    const documentId = document.document_id ?? document.id;
    const fileName =
      document.file_name ||
      document.fileName ||
      document.title ||
      `dokumen-${documentId}.pdf`;

    if (!documentId || document.isPrivate || String(document.access_level || document.accessLevel).toUpperCase() === "PRIVATE" || unavailableDownloads.has(documentId) || pendingDownloads.current.has(documentId)) return;
    pendingDownloads.current.add(documentId);

    try {
      setDownloadingDocumentIds(new Set(pendingDownloads.current));
      setDownloadMessage("");

      await downloadDocument(documentId, fileName);
    } catch (error) {
      console.error("Student repository download error:", error);

      if (error.fileUnavailable) setUnavailableDownloads((previous) => new Set(previous).add(documentId));
      setDownloadMessage(error.message || "Gagal mengunduh dokumen.");
    } finally {
      pendingDownloads.current.delete(documentId);
      setDownloadingDocumentIds(new Set(pendingDownloads.current));
    }
  };

  const hasPreviousPage = offset > 0;
  const hasNextPage = offset + DOCUMENT_LIMIT < totalDocuments;

  const displayedDocumentCount = selectedCategory
    ? totalDocuments || documents.length
    : 0;

  return (
    <div className="app-shell student-shell">
      <StudentNavbar />

      <main id="main-content" tabIndex={-1} className="app-main">
        <section className="page-intro">
          <h1 className="text-2xl font-bold text-slate-800">
            Repositori Dokumen Arsip
          </h1>

          <p className="mt-2 text-sm leading-6 text-slate-600">
            Jelajahi dokumen arsip universitas berdasarkan kategori dokumen.
          </p>

          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <div className="stat-card">
              <p className="text-sm text-slate-500">
                {selectedCategory ? "Dokumen dalam kategori" : "Total Kategori"}
              </p>

              <h2 className="mt-2 text-2xl font-bold text-blue-900">
                {selectedCategory
                  ? documentLoading
                    ? "..."
                    : `${displayedDocumentCount} Dokumen`
                  : categoryLoading
                    ? "..."
                    : `${categories.length} Kategori`}
              </h2>

              <p className="mt-2 text-xs text-slate-400">
                {selectedCategory
                  ? `Pada kategori ${selectedCategory.category}`
                  : "Pilih salah satu kategori untuk menampilkan dokumen"}
              </p>
            </div>

            <div className="stat-card">
              <p className="text-sm text-slate-500">Kategori Aktif</p>

              <h2 className="mt-2 text-2xl font-bold text-blue-900">
                {selectedCategory ? selectedCategory.category : "Belum dipilih"}
              </h2>

              <p className="mt-2 text-xs text-slate-400">
                {selectedCategory
                  ? "Menampilkan dokumen sesuai kategori yang dipilih"
                  : "Dokumen akan tampil setelah kategori dipilih"}
              </p>
            </div>

            <div className="stat-card">
              <p className="text-sm text-slate-500">Akses Mahasiswa</p>

              <h2 className="mt-2 text-2xl font-bold text-slate-700">
                Akses baca
              </h2>

              <p className="mt-2 text-xs text-slate-400">
                Mahasiswa dapat melihat detail dan mengunduh dokumen Publik
              </p>
            </div>
          </div>

          <p className="mt-4 text-xs text-slate-500">
            Repositori mahasiswa digunakan untuk melihat daftar dokumen arsip
            berdasarkan kategori. Dokumen Publik dalam format PDF, JPG/JPEG, dan PNG dapat diunduh jika berkas tersedia.
          </p>
        </section>

        {!selectedCategory && (
          <section className="mt-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-5">
              <h2 className="text-lg font-semibold text-slate-800">
                Kategori Dokumen
              </h2>

              <p className="text-sm text-slate-500">
                Pilih salah satu kategori untuk melihat daftar dokumen arsip.
              </p>
            </div>

            {categoryLoading && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-8 text-center">
                <p className="text-sm font-medium text-slate-700">
                  Memuat kategori dokumen...
                </p>

                <p className="mt-2 text-sm text-slate-500">
                  Sistem sedang mengambil ringkasan kategori.
                </p>
              </div>
            )}

            {!categoryLoading && errorMessage && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                {errorMessage}
              </div>
            )}

            {!categoryLoading && !errorMessage && categories.length === 0 && (
              <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
                <h3 className="text-base font-semibold text-slate-800">
                  Kategori belum tersedia
                </h3>

                <p className="mt-2 text-sm text-slate-500">
                  Ringkasan kategori dokumen belum ditemukan.
                </p>
              </div>
            )}

            {!categoryLoading && !errorMessage && categories.length > 0 && (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {categories.map((category) => (
                  <button
                    key={category.categoryKey ?? `category:${category.category_id}`}
                    type="button"
                    disabled={category.category_id == null}
                    onClick={() => handleCategoryClick(category)}
                    className="category-card rounded-xl border border-slate-200 bg-white p-5 text-left shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="text-base font-bold text-slate-800">
                          {category.category}
                        </h3>
                      </div>

                      <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
                        {category.category_id == null ? "Informasi" : "Lihat"}
                      </span>
                    </div>

                    <p className="mt-5 border-t border-slate-100 pt-4 text-sm text-slate-600">
                      {category.total} dokumen tersedia
                    </p>
                    {category.category_id == null && (
                      <p className="mt-2 text-xs text-slate-500">Filter kategori ini belum tersedia. Gunakan pencarian untuk menemukan dokumen.</p>
                    )}
                  </button>
                ))}
              </div>
            )}
          </section>
        )}

        {selectedCategory && (
          <section className="mt-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-800">
                  Dokumen Kategori {selectedCategory.category}
                </h2>

                <p className="text-sm text-slate-500">
                  Menampilkan dokumen berdasarkan kategori yang dipilih.
                </p>
              </div>

              <button
                type="button"
                onClick={handleBackToCategories}
                className="w-fit rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Kembali ke Kategori
              </button>
            </div>

            {downloadMessage && (
              <div role="alert" className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
                {downloadMessage}
              </div>
            )}

            {documentLoading && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-8 text-center">
                <p className="text-sm font-medium text-slate-700">
                  Memuat daftar dokumen...
                </p>

                <p className="mt-2 text-sm text-slate-500">
                  Sistem sedang mengambil dokumen kategori.
                </p>
              </div>
            )}

            {!documentLoading && errorMessage && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                {errorMessage}
              </div>
            )}

            {!documentLoading && !errorMessage && documents.length === 0 && (
              <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
                <h3 className="text-base font-semibold text-slate-800">
                  Dokumen belum tersedia
                </h3>

                <p className="mt-2 text-sm text-slate-500">
                  Belum ada dokumen pada kategori ini.
                </p>
              </div>
            )}

            {!documentLoading && !errorMessage && documents.length > 0 && (
              <>
                <div className="table-scroll category-document-list" tabIndex={0} role="region" aria-label="Daftar dokumen kategori">
                  <table className="w-full border-collapse text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
                        <th className="px-4 py-3 font-semibold">No</th>

                        <th className="px-4 py-3 font-semibold">
                          Judul Dokumen
                        </th>

                        <th className="px-4 py-3 font-semibold">Tahun</th>

                        <th className="px-4 py-3 font-semibold">Akses</th>

                        <th className="px-4 py-3 font-semibold">Aksi</th>
                      </tr>
                    </thead>

                    <tbody>
                      {documents.map((document, index) => {
                        const documentId = document.document_id ?? document.id;
                        const isPrivate = document.isPrivate || String(document.access_level || document.accessLevel).toUpperCase() === "PRIVATE";
                        const isDownloading =
                          downloadingDocumentIds.has(documentId);

                        return (
                          <tr
                            key={documentId ?? index}
                            className="border-b border-slate-100 hover:bg-slate-50"
                          >
                            <td className="px-4 py-3 text-slate-600">
                              {offset + index + 1}
                            </td>

                            <td className="px-4 py-3">
                              <p className="font-medium text-slate-800">
                                {document.title}
                              </p>

                              <p className="mt-1 text-xs text-slate-500">
                                {document.file_name}
                              </p>
                            </td>

                            <td className="px-4 py-3 text-slate-600">
                              {document.year}
                            </td>

                            <td className="px-4 py-3">
                              <span
                                className={`rounded-full px-3 py-1 text-xs font-medium ${
                                  isPrivate
                                    ? "bg-amber-50 text-amber-700"
                                    : "bg-emerald-50 text-emerald-700"
                                }`}
                              >
                                {document.accessLabel}
                              </span>
                            </td>

                            <td className="whitespace-nowrap px-4 py-3">
                              <div className="flex items-center gap-2 whitespace-nowrap">
                                <button
                                  type="button"
                                  onClick={() => handleDetailClick(document)}
                                  className="rounded-lg bg-blue-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-800"
                                >
                                  Detail
                                </button>

                                <button
                                  type="button"
                                  onClick={() => handleDownload(document)}
                                  disabled={isDownloading || isPrivate || unavailableDownloads.has(documentId) || !documentId}
                                  aria-busy={isDownloading}
                                  title={
                                    isPrivate || unavailableDownloads.has(documentId)
                                      ? "Berkas belum tersedia atau tidak dapat diakses."
                                      : "Unduh berkas asli (PDF, JPG/JPEG, atau PNG)."
                                  }
                                  className={`rounded-lg border px-3 py-1.5 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-60 ${
                                    isPrivate
                                      ? "border-slate-200 bg-slate-100 text-slate-400"
                                      : "border-slate-300 text-slate-600 hover:bg-slate-50"
                                  }`}
                                >
                                  {isDownloading ? "Mengunduh..." : "Unduh"}
                                </button>
                                {unavailableDownloads.has(documentId) && (
                                  <span className="max-w-xs whitespace-normal text-xs text-amber-700">Berkas belum tersedia atau tidak dapat diakses.</span>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="mt-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <p className="text-sm text-slate-500">
                    Menampilkan {offset + 1} -{" "}
                    {Math.min(offset + documents.length, totalDocuments)} dari{" "}
                    {totalDocuments} dokumen.
                  </p>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handlePreviousPage}
                      disabled={!hasPreviousPage || documentLoading}
                      className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Sebelumnya
                    </button>

                    <button
                      type="button"
                      onClick={handleNextPage}
                      disabled={!hasNextPage || documentLoading}
                      className="rounded-lg bg-blue-900 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-slate-400"
                    >
                      Selanjutnya
                    </button>
                  </div>
                </div>
              </>
            )}
          </section>
        )}
      </main>
    </div>
  );
}

export default RepositoryPage;
