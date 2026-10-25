import { formatStudentDescription } from "../../utils/studentPresentation.js";
import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import StudentNavbar from "../../layouts/StudentNavbar";
import PdfPreview from "../../components/documents/PdfPreview";
import {
  createDocumentPreview,
  downloadDocument,
  getDocumentById,
} from "../../services/api";

function getReadableFileFormat(rawDocument, fileName) {
  const fileType = String(rawDocument?.file_type || "").toLowerCase();
  const normalizedFileName = String(fileName || "").toLowerCase();

  if (fileType.includes("mpo") || normalizedFileName.endsWith(".mpo")) return "MPO";
  if (fileType.includes("pdf")) return "PDF";
  if (fileType.includes("jpeg") || fileType.includes("jpg")) return "JPEG";
  if (fileType.includes("png")) return "PNG";
  if (normalizedFileName.endsWith(".pdf")) return "PDF";
  if (/\.jpe?g$/.test(normalizedFileName)) return "JPEG";
  if (normalizedFileName.endsWith(".png")) return "PNG";

  if (fileType && fileType !== "-") {
    return fileType.toUpperCase();
  }

  return "Dokumen";
}

function normalizeDocument(rawDocument, routeId, scoreFromState = null) {
  const metadata =
    rawDocument?.metadata ||
    rawDocument?.document_metadata ||
    rawDocument?.documentMetadata ||
    {};

  const fileName = rawDocument?.file_name || rawDocument?.fileName || "-";

  const title =
    rawDocument?.title || metadata?.title || fileName || `Dokumen ${routeId}`;

  const category =
    rawDocument?.category ||
    metadata?.category ||
    rawDocument?.category_name ||
    "-";

  const year =
    rawDocument?.year || metadata?.year || rawDocument?.document_year || "-";

  const faculty =
    rawDocument?.faculty ||
    metadata?.faculty ||
    rawDocument?.unit ||
    metadata?.unit ||
    "-";

  const similarityScore =
    scoreFromState ||
    rawDocument?.similarity_score ||
    rawDocument?.similarityScore ||
    null;

  const rawSnippet =
    rawDocument?.snippet ||
    metadata?.description ||
    rawDocument?.description ||
    "Cuplikan dokumen belum tersedia.";

  const snippet = formatStudentDescription(rawSnippet);

  const fileFormat = getReadableFileFormat(rawDocument, fileName);

  const accessLevel = String(
    rawDocument?.access_level ||
      rawDocument?.accessLevel ||
      metadata?.access_level ||
      metadata?.accessLevel ||
      "",
  ).toUpperCase();

  const isPrivate =
    rawDocument?.isPrivate === true || accessLevel === "PRIVATE";

  const accessLabel =
    rawDocument?.accessLabel ||
    (isPrivate ? "Private" : accessLevel === "PUBLIC" ? "Public" : "-");

  return {
    id: String(rawDocument?.id || rawDocument?.document_id || routeId),
    document_id: rawDocument?.document_id || rawDocument?.id || routeId,
    title,
    fileName,
    category,
    year,
    faculty,
    facultyLabel: /^\d+$/.test(String(faculty).trim()) ? "Kode Fakultas/Unit" : "Fakultas/Unit",
    fileFormat,
    similarityScore,
    snippet,
    accessLevel,
    accessLabel,
    isPrivate,
  };
}

function DetailInfoItem({ label, value, valueClassName = "text-slate-800" }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase text-slate-500">{label}</p>

      <p className={`mt-1 text-sm font-semibold ${valueClassName}`}>
        {value || "-"}
      </p>
    </div>
  );
}

function DocumentDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  const [document, setDocument] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  const unsupportedMpo = document?.fileFormat === "MPO";
  const canPreview = !unsupportedMpo;
  const fileRequest = useRef(null);
  const previewSection = useRef(null);
  const [fileUnavailable, setFileUnavailable] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState("");
  const [previewMimeType, setPreviewMimeType] = useState("");
  const [previewRenderError, setPreviewRenderError] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [previewErrorMessage, setPreviewErrorMessage] = useState("");

  useEffect(() => {
    if (previewUrl && window.matchMedia("(max-width: 767px)").matches) {
      previewSection.current?.scrollIntoView({ block: "start" });
    }
  }, [previewUrl]);

  useEffect(() => {
    let isMounted = true;

    const loadDocumentDetail = async () => {
      const scoreFromSearch = location.state?.fromSearch
        ? location.state?.score
        : null;

      setErrorMessage("");
      setActionMessage("");
      setPreviewErrorMessage("");

      setLoading(true);
      setDocument(null);

      try {
        const result = await getDocumentById(id);
        const normalizedDocument = normalizeDocument(
          result.data,
          id,
          scoreFromSearch,
        );

        if (isMounted) {
          setDocument(normalizedDocument);
        }
      } catch (error) {
        console.error("Document detail error:", error);

        if (isMounted) {
          setDocument(null);
          setErrorMessage(
            error.message || "Detail dokumen tidak dapat diambil.",
          );
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    loadDocumentDetail();

    return () => {
      isMounted = false;
    };
  }, [id, location.state]);

  useEffect(() => {
    const request = { controller: new AbortController(), pending: false, url: "" };
    fileRequest.current = request;
    setPreviewUrl("");
    setPreviewMimeType("");
    setPreviewRenderError("");
    setFileUnavailable(false);
    setDownloading(false);
    setPreviewLoading(false);
    return () => {
      request.controller.abort();
      if (request.url) window.URL.revokeObjectURL(request.url);
    };
  }, [id]);

  const handleFileAction = async (preview) => {
    const request = fileRequest.current;
    if (preview && !canPreview) return;
    if (!document?.id || document.isPrivate || fileUnavailable || unsupportedMpo || request.pending) return;
    request.pending = true;
    const { signal } = request.controller;
    setActionMessage("");
    setPreviewErrorMessage("");
    if (preview) setPreviewRenderError("");
    if (preview) setPreviewLoading(true);
    else setDownloading(true);
    try {
      if (preview) {
        const { url, mimeType } = await createDocumentPreview(document.id, { signal, fileName: document.fileName });
        if (signal.aborted) { window.URL.revokeObjectURL(url); return; }
        if (request.url) window.URL.revokeObjectURL(request.url);
        request.url = url;
        setPreviewMimeType(mimeType);
        setPreviewUrl(url);
      } else {
        const name = [document.fileName, document.title]
          .find((value) => value?.trim() && value.trim() !== "-");
        await downloadDocument(document.id, name, { signal });
      }
    } catch (error) {
      if (signal.aborted) return;
      const message = error.message || "Berkas gagal dimuat. Silakan coba lagi.";
      setActionMessage(message);
      if (preview) setPreviewErrorMessage(message);
      if (error.fileUnavailable) {
        setFileUnavailable(true);
        if (request.url) window.URL.revokeObjectURL(request.url);
        request.url = "";
        setPreviewUrl("");
        setPreviewMimeType("");
      }
    } finally {
      request.pending = false;
      if (!signal.aborted) {
        setDownloading(false);
        setPreviewLoading(false);
      }
    }
  };
  const handleDownload = () => handleFileAction(false);
  const handlePreview = () => handleFileAction(true);

  const handleBack = () => {
    if (window.history.state?.idx > 0) navigate(-1);
    else navigate(location.state?.fromSearch ? "/search" : "/repository", { replace: true });
  };

  const backButton = <button type="button" onClick={handleBack}
    className="inline-flex items-center gap-1 rounded px-1 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900">
    <span aria-hidden="true">‹</span> Kembali
  </button>;

  if (loading) {
    return (
      <div className="app-shell student-shell">
        <StudentNavbar />

        <main id="main-content" tabIndex={-1} className="app-main">
          <div className="document-detail-toolbar">{backButton}</div>
          <section className="rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
            <h1 className="text-2xl font-bold text-slate-800">
              Memuat Detail Dokumen
            </h1>

            <p className="mt-2 text-sm text-slate-600">
              Sistem sedang mengambil data dokumen.
            </p>
          </section>
        </main>
      </div>
    );
  }

  if (!document) {
    return (
      <div className="app-shell student-shell">
        <StudentNavbar />

        <main id="main-content" tabIndex={-1} className="app-main">
          <div className="document-detail-toolbar">{backButton}</div>
          <section className="rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm">
            <h1 className="text-2xl font-bold text-slate-800">
              Dokumen Tidak Ditemukan
            </h1>

            <p className="mt-2 text-sm text-slate-600">
              {errorMessage || "Data dokumen yang diminta belum tersedia."}
            </p>

            <button
              type="button"
              onClick={() => navigate("/search")}
              className="mt-6 rounded-lg bg-blue-900 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-800"
            >
              Kembali ke Pencarian
            </button>
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className="app-shell student-shell">
      <StudentNavbar />
      <main id="main-content" tabIndex={-1} className="app-main">
        <div className="document-detail-toolbar">
          {backButton}
        </div>
        <div className="student-detail-page">
          <section className="page-intro" aria-labelledby="student-detail-title">
            <h1 id="student-detail-title" className="text-2xl font-bold text-slate-800">Detail Dokumen Arsip</h1>
            <p className="mt-1.5 text-sm leading-6 text-slate-600">
              Informasi arsip dan pratinjau berkas sesuai hak akses Anda.
            </p>

            {actionMessage && (
              <div role="alert" className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
                {actionMessage}
              </div>
            )}

            <div className="detail-surface mt-5 rounded-xl border border-slate-200">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-4">
                <div className="min-w-0 flex-1">
                  <h2 className="text-xl font-bold leading-snug text-slate-800">{document.title}</h2>
                  {document.fileName && document.fileName !== "-" && (
                    <p className="mt-2 break-all text-xs text-slate-500">Nama berkas: {document.fileName}</p>
                  )}
                </div>
                <span className={`w-fit shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${document.isPrivate ? "bg-amber-50 text-amber-700" : document.accessLevel === "PUBLIC" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
                  {(document.isPrivate ? "Terbatas" : document.accessLevel === "PUBLIC" ? "Publik" : "-")}
                </span>
              </div>

              <div className="metadata-grid student-metadata-grid mt-4 grid grid-cols-2 sm:grid-cols-3">
                <DetailInfoItem label="Kategori" value={document.category} />
                <DetailInfoItem label="Tahun" value={document.year} />
                <DetailInfoItem label="Format File" value={document.fileFormat} />
                <DetailInfoItem label="Fakultas/Unit" value={/^\d+$/.test(String(document.faculty).trim()) ? "Belum tersedia" : document.faculty} />
              </div>
              {document.facultyLabel === "Kode Fakultas/Unit" && (
                <p className="mt-2 text-xs text-slate-500">Nama fakultas/unit belum tersedia.</p>
              )}
            </div>
          </section>

          <section className="mt-4 rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm" aria-labelledby="document-snippet-title">
            <h3 id="document-snippet-title" className="text-sm font-semibold text-slate-800">Cuplikan Dokumen</h3>
            <p className="student-detail-snippet mt-2 whitespace-pre-wrap text-sm leading-7 text-slate-600">
              {document.snippet}
            </p>
          </section>

          <section ref={previewSection} className="document-preview-section student-reader mt-5 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm" aria-labelledby="pdf-preview-title">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
              <div>
                <h3 id="pdf-preview-title" className="text-base font-semibold text-slate-800">Pratinjau Dokumen</h3>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  {previewUrl ? "Berkas siap dilihat." : "Pilih Lihat Dokumen untuk memuat berkas asli (PDF, JPEG, atau PNG)."}
                </p>
              </div>
              
            </div>

            <div className="student-reader-canvas bg-slate-100 p-3 sm:p-5">
              {unsupportedMpo ? (
                <div role="status" className="student-reader-status rounded-lg border border-slate-200 bg-white px-5 py-8 text-center text-sm text-slate-700">
                  Format MPO belum didukung untuk pratinjau maupun unduhan.
                </div>
              ) : document.isPrivate ? (
                <div role="status" className="student-reader-status flex items-center justify-center rounded-lg border border-slate-200 bg-white px-5 py-8 text-center text-sm text-slate-600">
                  Pratinjau tidak dapat dibuka sesuai hak akses dokumen Anda.
                </div>
              ) : previewLoading ? (
                <div role="status" className="student-reader-status flex flex-col items-center justify-center rounded-lg border border-slate-200 bg-white px-5 py-8 text-center">
                  <span aria-hidden="true" className="mb-3 h-7 w-7 animate-spin rounded-full border-[3px] border-slate-200 border-t-blue-900" />
                  <p className="text-sm font-semibold text-slate-800">Membuka pratinjau dokumen...</p>
                  <p className="mt-1 text-sm text-slate-500">Memuat berkas asli.</p>
                </div>
              ) : previewRenderError ? (
                <div role="alert" className="student-reader-status rounded-lg border border-amber-200 bg-amber-50 px-5 py-8 text-center text-sm text-amber-800">
                  {previewRenderError}
                </div>
              ) : previewUrl ? (
                previewMimeType === "image/jpeg" || previewMimeType === "image/png" ? (
                  <div className="flex min-h-[240px] items-center justify-center rounded-lg border border-slate-300 bg-white p-2 sm:p-4">
                    <img src={previewUrl} alt={`Pratinjau berkas ${document.title}`} className="max-h-[75vh] w-auto max-w-full object-contain"
                      onError={() => {
                        setPreviewRenderError("Gambar tidak dapat ditampilkan oleh browser. Silakan coba lagi atau hubungi pengelola arsip.");
                        if (fileRequest.current?.url === previewUrl) {
                          window.URL.revokeObjectURL(previewUrl);
                          fileRequest.current.url = "";
                        }
                        setPreviewUrl("");
                      }} />
                  </div>
                ) : (
                  <PdfPreview key={previewUrl} url={previewUrl} title={`Preview ${document.title}`}
                    className="h-[65vh] min-h-[360px] w-full rounded-lg border border-slate-300 bg-white sm:h-[72vh] lg:h-[75vh]" />
                )
              ) : previewErrorMessage ? (
                <div role="status" className="student-reader-status flex flex-col items-center justify-center rounded-lg border border-amber-200 bg-amber-50 px-5 py-8 text-center">
                  <h4 className="text-sm font-semibold text-amber-800">Pratinjau belum dapat dibuka</h4>
                  <p className="mt-2 max-w-lg text-sm leading-6 text-amber-700">{previewErrorMessage}</p>
                  <p className="mt-2 text-xs text-amber-700">Jika berkas belum tersedia, hubungi pengelola arsip. Untuk gangguan jaringan, coba lagi.</p>
                </div>
              ) : (
                <div role="status" className="student-reader-status flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white px-5 py-8 text-center">
                  <svg aria-hidden="true" viewBox="0 0 24 24" className="mb-3 h-9 w-9 text-slate-400" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M7 3h7l5 5v13H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z M14 3v6h5 M9 13h6 M9 17h6" /></svg>
                  <h4 className="text-sm font-semibold text-slate-800">Pratinjau dokumen belum dimuat</h4>
                  <p className="mt-2 max-w-md text-sm leading-6 text-slate-500">Klik Lihat Dokumen untuk membuka berkas asli. Jika berkas tidak tersedia atau akses dibatasi, sistem akan menampilkan pemberitahuan.</p>
                </div>
              )}
            </div>

            <div className="student-reader-actions flex flex-wrap gap-2.5 border-t border-slate-200 bg-white px-5 py-4">
              <button type="button" onClick={handleDownload}
                disabled={downloading || previewLoading || fileUnavailable || document.isPrivate || unsupportedMpo || !document.id}
                aria-busy={downloading}
                className="rounded-lg bg-blue-900 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-slate-300">
                {downloading ? "Mengunduh..." : "Unduh Dokumen"}
              </button>
              <button type="button" onClick={handlePreview}
                disabled={!canPreview || previewLoading || downloading || fileUnavailable || document.isPrivate || !document.id}
                aria-busy={previewLoading}
                className="rounded-lg border border-blue-900 bg-white px-5 py-2.5 text-sm font-semibold text-blue-900 transition-colors hover:bg-blue-50 disabled:cursor-not-allowed disabled:border-slate-300 disabled:bg-slate-100 disabled:text-slate-400">
                {previewLoading ? "Membuka..." : "Lihat Dokumen"}
              </button>
              <button type="button" onClick={handleBack}
                className="rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50">
                Kembali
              </button>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

export default DocumentDetailPage;
