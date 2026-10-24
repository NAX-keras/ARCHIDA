import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import AdminNavbar from "../../layouts/AdminNavbar";
import {
  deleteAdminDocument,
  downloadDocument,
  getDocuments,
  getDocumentById,
  updateAdminDocumentMetadata,
  updateDocumentAccess,
  uploadAdminDocument,
} from "../../services/api";

const DOCUMENT_LIMIT = 50;

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

const UPLOAD_CATEGORY_OPTIONS = CATEGORY_OPTIONS.filter(
  (category) => category.value !== "ALL",
);

const INITIAL_UPLOAD_FORM = {
  title: "",
  category_id: "",
  year: "",
  document_number: "",
  faculty: "",
  access_level: "PUBLIC",
  description: "",
  keywords: "",
};

function getAccessLabel(accessLevel) {
  const normalizedAccess = String(accessLevel || "").toUpperCase();

  if (normalizedAccess === "PRIVATE") {
    return "Private";
  }

  if (normalizedAccess === "PUBLIC") {
    return "Public";
  }

  return "-";
}

function getProcessingBadgeClass(processingStatus) {
  const normalizedStatus = String(processingStatus || "").toLowerCase();

  if (normalizedStatus === "failed") {
    return "bg-red-50 text-red-700";
  }

  if (normalizedStatus === "processing") {
    return "bg-amber-50 text-amber-700";
  }

  return "bg-emerald-50 text-emerald-700";
}

function getFilterButtonClass(isActive) {
  if (isActive) {
    return "bg-blue-900 text-white border-blue-900";
  }

  return "bg-white text-slate-700 border-slate-300 hover:bg-slate-50";
}

function handleBasicModalKeyDown(event, closeModal) {
  if (event.key === "Escape") {
    event.preventDefault();
    closeModal();
    return;
  }
  if (event.key !== "Tab") return;
  const elements = Array.from(event.currentTarget.querySelectorAll(
    'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]',
  ));
  const first = elements[0];
  const last = elements.at(-1);
  const active = event.currentTarget.ownerDocument.activeElement;
  if (!first) {
    event.preventDefault();
  } else if (event.shiftKey && (active === first || !elements.includes(active))) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && (active === last || !elements.includes(active))) {
    event.preventDefault();
    first.focus();
  }
}

