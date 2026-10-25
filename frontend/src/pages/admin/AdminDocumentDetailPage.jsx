import { formatStudentDescription } from "../../utils/studentPresentation.js";
import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import AdminNavbar from "../../layouts/AdminNavbar";
import PdfPreview from "../../components/documents/PdfPreview";
import { createDocumentPreview, downloadDocument, getDocumentById } from "../../services/api";

function formatFileSize(size) {
  const numericSize = Number(size);

  if (!numericSize || Number.isNaN(numericSize)) {
    return "-";
  }

  if (numericSize >= 1024 * 1024) {
    return `${(numericSize / (1024 * 1024)).toFixed(2)} MB`;
  }

  return `${(numericSize / 1024).toFixed(2)} KB`;
}

function formatDateTime(value) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function normalizeAdminDocument(rawDocument, routeId) {
  const documentId = rawDocument?.id ?? rawDocument?.document_id ?? routeId;
  const downloadMetadata = rawDocument?.raw ?? rawDocument;
  const downloadFileName = [downloadMetadata?.file_name, downloadMetadata?.title]
    .find((value) => typeof value === "string" && value.trim() && value.trim() !== "-")
    ?.trim() || `dokumen-${documentId}`;

  return {
    id: documentId,
    downloadFileName,
    title: rawDocument?.title || rawDocument?.file_name || `Dokumen ${routeId}`,
    file_name: rawDocument?.file_name || "-",
    file_type: rawDocument?.file_type || rawDocument?.document_type || "-",
    file_size: rawDocument?.file_size || "-",
    category: rawDocument?.category || "-",
    year: rawDocument?.year || "-",
    access_level: rawDocument?.access_level || "-",
    accessLabel:
      rawDocument?.accessLabel ||
      (rawDocument?.access_level === "PRIVATE" ? "Private" : "Public"),
    isPrivate:
      rawDocument?.isPrivate ||
      String(rawDocument?.access_level || "").toUpperCase() === "PRIVATE",
    processing_status: rawDocument?.processing_status || "-",
    processingStatusLabel:
      rawDocument?.processingStatusLabel ||
      rawDocument?.status ||
      rawDocument?.processing_status ||
      "-",
    extraction_method: rawDocument?.extraction_method || "-",
    extractionMethodLabel:
      rawDocument?.extractionMethodLabel ||
      rawDocument?.extraction_method ||
      "-",
    document_type: rawDocument?.document_type || "-",
    faculty: rawDocument?.faculty || "-",
    description:
      rawDocument?.description ||
      rawDocument?.snippet ||
      "Deskripsi dokumen belum tersedia.",
    keywords: rawDocument?.keywords || "-",
    created_at: rawDocument?.created_at || "-",
    updated_at: rawDocument?.updated_at || "-",
  };
}