function RepositoryPage() {
  const navigate = useNavigate();

  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const pendingDownloads = useRef(new Set());
  const [downloadingDocumentIds, setDownloadingDocumentIds] = useState(new Set());
  const [unavailableDownloads, setUnavailableDownloads] = useState(new Set());
  const [downloadErrors, setDownloadErrors] = useState({});

  const [searchKeyword, setSearchKeyword] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("ALL");
  const [selectedAccess, setSelectedAccess] = useState("ALL");

  const [limit] = useState(DOCUMENT_LIMIT);
  const [offset, setOffset] = useState(0);
  const [totalDocuments, setTotalDocuments] = useState(0);

  const [summaryCounts, setSummaryCounts] = useState({
    total: 0,
    public: 0,
    private: 0,
  });

  const [updatingAccessId, setUpdatingAccessId] = useState(null);

  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [uploadForm, setUploadForm] = useState(INITIAL_UPLOAD_FORM);
  const [uploadFile, setUploadFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadErrorMessage, setUploadErrorMessage] = useState("");
  const [uploadSuccessMessage, setUploadSuccessMessage] = useState("");

  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [selectedDeleteDocument, setSelectedDeleteDocument] = useState(null);
  const [deletingDocumentId, setDeletingDocumentId] = useState(null);
  const [deleteErrorMessage, setDeleteErrorMessage] = useState("");
  const [deleteSuccessMessage, setDeleteSuccessMessage] = useState("");


  const [editDocumentId, setEditDocumentId] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [initialEditForm, setInitialEditForm] = useState(null);
  const [editLoading, setEditLoading] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState("");
  const [editSuccess, setEditSuccess] = useState("");
  const editRequest = useRef(0);
  const editPending = useRef(false);
  const editTrigger = useRef(null);

  useEffect(() => {
    if (!isUploadModalOpen && !isDeleteModalOpen) return;
    const modal = globalThis.document?.querySelector("[data-basic-modal]");
    if (!modal) return;
    const trigger = globalThis.document.activeElement;
    modal.focus();
    return () => {
      if (trigger?.isConnected) trigger.focus();
    };
  }, [isUploadModalOpen, isDeleteModalOpen]);

  const buildDocumentParams = ({
    nextOffset = offset,
    nextSearchKeyword = searchKeyword,
    nextSelectedCategory = selectedCategory,
    nextSelectedAccess = selectedAccess,
  } = {}) => {
    const params = {
      limit,
      offset: nextOffset,
    };

    const trimmedSearchKeyword = nextSearchKeyword.trim();

    if (trimmedSearchKeyword) {
      params.search = trimmedSearchKeyword;
    }

    if (nextSelectedCategory !== "ALL") {
      params.category_id = nextSelectedCategory;
    }

    if (nextSelectedAccess !== "ALL") {
      params.access_level = nextSelectedAccess;
    }

    return params;
  };

  const loadSummaryCounts = async () => {
    try {
      const [allResult, publicResult, privateResult] = await Promise.all([
        getDocuments({
          limit: 1,
          offset: 0,
        }),
        getDocuments({
          access_level: "PUBLIC",
          limit: 1,
          offset: 0,
        }),
        getDocuments({
          access_level: "PRIVATE",
          limit: 1,
          offset: 0,
        }),
      ]);

      setSummaryCounts({
        total: allResult.meta?.total ?? allResult.data?.length ?? 0,
        public: publicResult.meta?.total ?? publicResult.data?.length ?? 0,
        private: privateResult.meta?.total ?? privateResult.data?.length ?? 0,
      });
    } catch (error) {
      console.error("Summary counts error:", error);
    }
  };

  const loadDocuments = async ({
    nextOffset = offset,
    nextSearchKeyword = searchKeyword,
    nextSelectedCategory = selectedCategory,
    nextSelectedAccess = selectedAccess,
  } = {}) => {
    try {
      setLoading(true);
      setErrorMessage("");

      const params = buildDocumentParams({
        nextOffset,
        nextSearchKeyword,
        nextSelectedCategory,
        nextSelectedAccess,
      });

      const result = await getDocuments(params);

      setDocuments(result.data || []);
      setTotalDocuments(result.meta?.total ?? result.data?.length ?? 0);
      setOffset(nextOffset);
    } catch (error) {
      console.error("Repository admin error:", error);

      setDocuments([]);
      setTotalDocuments(0);
      setErrorMessage(
        error.message || "Daftar dokumen gagal diambil dari backend.",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSummaryCounts();
    loadDocuments({
      nextOffset: 0,
      nextSearchKeyword: "",
      nextSelectedCategory: "ALL",
      nextSelectedAccess: "ALL",
    });
  }, []);

  const hasPreviousPage = offset > 0;
  const hasNextPage = offset + limit < totalDocuments;

  const handleSearchSubmit = (event) => {
    event.preventDefault();

    loadDocuments({
      nextOffset: 0,
      nextSearchKeyword: searchKeyword,
      nextSelectedCategory: selectedCategory,
      nextSelectedAccess: selectedAccess,
    });
  };

  const handleResetFilter = () => {
    setSearchKeyword("");
    setSelectedCategory("ALL");
    setSelectedAccess("ALL");
    setOffset(0);

    loadDocuments({
      nextOffset: 0,
      nextSearchKeyword: "",
      nextSelectedCategory: "ALL",
      nextSelectedAccess: "ALL",
    });
  };

  const handleCategoryChange = (event) => {
    const nextSelectedCategory = event.target.value;

    setSelectedCategory(nextSelectedCategory);
    setOffset(0);

    loadDocuments({
      nextOffset: 0,
      nextSearchKeyword: searchKeyword,
      nextSelectedCategory,
      nextSelectedAccess: selectedAccess,
    });
  };

  const handleAccessFilterChange = (accessLevel) => {
    setSelectedAccess(accessLevel);
    setOffset(0);

    loadDocuments({
      nextOffset: 0,
      nextSearchKeyword: searchKeyword,
      nextSelectedCategory: selectedCategory,
      nextSelectedAccess: accessLevel,
    });
  };

  const handlePreviousPage = () => {
    if (!hasPreviousPage) {
      return;
    }

    const previousOffset = Math.max(offset - limit, 0);

    loadDocuments({
      nextOffset: previousOffset,
      nextSearchKeyword: searchKeyword,
      nextSelectedCategory: selectedCategory,
      nextSelectedAccess: selectedAccess,
    });
  };

  const handleNextPage = () => {
    if (!hasNextPage) {
      return;
    }

    const nextOffset = offset + limit;

    loadDocuments({
      nextOffset,
      nextSearchKeyword: searchKeyword,
      nextSelectedCategory: selectedCategory,
      nextSelectedAccess: selectedAccess,
    });
  };


  const handleOpenEdit = async (item, event) => {
    if (editPending.current) return;
    const documentId = item.document_id ?? item.id;
    const requestId = ++editRequest.current;
    editTrigger.current = event?.currentTarget;
    setEditDocumentId(documentId);
    setEditForm(null);
    setInitialEditForm(null);
    setEditLoading(true);
    setEditError("");
    setEditSuccess("");
    setUploadSuccessMessage("");
    setDeleteSuccessMessage("");
    try {
      const result = await getDocumentById(documentId);
      if (requestId !== editRequest.current) return;
      // Use persisted values, not display placeholders such as "-".
      const raw = result.data.raw ?? result.data;
      const form = Object.fromEntries(
        ["title", "category_id", "year", "faculty", "description", "keywords"]
          .map((field) => [field, String(raw[field] ?? "")]),
      );
      setEditForm(form);
      setInitialEditForm(form);
    } catch (error) {
      if (requestId === editRequest.current) {
        setEditError(error.message || "Metadata dokumen gagal diambil.");
      }
    } finally {
      if (requestId === editRequest.current) setEditLoading(false);
    }
  };

  const handleCloseEdit = () => {
    if (editPending.current) return;
    ++editRequest.current;
    setEditDocumentId(null);
    setEditForm(null);
    setInitialEditForm(null);
    setEditError("");
    editTrigger.current?.focus?.();
  };

  const handleEditKeyDown = (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      handleCloseEdit();
    }
    if (event.key === "Tab") {
      const controls = event.currentTarget.querySelectorAll(
        "button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled)",
      );
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }
  };

  const handleEditChange = (event) => {
    const { name, value } = event.target;
    setEditForm((current) => ({ ...current, [name]: value }));
  };

  const handleEditSubmit = async (event) => {
    event.preventDefault();
    if (editPending.current || !editForm || !initialEditForm) return;
    setEditError("");
    if (!editForm.title.trim()) {
      setEditError("Judul Dokumen wajib diisi.");
      return;
    }
    const changes = {};
    for (const [field, value] of Object.entries(editForm)) {
      if (value === initialEditForm[field]) continue;
      const clean = value.trim();
      if (field === "category_id" && !clean) {
        setEditError("Pilih kategori dokumen.");
        return;
      }
      if (field === "year" || field === "category_id") {
        const numeric = clean ? Number(clean) : null;
        if (numeric !== null && (!Number.isInteger(numeric) ||
            (field === "year" && (numeric < 1900 || numeric > 2100)))) {
          setEditError("Tahun harus berupa angka antara 1900 dan 2100.");
          return;
        }
        changes[field] = numeric;
      } else {
        changes[field] = clean || null;
      }
    }
    if (Object.keys(changes).length === 0) {
      handleCloseEdit();
      return;
    }
    editPending.current = true;
    setEditSaving(true);
    try {
      const result = await updateAdminDocumentMetadata(editDocumentId, changes);
      setDocuments((current) => current.map((item) =>
        (item.document_id ?? item.id) === editDocumentId ? result.data : item,
      ));
      setEditSuccess(result.message);
      editPending.current = false;
      handleCloseEdit();
      await loadDocuments();
    } catch (error) {
      setEditError(error.message || "Metadata gagal disimpan. Silakan coba lagi.");
    } finally {
      editPending.current = false;
      setEditSaving(false);
    }
  };


  const handleDetailClick = (document) => {
    const documentId = document.document_id ?? document.id;

    navigate(`/admin/documents/${documentId}`, {
      state: {
        document,
      },
    });
  };

  const handleDownload = async (document) => {
    const documentId = document.document_id ?? document.id;
    if (!documentId || unavailableDownloads.has(documentId) || pendingDownloads.current.has(documentId)) return;

    const downloadMetadata = document.raw ?? document;
    const fileName = [downloadMetadata.file_name, downloadMetadata.title]
      .find((value) => typeof value === "string" && value.trim() && value.trim() !== "-")
      ?.trim() || `dokumen-${documentId}.pdf`;

    pendingDownloads.current.add(documentId);
    setDownloadingDocumentIds(new Set(pendingDownloads.current));
    setDownloadErrors((previous) => ({ ...previous, [documentId]: "" }));
    try {
      await downloadDocument(documentId, fileName);
    } catch (error) {
      if (error.fileUnavailable) setUnavailableDownloads((previous) => new Set(previous).add(documentId));
      setDownloadErrors((previous) => ({
        ...previous,
        [documentId]: error.message || "Gagal mengunduh dokumen. Silakan coba lagi.",
      }));
    } finally {
      pendingDownloads.current.delete(documentId);
      setDownloadingDocumentIds(new Set(pendingDownloads.current));
    }
  };

  const handleToggleAccess = async (document) => {
    const documentId = document.document_id ?? document.id;
    const currentAccessLevel = String(
      document.access_level || "",
    ).toUpperCase();

    const nextAccessLevel =
      currentAccessLevel === "PRIVATE" ? "PUBLIC" : "PRIVATE";

    const confirmMessage =
      nextAccessLevel === "PRIVATE"
        ? "Ubah akses dokumen ini menjadi Private?"
        : "Ubah akses dokumen ini menjadi Public?";

    const isConfirmed = window.confirm(confirmMessage);

    if (!isConfirmed) {
      return;
    }

    try {
      setUpdatingAccessId(documentId);

      await updateDocumentAccess(documentId, nextAccessLevel);

      await Promise.all([
        loadDocuments({
          nextOffset: offset,
          nextSearchKeyword: searchKeyword,
          nextSelectedCategory: selectedCategory,
          nextSelectedAccess: selectedAccess,
        }),
        loadSummaryCounts(),
      ]);
    } catch (error) {
      console.error("Update access error:", error);

      alert(
        error.message ||
          "Gagal mengubah akses dokumen. Silakan periksa backend.",
      );
    } finally {
      setUpdatingAccessId(null);
    }
  };

  const resetUploadForm = () => {
    setUploadForm(INITIAL_UPLOAD_FORM);
    setUploadFile(null);
    setUploadErrorMessage("");
  };

  const handleOpenUploadModal = () => {
    setDeleteSuccessMessage("");
    setUploadSuccessMessage("");
    setUploadErrorMessage("");
    setIsUploadModalOpen(true);
  };

  const handleCloseUploadModal = () => {
    if (uploading) {
      return;
    }

    setIsUploadModalOpen(false);
    resetUploadForm();
  };

  const handleUploadInputChange = (event) => {
    const { name, value } = event.target;

    setUploadForm((currentForm) => ({
      ...currentForm,
      [name]: value,
    }));
  };

  const handleUploadFileChange = (event) => {
    const selectedFile = event.target.files?.[0] || null;

    setUploadFile(selectedFile);
    setUploadErrorMessage("");
  };

  const validateUploadForm = () => {
    const trimmedTitle = uploadForm.title.trim();

    if (!trimmedTitle) {
      return "Judul Dokumen wajib diisi.";
    }

    if (!uploadFile) {
      return "File PDF wajib dipilih.";
    }

    const isPdfFile =
      uploadFile.type === "application/pdf" ||
      uploadFile.name.toLowerCase().endsWith(".pdf");

    if (!isPdfFile) {
      return "File yang diunggah harus berformat PDF.";
    }

    if (!uploadForm.category_id) {
      return "Kategori dokumen wajib dipilih.";
    }

    if (!["PUBLIC", "PRIVATE"].includes(uploadForm.access_level)) {
      return "Akses dokumen harus PUBLIC atau PRIVATE.";
    }

    return "";
  };

  const handleUploadSubmit = async (event) => {
    event.preventDefault();

    const validationMessage = validateUploadForm();

    if (validationMessage) {
      setUploadErrorMessage(validationMessage);
      return;
    }

    try {
      setUploading(true);
      setUploadErrorMessage("");
      setUploadSuccessMessage("");
      setDeleteSuccessMessage("");

      const formData = new FormData();

      formData.append("file", uploadFile);
      formData.append("title", uploadForm.title.trim());
      formData.append("category_id", uploadForm.category_id);
      formData.append("access_level", uploadForm.access_level);

      if (uploadForm.year) {
        formData.append("year", uploadForm.year);
      }

      if (uploadForm.document_number.trim()) {
        formData.append("document_number", uploadForm.document_number.trim());
      }

      if (uploadForm.faculty.trim()) {
        formData.append("faculty", uploadForm.faculty.trim());
      }

      if (uploadForm.description.trim()) {
        formData.append("description", uploadForm.description.trim());
      }

      if (uploadForm.keywords.trim()) {
        formData.append("keywords", uploadForm.keywords.trim());
      }

      await uploadAdminDocument(formData);

      setUploadSuccessMessage("Dokumen berhasil diunggah.");

      setIsUploadModalOpen(false);
      resetUploadForm();

      setSearchKeyword("");
      setSelectedCategory("ALL");
      setSelectedAccess("ALL");
      setOffset(0);

      await Promise.all([
        loadDocuments({
          nextOffset: 0,
          nextSearchKeyword: "",
          nextSelectedCategory: "ALL",
          nextSelectedAccess: "ALL",
        }),
        loadSummaryCounts(),
      ]);
    } catch (error) {
      console.error("Upload document error:", error);

      setUploadErrorMessage(
        error.message ||
          "Upload dokumen gagal. Silakan periksa file dan data metadata.",
      );
    } finally {
      setUploading(false);
    }
  };

  const handleOpenDeleteModal = (document) => {
    setUploadSuccessMessage("");
    setDeleteSuccessMessage("");
    setDeleteErrorMessage("");
    setSelectedDeleteDocument(document);
    setIsDeleteModalOpen(true);
  };

  const handleCloseDeleteModal = () => {
    if (deletingDocumentId) {
      return;
    }

    setIsDeleteModalOpen(false);
    setSelectedDeleteDocument(null);
    setDeleteErrorMessage("");
  };

  const handleConfirmDelete = async () => {
    if (!selectedDeleteDocument) {
      setDeleteErrorMessage("Dokumen yang akan dihapus tidak tersedia.");
      return;
    }

    const documentId =
      selectedDeleteDocument.document_id ?? selectedDeleteDocument.id;

    if (!documentId) {
      setDeleteErrorMessage("ID dokumen tidak tersedia.");
      return;
    }

    try {
      setDeletingDocumentId(documentId);
      setDeleteErrorMessage("");
      setDeleteSuccessMessage("");
      setUploadSuccessMessage("");

      await deleteAdminDocument(documentId);

      const nextOffset =
        documents.length === 1 && offset > 0
          ? Math.max(offset - limit, 0)
          : offset;

      setIsDeleteModalOpen(false);
      setSelectedDeleteDocument(null);
      setDeleteSuccessMessage("Dokumen berhasil dihapus.");

      await Promise.all([
        loadDocuments({
          nextOffset,
          nextSearchKeyword: searchKeyword,
          nextSelectedCategory: selectedCategory,
          nextSelectedAccess: selectedAccess,
        }),
        loadSummaryCounts(),
      ]);
    } catch (error) {
      console.error("Delete document error:", error);

      setDeleteErrorMessage(
        error.message ||
          "Dokumen gagal dihapus. Silakan periksa koneksi backend.",
      );
    } finally {
      setDeletingDocumentId(null);
    }
  };

  const startNumber = totalDocuments === 0 ? 0 : offset + 1;
  const endNumber = Math.min(offset + documents.length, totalDocuments);

  const selectedCategoryLabel =
    CATEGORY_OPTIONS.find((category) => category.value === selectedCategory)
      ?.label || "Semua Kategori";

  const deleteDocumentTitle =
    selectedDeleteDocument?.title ||
    selectedDeleteDocument?.file_name ||
    "Dokumen ini";

  return (
    <div className="app-shell admin-shell">
      <AdminNavbar />

      <main id="main-content" tabIndex={-1} className="app-main">
        <section className="page-intro">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <h1 className="text-2xl font-bold text-slate-800">
                Repositori Admin
              </h1>

              <p className="mt-2 text-sm leading-6 text-slate-600">
                Pantau daftar dokumen arsip dan kelola akses dokumen pada sistem
                ArsipSemantik.
              </p>
            </div>

            <button
              type="button"
              onClick={handleOpenUploadModal}
              className="rounded-lg bg-blue-900 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-800"
            >
              Upload Dokumen
            </button>
          </div>

          {editSuccess && (
            <p role="status" className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
              {editSuccess}
            </p>
          )}

          {uploadSuccessMessage && (
            <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
              {uploadSuccessMessage}
            </div>
          )}

          {deleteSuccessMessage && (
            <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
              {deleteSuccessMessage}
            </div>
          )}

          <div className="four-stats mt-6 grid gap-4 md:grid-cols-3">
            <div className="stat-card">
              <p className="text-sm text-slate-500">Total Dokumen</p>

              <h2 className="mt-2 text-2xl font-bold text-blue-900">
                {summaryCounts.total}
              </h2>

              <p className="mt-2 text-xs text-slate-400">
                Seluruh dokumen pada repositori
              </p>
            </div>

            <div className="stat-card">
              <p className="text-sm text-slate-500">Dokumen Public</p>

              <h2 className="mt-2 text-2xl font-bold text-emerald-700">
                {summaryCounts.public}
              </h2>

              <p className="mt-2 text-xs text-slate-400">
                Dapat diakses mahasiswa
              </p>
            </div>

            <div className="stat-card">
              <p className="text-sm text-slate-500">Dokumen Private</p>

              <h2 className="mt-2 text-2xl font-bold text-amber-700">
                {summaryCounts.private}
              </h2>

              <p className="mt-2 text-xs text-slate-400">
                Akses dibatasi untuk mahasiswa
              </p>
            </div>

          </div>

          <p className="mt-4 text-xs text-slate-500">
            Admin dapat mengunggah dokumen PDF, menghapus dokumen, mengatur
            akses Public/Private, mengunduh file asli, serta memantau metadata
            dokumen serta mengedit metadatanya.
          </p>
        </section>

        <section className="mt-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-5">
            <h2 className="text-lg font-semibold text-slate-800">
              Daftar Dokumen
            </h2>

            <p className="text-sm text-slate-500">
              Telusuri dokumen berdasarkan judul, kategori, dan tingkat akses.
            </p>
          </div>

          <details className="filter-accordion">
            <summary><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M3 4h18l-7 8v7l-4 2v-9z" /></svg>Filter Dokumen</summary>
            <div className="filter-panel">
            <form
              onSubmit={handleSearchSubmit}
              className="grid items-end gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_220px_auto_auto]"
            >
              <div>
              <label htmlFor="repository-search" className="mb-2 block text-sm font-medium text-slate-700">Judul atau Nama File</label>
              <input
                id="repository-search"
                type="text"
                value={searchKeyword}
                onChange={(event) => setSearchKeyword(event.target.value)}
                placeholder="Cari judul atau nama file..."
                className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 outline-none focus:border-blue-900 focus:ring-2 focus:ring-blue-100"
              />
              </div>
              <div>
              <label htmlFor="repository-category" className="mb-2 block text-sm font-medium text-slate-700">Kategori</label>
              <select
                id="repository-category"
                value={selectedCategory}
                onChange={handleCategoryChange}
                className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 outline-none focus:border-blue-900 focus:ring-2 focus:ring-blue-100"
              >
                {CATEGORY_OPTIONS.map((category) => (
                  <option key={category.value} value={category.value}>
                    {category.label}
                  </option>
                ))}
              </select>
              </div>

              <button
                type="submit"
                className="rounded-lg bg-blue-900 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-800"
              >
                Terapkan
              </button>

              <button
                type="button"
                onClick={handleResetFilter}
                className="rounded-lg border border-slate-300 bg-white px-5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
              >
                Reset
              </button>
            </form>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => handleAccessFilterChange("ALL")}
                className={`rounded-lg border px-4 py-2 text-sm font-medium ${getFilterButtonClass(
                  selectedAccess === "ALL",
                )}`}
              >
                Semua
              </button>

              <button
                type="button"
                onClick={() => handleAccessFilterChange("PUBLIC")}
                className={`rounded-lg border px-4 py-2 text-sm font-medium ${getFilterButtonClass(
                  selectedAccess === "PUBLIC",
                )}`}
              >
                Public
              </button>

              <button
                type="button"
                onClick={() => handleAccessFilterChange("PRIVATE")}
                className={`rounded-lg border px-4 py-2 text-sm font-medium ${getFilterButtonClass(
                  selectedAccess === "PRIVATE",
                )}`}
              >
                Private
              </button>
            </div>

            </div>
          </details>
            <p className="filter-summary">
              Filter aktif: kategori {selectedCategoryLabel}, akses{" "}
              {selectedAccess}, kata kunci{" "}
              {searchKeyword.trim() ? `"${searchKeyword.trim()}"` : "-"}.
            </p>
          

          {loading && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-8 text-center">
              <p className="text-sm font-medium text-slate-700">
                Memuat daftar dokumen...
              </p>

              <p className="mt-2 text-sm text-slate-500">
                Sistem sedang mengambil data repositori Admin dari backend.
              </p>
            </div>
          )}

          {!loading && errorMessage && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {errorMessage}
            </div>
          )}

          {!loading && !errorMessage && documents.length === 0 && (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
              <h3 className="text-base font-semibold text-slate-800">
                Dokumen tidak ditemukan
              </h3>

              <p className="mt-2 text-sm text-slate-500">
                Tidak ada dokumen yang sesuai dengan filter atau kata kunci yang
                dipilih.
              </p>
            </div>
          )}

          {!loading && !errorMessage && documents.length > 0 && (
            <>
              <div className="table-scroll" tabIndex={0} role="region" aria-label="Daftar dokumen, geser untuk melihat semua kolom">
                <table className="repository-table w-full border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
                      <th className="px-4 py-3 font-semibold">Judul Dokumen</th>
                      <th className="px-4 py-3 font-semibold">Kategori</th>
                      <th className="px-4 py-3 font-semibold">Tahun</th>
                      <th className="px-4 py-3 font-semibold">Akses</th>
                      <th className="px-4 py-3 font-semibold">Sumber</th>
                      <th className="px-4 py-3 font-semibold">Aksi</th>
                    </tr>
                  </thead>

                  <tbody>
                    {documents.map((document, index) => {
                      const documentId = document.document_id ?? document.id;
                      const accessLevel = String(
                        document.access_level || "",
                      ).toUpperCase();
                      const isPrivate = accessLevel === "PRIVATE";
                      const isUpdating = updatingAccessId === documentId;
                      const isDeleting = deletingDocumentId === documentId;
                      const isDownloading = downloadingDocumentIds.has(documentId);

                      return (
                        <tr
                          key={documentId ?? index}
                          className="border-b border-slate-100 hover:bg-slate-50"
                        >

                          <td className="px-4 py-3">
                            <p className="font-medium text-slate-800">
                              {document.title}
                            </p>

                            <p className="mt-1 text-xs text-slate-500">
                              {document.file_name}
                            </p>
                          </td>

                          <td className="px-4 py-3 text-slate-600">
                            {document.category}
                          </td>

                          <td className="px-4 py-3 text-slate-600">
                            {document.year}
                          </td>

                          <td className="px-4 py-3">
                            <div className="flex flex-col gap-2">
                              <span
                                className={`w-fit rounded-full px-3 py-1 text-xs font-medium ${
                                  isPrivate
                                    ? "bg-amber-50 text-amber-700"
                                    : "bg-emerald-50 text-emerald-700"
                                }`}
                              >
                                {getAccessLabel(accessLevel)}
                              </span>

                              <button
                                type="button"
                                onClick={() => handleToggleAccess(document)}
                                aria-label={`Ubah akses menjadi ${isPrivate ? "Public" : "Private"}: ${document.title}`}
                                disabled={isUpdating || isDeleting}
                                className={`w-fit rounded-lg border px-3 py-1.5 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-60 ${
                                  isPrivate
                                    ? "border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                                    : "border-amber-300 text-amber-700 hover:bg-amber-50"
                                }`}
                              >
                                {isUpdating
                                  ? "..."
                                  : isPrivate
                                    ? "Public"
                                    : "Private"}
                              </button>
                            </div>
                          </td>

                          <td className="px-4 py-3">
                            <p className="mb-2 text-xs text-slate-600">{document.extractionMethodLabel || document.extraction_method || "-"}</p>
                            <span
                              className={`rounded-full px-3 py-1 text-xs font-medium ${getProcessingBadgeClass(
                                document.processing_status,
                              )}`}
                            >
                              {document.processingStatusLabel ||
                                document.status}
                            </span>
                          </td>

                          <td className="whitespace-nowrap px-4 py-3">
                            <div className="row-actions">
                              <button
                                type="button"
                                onClick={() => handleDetailClick(document)}
                                disabled={isDeleting}
                                className="rounded-lg bg-blue-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-slate-400"
                              >
                                Detail
                              </button>


                              <button
                                type="button"
                                onClick={(event) => handleOpenEdit(document, event)}
                                disabled={isDeleting}
                                className="rounded-lg border border-blue-300 px-3 py-1.5 text-xs font-medium text-blue-900 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                Edit
                              </button>

                              <button
                                type="button"
                                onClick={() => handleDownload(document)}
                                disabled={isDeleting || isDownloading || unavailableDownloads.has(documentId) || !documentId}
                                aria-busy={isDownloading}
                                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {isDownloading ? "Mengunduh..." : "Unduh"}
                              </button>

                              <button
                                type="button"
                                onClick={() => handleOpenDeleteModal(document)}
                                disabled={isDeleting}
                                className="rounded-lg border border-red-300 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {isDeleting ? "Menghapus..." : "Hapus"}
                              </button>
                            </div>
                            {downloadErrors[documentId] && (
                              <p role="alert" className="mt-2 max-w-xs whitespace-normal text-xs text-red-700">
                                {downloadErrors[documentId]}
                              </p>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="mt-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <p className="text-sm text-slate-500">
                  Menampilkan {startNumber} - {endNumber} dari {totalDocuments}{" "}
                  dokumen.
                </p>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handlePreviousPage}
                    disabled={!hasPreviousPage || loading}
                    className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Sebelumnya
                  </button>

                  <button
                    type="button"
                    onClick={handleNextPage}
                    disabled={!hasNextPage || loading}
                    className="rounded-lg bg-blue-900 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-slate-400"
                  >
                    Selanjutnya
                  </button>
                </div>
              </div>
            </>
          )}
        </section>
      </main>


      {editDocumentId !== null && (
        <div className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center">
          <div role="dialog" aria-modal="true" aria-labelledby="edit-metadata-title"
            onKeyDown={handleEditKeyDown}
            className="modal-panel w-full max-w-3xl bg-white shadow-xl">
            <div className="border-b border-slate-200 p-6">
              <h2 id="edit-metadata-title" className="text-xl font-bold text-slate-800">Edit Metadata</h2>
              <p className="mt-1 text-sm text-slate-500">Perbarui informasi dokumen. Berkas asli dan akses dokumen tetap sama.</p>
            </div>
            <form onSubmit={handleEditSubmit} className="p-6">
              {editLoading && <p role="status" className="mb-4 text-sm text-slate-500">Memuat metadata...</p>}
              {editError && <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{editError}</p>}
              {editForm && (
                <fieldset disabled={editSaving} className="grid gap-4 md:grid-cols-2">
                  <div className="md:col-span-2">
                    <label htmlFor="edit-title" className="mb-1 block text-sm font-medium text-slate-700">Judul Dokumen *</label>
                    <input id="edit-title" name="title" value={editForm.title} onChange={handleEditChange}
                      required maxLength={255} autoFocus
                      className="w-full rounded-lg border border-slate-300 px-4 py-2 text-sm focus:border-blue-900" />
                  </div>
                  <div>
                    <label htmlFor="edit-category" className="mb-1 block text-sm font-medium text-slate-700">Kategori</label>
                    <select id="edit-category" name="category_id" value={editForm.category_id} onChange={handleEditChange}
                      className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm">
                      <option value="">Pilih Kategori</option>
                      {editForm.category_id && !UPLOAD_CATEGORY_OPTIONS.some((item) => item.value === editForm.category_id) &&
                        <option value={editForm.category_id}>Kategori {editForm.category_id}</option>}
                      {UPLOAD_CATEGORY_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="edit-year" className="mb-1 block text-sm font-medium text-slate-700">Tahun</label>
                    <input id="edit-year" name="year" type="number" min={1900} max={2100} step={1}
                      value={editForm.year} onChange={handleEditChange}
                      className="w-full rounded-lg border border-slate-300 px-4 py-2 text-sm" />
                  </div>
                  <div>
                    <label htmlFor="edit-faculty" className="mb-1 block text-sm font-medium text-slate-700">Fakultas/Unit</label>
                    <input id="edit-faculty" name="faculty" maxLength={150} value={editForm.faculty} onChange={handleEditChange}
                      className="w-full rounded-lg border border-slate-300 px-4 py-2 text-sm" />
                  </div>
                  <div>
                    <label htmlFor="edit-keywords" className="mb-1 block text-sm font-medium text-slate-700">Kata Kunci</label>
                    <input id="edit-keywords" name="keywords" value={editForm.keywords} onChange={handleEditChange}
                      className="w-full rounded-lg border border-slate-300 px-4 py-2 text-sm" />
                  </div>
                  <div className="md:col-span-2">
                    <label htmlFor="edit-description" className="mb-1 block text-sm font-medium text-slate-700">Deskripsi</label>
                    <textarea id="edit-description" name="description" rows={4} value={editForm.description} onChange={handleEditChange}
                      className="w-full rounded-lg border border-slate-300 px-4 py-2 text-sm" />
                  </div>
                </fieldset>
              )}
              <div className="mt-6 flex justify-end gap-3">
                <button type="button" onClick={handleCloseEdit} disabled={editSaving}
                  autoFocus={!editForm}
                  className="rounded-lg border border-slate-300 px-5 py-2 text-sm font-medium text-slate-700 disabled:opacity-60">Batal</button>
                <button type="submit" disabled={editLoading || editSaving || !editForm} aria-busy={editSaving}
                  className="rounded-lg bg-blue-900 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:bg-slate-400">
                  {editSaving ? "Menyimpan..." : "Simpan"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isDeleteModalOpen && (
        <div className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center">
          <div role="dialog" aria-modal="true" aria-labelledby="delete-document-title"
            data-basic-modal tabIndex={-1}
            onKeyDown={(event) => handleBasicModalKeyDown(event, handleCloseDeleteModal)}
            className="modal-panel w-full max-w-lg bg-white shadow-xl">
            <div className="border-b border-slate-200 p-6">
              <h2 id="delete-document-title" className="text-xl font-bold text-slate-800">
                Konfirmasi Hapus Dokumen
              </h2>

              <p className="mt-2 text-sm leading-6 text-slate-500">
                Pastikan dokumen yang dipilih memang sudah tidak diperlukan.
              </p>
            </div>

            <div className="p-6">
              {deleteErrorMessage && (
                <div className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                  {deleteErrorMessage}
                </div>
              )}

              <div className="rounded-xl border border-red-200 bg-red-50 p-4">
                <p className="text-sm font-semibold text-red-800">
                  {deleteDocumentTitle}
                </p>

                <p className="mt-2 text-sm leading-6 text-red-700">
                  Dokumen ini akan dihapus dari repositori Admin. Metadata,
                  embedding, dan data dokumen terkait akan ikut dihapus. Jika
                  dokumen berasal dari upload admin dan file lokal tersedia,
                  berkas asli juga akan dihapus dari penyimpanan.
                </p>
              </div>

              <div className="mt-6 flex flex-col-reverse gap-3 md:flex-row md:justify-end">
                <button
                  type="button"
                  onClick={handleCloseDeleteModal}
                  disabled={Boolean(deletingDocumentId)}
                  className="rounded-lg border border-slate-300 bg-white px-5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Batal
                </button>

                <button
                  type="button"
                  onClick={handleConfirmDelete}
                  disabled={Boolean(deletingDocumentId)}
                  className="rounded-lg bg-red-700 px-5 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:bg-slate-400"
                >
                  {deletingDocumentId ? "Menghapus..." : "Hapus"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {isUploadModalOpen && (
        <div className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center">
          <div role="dialog" aria-modal="true" aria-labelledby="upload-document-title"
            data-basic-modal tabIndex={-1}
            onKeyDown={(event) => handleBasicModalKeyDown(event, handleCloseUploadModal)}
            className="modal-panel w-full max-w-3xl bg-white shadow-xl">
            <div className="border-b border-slate-200 p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 id="upload-document-title" className="text-xl font-bold text-slate-800">
                    Upload Dokumen
                  </h2>

                  <p className="mt-1 text-sm leading-6 text-slate-500">
                    Pilih file PDF dan lengkapi informasi dokumen untuk
                    menambahkannya ke repositori.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleCloseUploadModal}
                  disabled={uploading}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Tutup
                </button>
              </div>
            </div>

            <form onSubmit={handleUploadSubmit} className="p-6">
              {uploadErrorMessage && (
                <div className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                  {uploadErrorMessage}
                </div>
              )}

              <div className="grid gap-4 md:grid-cols-2">
                <div className="md:col-span-2">
                  <label htmlFor="upload-title" className="mb-1 block text-sm font-medium text-slate-700">
                    Judul Dokumen <span className="text-red-600">*</span>
                  </label>

                  <input
                    type="text"
                    id="upload-title"
                    name="title"
                    value={uploadForm.title}
                    onChange={handleUploadInputChange}
                    placeholder="Contoh: Peraturan Akademik Tahun 2024"
                    className="w-full rounded-lg border border-slate-300 px-4 py-2 text-sm outline-none focus:border-blue-900 focus:ring-1 focus:ring-blue-900"
                  />
                </div>

                <div>
                  <label htmlFor="upload-file" className="mb-1 block text-sm font-medium text-slate-700">
                    File PDF <span className="text-red-600">*</span>
                  </label>

                  <input
                    id="upload-file"
                    type="file"
                    accept="application/pdf,.pdf"
                    onChange={handleUploadFileChange}
                    className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 file:mr-3 file:rounded-md file:border-0 file:bg-blue-900 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white"
                  />

                  <p className="mt-1 text-xs text-slate-400">
                    Hanya file PDF yang dapat diunggah.
                  </p>
                </div>

                <div>
                  <label htmlFor="upload-category_id" className="mb-1 block text-sm font-medium text-slate-700">
                    Kategori <span className="text-red-600">*</span>
                  </label>

                  <select
                    id="upload-category_id"
                    name="category_id"
                    value={uploadForm.category_id}
                    onChange={handleUploadInputChange}
                    className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 outline-none focus:border-blue-900 focus:ring-1 focus:ring-blue-900"
                  >
                    <option value="">Pilih Kategori</option>

                    {UPLOAD_CATEGORY_OPTIONS.map((category) => (
                      <option key={category.value} value={category.value}>
                        {category.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="upload-year" className="mb-1 block text-sm font-medium text-slate-700">
                    Tahun
                  </label>

                  <input
                    type="number"
                    id="upload-year"
                    name="year"
                    value={uploadForm.year}
                    onChange={handleUploadInputChange}
                    placeholder="Contoh: 2024"
                    className="w-full rounded-lg border border-slate-300 px-4 py-2 text-sm outline-none focus:border-blue-900 focus:ring-1 focus:ring-blue-900"
                  />
                </div>

                <div>
                  <label htmlFor="upload-document_number" className="mb-1 block text-sm font-medium text-slate-700">
                    Nomor Dokumen
                  </label>

                  <input
                    type="text"
                    id="upload-document_number"
                    name="document_number"
                    value={uploadForm.document_number}
                    onChange={handleUploadInputChange}
                    placeholder="Contoh: 001/UNIDA/2024"
                    className="w-full rounded-lg border border-slate-300 px-4 py-2 text-sm outline-none focus:border-blue-900 focus:ring-1 focus:ring-blue-900"
                  />
                </div>

                <div>
                  <label htmlFor="upload-faculty" className="mb-1 block text-sm font-medium text-slate-700">
                    Unit/Fakultas
                  </label>

                  <input
                    type="text"
                    id="upload-faculty"
                    name="faculty"
                    value={uploadForm.faculty}
                    onChange={handleUploadInputChange}
                    placeholder="Contoh: Fakultas Sains dan Teknologi"
                    className="w-full rounded-lg border border-slate-300 px-4 py-2 text-sm outline-none focus:border-blue-900 focus:ring-1 focus:ring-blue-900"
                  />
                </div>

                <div>
                  <label htmlFor="upload-access_level" className="mb-1 block text-sm font-medium text-slate-700">
                    Akses Dokumen
                  </label>

                  <select
                    id="upload-access_level"
                    name="access_level"
                    value={uploadForm.access_level}
                    onChange={handleUploadInputChange}
                    className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 outline-none focus:border-blue-900 focus:ring-1 focus:ring-blue-900"
                  >
                    <option value="PUBLIC">PUBLIC</option>
                    <option value="PRIVATE">PRIVATE</option>
                  </select>
                </div>

                <div className="md:col-span-2">
                  <label htmlFor="upload-description" className="mb-1 block text-sm font-medium text-slate-700">
                    Deskripsi
                  </label>

                  <textarea
                    id="upload-description"
                    name="description"
                    value={uploadForm.description}
                    onChange={handleUploadInputChange}
                    rows={3}
                    placeholder="Tuliskan deskripsi singkat dokumen."
                    className="w-full rounded-lg border border-slate-300 px-4 py-2 text-sm outline-none focus:border-blue-900 focus:ring-1 focus:ring-blue-900"
                  />
                </div>

                <div className="md:col-span-2">
                  <label htmlFor="upload-keywords" className="mb-1 block text-sm font-medium text-slate-700">
                    Keywords
                  </label>

                  <input
                    type="text"
                    id="upload-keywords"
                    name="keywords"
                    value={uploadForm.keywords}
                    onChange={handleUploadInputChange}
                    placeholder="Contoh: akademik, mahasiswa, peraturan"
                    className="w-full rounded-lg border border-slate-300 px-4 py-2 text-sm outline-none focus:border-blue-900 focus:ring-1 focus:ring-blue-900"
                  />

                  <p className="mt-1 text-xs text-slate-400">
                    Pisahkan kata kunci menggunakan koma.
                  </p>
                </div>
              </div>

              <div className="mt-6 flex flex-col-reverse gap-3 md:flex-row md:justify-end">
                <button
                  type="button"
                  onClick={handleCloseUploadModal}
                  disabled={uploading}
                  className="rounded-lg border border-slate-300 bg-white px-5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Batal
                </button>

                <button
                  type="submit"
                  disabled={uploading}
                  className="rounded-lg bg-blue-900 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-slate-400"
                >
                  {uploading ? "Mengunggah..." : "Upload Dokumen"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default RepositoryPage;