function InfoItem({ label, value }) {
  return (
    <div className="metadata-row">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function AdminDocumentDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  const [document, setDocument] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const fileRequest = useRef(null);
  const previewSection = useRef(null);
  const [fileUnavailable, setFileUnavailable] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState("");
  const [previewMimeType, setPreviewMimeType] = useState("");
  const [imageLoading, setImageLoading] = useState(false);
  const [previewRenderError, setPreviewRenderError] = useState("");
  const [downloading, setDownloading] = useState(false);
  const [downloadErrorMessage, setDownloadErrorMessage] = useState("");

  useEffect(() => {
    if (previewUrl && window.matchMedia("(max-width: 767px)").matches) {
      previewSection.current?.scrollIntoView({ block: "start" });
    }
  }, [previewUrl]);

  useEffect(() => {
    let isMounted = true;

    const loadDocument = async () => {
      try {
        setLoading(true);
        setErrorMessage("");
        setDownloadErrorMessage("");

        const documentFromState = location.state?.document;

        if (documentFromState) {
          const normalizedDocument = normalizeAdminDocument(
            documentFromState,
            id,
          );

          if (isMounted) {
            setDocument(normalizedDocument);
            setLoading(false);
          }

          return;
        }

        const result = await getDocumentById(id);
        const normalizedDocument = normalizeAdminDocument(result.data, id);

        if (isMounted) {
          setDocument(normalizedDocument);
        }
      } catch (error) {
        console.error("Admin document detail error:", error);

        if (isMounted) {
          setDocument(null);
          setErrorMessage(
            error.message ||
              "Detail dokumen belum dapat dimuat.",
          );
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    loadDocument();

    return () => {
      isMounted = false;
    };
  }, [id, location.state]);

  const handleBack = () => {
    navigate("/admin/repository");
  };

  useEffect(() => {
    const request = { controller: new AbortController(), pending: false, url: "" };
    fileRequest.current = request;
    setPreviewUrl("");
    setPreviewMimeType("");
    setImageLoading(false);
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
    if (!document?.id || fileUnavailable || request.pending) return;
    request.pending = true;
    const { signal } = request.controller;
    setDownloadErrorMessage("");
    if (preview) setPreviewRenderError("");
    if (preview) setPreviewLoading(true);
    else setDownloading(true);
    try {
      if (preview) {
        const { url, mimeType } = await createDocumentPreview(document.id, { signal, fileName: document.file_name });
        if (signal.aborted) { window.URL.revokeObjectURL(url); return; }
        if (request.url) window.URL.revokeObjectURL(request.url);
        request.url = url;
        setImageLoading(mimeType === "image/jpeg" || mimeType === "image/png");
        setPreviewMimeType(mimeType);
        setPreviewUrl(url);
      } else {
        await downloadDocument(document.id, document.downloadFileName, { signal });
      }
    } catch (error) {
      if (signal.aborted) return;
      const message = error.message || "Berkas gagal dimuat. Silakan coba lagi.";
      setDownloadErrorMessage(message);
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

  const backButton = <button type="button" onClick={handleBack}
    className="min-h-11 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
    ← Kembali
  </button>;

  if (loading) {
    return (
      <div className="app-shell admin-shell">
        <AdminNavbar />

        <main id="main-content" tabIndex={-1} className="app-main">
          <div className="document-detail-toolbar">{backButton}</div>
          <section className="rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
            <h1 className="text-2xl font-bold text-slate-800">
              Memuat Detail Dokumen Admin
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
      <div className="app-shell admin-shell">
        <AdminNavbar />

        <main id="main-content" tabIndex={-1} className="app-main">
          <div className="document-detail-toolbar">{backButton}</div>
          <section className="rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm">
            <h1 className="text-2xl font-bold text-slate-800">
              Dokumen Admin Tidak Ditemukan
            </h1>

            <p className="mt-2 text-sm text-slate-600">
              {errorMessage ||
                "Data dokumen admin yang diminta belum tersedia."}
            </p>

            <button
              type="button"
              onClick={handleBack}
              className="mt-6 rounded-lg bg-blue-900 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-800"
            >
              Kembali ke Repositori Admin
            </button>
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className="app-shell admin-shell">
      <AdminNavbar />
      <main id="main-content" tabIndex={-1} className="app-main">
        <div className="document-detail-toolbar">
          {backButton}
          <div className="flex flex-wrap gap-2 md:hidden">
            <button type="button" onClick={handlePreview}
              disabled={downloading || previewLoading || fileUnavailable || !document.id}
              aria-busy={previewLoading}
              className="min-h-11 rounded-lg border border-blue-900 bg-white px-3 py-2 text-sm font-semibold text-blue-900 disabled:opacity-50">
              {previewLoading ? "Membuka..." : "Lihat Dokumen"}
            </button>
            <button type="button" onClick={handleDownload}
              disabled={downloading || previewLoading || fileUnavailable || !document.id}
              aria-busy={downloading}
              className="min-h-11 rounded-lg bg-blue-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">
              {downloading ? "Mengunduh..." : "Unduh"}
            </button>
          </div>
        </div>
        <section className="page-intro">
          <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <h1 className="text-2xl font-bold text-slate-800">Detail Dokumen Admin</h1>
              <p className="mt-2 text-sm text-slate-500">Informasi lengkap dan berkas dokumen arsip.</p>
            </div>
          </div>
          <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
            <h2 className="max-w-4xl text-xl font-semibold leading-8 text-slate-800">{document.title}</h2>
            <span className={"access-badge rounded-full border px-3 py-1 text-xs font-semibold " + (document.isPrivate ? "border-slate-200 bg-slate-100 text-slate-700" : "border-emerald-200 bg-emerald-50 text-emerald-700")}>{document.accessLabel}</span>
          </div>
          <dl className="metadata-list">
            <InfoItem label="Kategori" value={document.category} />
            <InfoItem label="Tahun" value={document.year} />
            <InfoItem label="Deskripsi" value={formatStudentDescription(document.description)} />
            <InfoItem label="Kata Kunci" value={
              <div className="keyword-chips">{String(document.keywords).split(",").map((keyword, index) =>
                <span key={index}>{keyword.trim() || "—"}</span>)}</div>
            } />
            <InfoItem label={/^\d+$/.test(String(document.faculty).trim()) ? "Kode Fakultas/Unit" : "Fakultas/Unit"} value={document.faculty} />
            <InfoItem label="Tipe Dokumen" value={document.document_type} />
            <InfoItem label="Akses" value={document.accessLabel} />
            <InfoItem label="Status Proses" value={document.processingStatusLabel} />
            <InfoItem label="Metode Ekstraksi" value={document.extractionMethodLabel} />
            <InfoItem label="Dibuat" value={formatDateTime(document.created_at)} />
            <InfoItem label="Diperbarui" value={formatDateTime(document.updated_at)} />
          </dl>
          <section ref={previewSection} className="document-preview-section file-section" aria-labelledby="file-section-title">
            <h2 id="file-section-title" className="text-base font-semibold text-slate-800">Informasi Berkas</h2>
            <p className="mt-1 text-sm text-slate-500">Buka pratinjau atau unduh berkas PDF, JPEG, atau PNG jika tersedia. Jika pratinjau tidak tampil di browser Anda, gunakan Unduh.</p>
            <div className="file-row">
              <div>
                <p className="text-sm font-semibold text-slate-800">{document.file_name}</p>
                <p className="mt-1 text-xs text-slate-500">{document.file_type} · {formatFileSize(document.file_size)}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={handlePreview} disabled={downloading || previewLoading || fileUnavailable || !document.id} aria-busy={previewLoading}
                  className="rounded-lg border border-blue-900 px-5 py-2 text-sm font-semibold text-blue-900 hover:bg-blue-50 disabled:opacity-60">
                  {previewLoading ? "Membuka..." : "Lihat Dokumen"}
                </button>
              <button type="button" onClick={handleDownload} disabled={downloading || previewLoading || fileUnavailable || !document.id} aria-busy={downloading}
                className="rounded-lg bg-blue-900 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-60">
                {downloading ? "Mengunduh..." : "Unduh"}
              </button>
              </div>
            </div>
            {previewLoading && <p role="status" className="mt-4 text-sm text-slate-600">Membuka pratinjau dokumen...</p>}
            {imageLoading && previewUrl && <p role="status" className="mt-4 text-sm text-slate-600">Menampilkan gambar...</p>}
            {previewRenderError && <p role="alert" className="mt-4 text-sm text-amber-800">{previewRenderError}</p>}
            {previewUrl && (previewMimeType === "image/jpeg" || previewMimeType === "image/png") && (
              <div className="mt-4 flex min-h-[240px] items-center justify-center rounded-lg border border-slate-200 bg-white p-2 sm:p-4">
                <img src={previewUrl} alt={`Pratinjau berkas ${document.title}`} className="max-h-[75vh] w-auto max-w-full object-contain"
                  onLoad={() => setImageLoading(false)}
                  onError={() => {
                    setImageLoading(false);
                    setPreviewRenderError("Gambar tidak dapat ditampilkan. Silakan coba lagi atau unduh berkas.");
                    if (fileRequest.current?.url === previewUrl) {
                      window.URL.revokeObjectURL(previewUrl);
                      fileRequest.current.url = "";
                    }
                    setPreviewUrl("");
                  }} />
              </div>
            )}
            {previewUrl && previewMimeType === "application/pdf" && <PdfPreview key={previewUrl} url={previewUrl} title={`Preview ${document.title}`} className="mt-4 h-[75vh] min-h-[360px] w-full rounded-lg border border-slate-200 md:min-h-[650px]" />}
            {downloadErrorMessage && (
              <p role="alert" className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">{downloadErrorMessage}</p>
            )}
          </section>
        </section>
      </main>
    </div>
  );
}

export default AdminDocumentDetailPage;
