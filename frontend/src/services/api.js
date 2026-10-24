import { API_BASE_URL, apiFetch } from "./http";

async function readJsonResponse(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function normalizeAccessLevel(value) {
  const accessValue = String(value || "").toUpperCase();

  if (accessValue === "PUBLIC") {
    return {
      value: "PUBLIC",
      label: "Public",
      isPrivate: false,
    };
  }

  if (accessValue === "PRIVATE") {
    return {
      value: "PRIVATE",
      label: "Private",
      isPrivate: true,
    };
  }

  return {
    value: "-",
    label: "-",
    isPrivate: false,
  };
}

function normalizeProcessingStatus(value) {
  const statusValue = String(value || "").toLowerCase();

  if (statusValue === "completed") return "Selesai";
  if (statusValue === "processing") return "Diproses";
  if (statusValue === "failed") return "Gagal";

  return value || "-";
}

function normalizeExtractionMethod(value) {
  const methodValue = String(value || "").toLowerCase();

  if (methodValue === "metadata_import") return "Metadata Import";
  if (methodValue === "golden_pages") return "Golden Pages";

  return value || "-";
}

function normalizeDocumentItem(item, index = 0) {
  const metadata =
    item?.metadata || item?.document_metadata || item?.documentMetadata || {};

  const access = normalizeAccessLevel(
    item?.access_level ||
      item?.accessLevel ||
      metadata?.access_level ||
      metadata?.accessLevel,
  );

  const processingStatusRaw =
    item?.processing_status || item?.processingStatus || item?.status || "-";

  const extractionMethodRaw =
    item?.extraction_method ||
    item?.extractionMethod ||
    metadata?.extraction_method ||
    metadata?.extractionMethod ||
    "-";

  return {
    id: item?.id ?? item?.document_id ?? index + 1,
    document_id: item?.document_id ?? item?.id ?? index + 1,

    title:
      item?.title ||
      metadata?.title ||
      item?.file_name ||
      item?.fileName ||
      `Dokumen ${index + 1}`,

    file_name: item?.file_name || item?.fileName || "-",
    file_type: item?.file_type || item?.fileType || "-",
    file_size: item?.file_size || item?.fileSize || "-",

    category_id:
      item?.category_id ||
      item?.categoryId ||
      metadata?.category_id ||
      metadata?.categoryId ||
      null,

    category:
      item?.category ||
      metadata?.category ||
      item?.category_name ||
      metadata?.category_name ||
      metadata?.categoryName ||
      "-",

    year:
      item?.year ||
      metadata?.year ||
      item?.document_year ||
      metadata?.document_year ||
      metadata?.documentYear ||
      "-",

    document_type:
      item?.document_type ||
      item?.documentType ||
      metadata?.document_type ||
      metadata?.documentType ||
      "-",

    faculty: item?.faculty || metadata?.faculty || "-",

    description: item?.description || metadata?.description || "-",

    keywords: item?.keywords || metadata?.keywords || "-",

    access_level: access.value,
    accessLabel: access.label,
    isPrivate: access.isPrivate,

    status: normalizeProcessingStatus(processingStatusRaw),
    processing_status: processingStatusRaw,
    processingStatusLabel: normalizeProcessingStatus(processingStatusRaw),

    extraction_method: extractionMethodRaw,
    extractionMethodLabel: normalizeExtractionMethod(extractionMethodRaw),

    snippet:
      item?.snippet ||
      metadata?.description ||
      item?.description ||
      "Cuplikan dokumen belum tersedia.",

    similarity_score: item?.similarity_score ?? item?.similarityScore ?? null,

    cosine_distance: item?.cosine_distance ?? item?.cosineDistance ?? null,

    created_at: item?.created_at || item?.createdAt || null,
    updated_at: item?.updated_at || item?.updatedAt || null,

    raw: item,
  };
}

function normalizeCategorySummaryItem(item) {
  const categoryId =
    item?.category_id !== undefined
      ? item.category_id
      : (item?.categoryId ?? item?.id ?? null);
  const category = item?.category || item?.category_name || item?.categoryName || item?.name ||
    (categoryId === null ? "Tanpa Kategori" : `Kategori ${categoryId}`);

  return {
    category_id: categoryId,
    categoryId,
    categoryKey: categoryId === null ? `unidentified:${category}` : `category:${categoryId}`,
    category,
    total: Number(item?.total ?? item?.count ?? item?.document_count ?? 0),
    public_count: Number(item?.public_count ?? item?.publicCount ?? 0),
    private_count: Number(item?.private_count ?? item?.privateCount ?? 0),
    raw: item,
  };
}

function buildDocumentQueryParams(paramsOrLimit = 100, offsetArg = 0) {
  if (typeof paramsOrLimit === "object" && paramsOrLimit !== null) {
    return {
      search: paramsOrLimit.search ?? paramsOrLimit.searchKeyword,
      category_id: paramsOrLimit.category_id ?? paramsOrLimit.categoryId,
      access_level: paramsOrLimit.access_level ?? paramsOrLimit.accessLevel,
      limit: paramsOrLimit.limit ?? 100,
      offset: paramsOrLimit.offset ?? 0,
    };
  }

  return {
    limit: paramsOrLimit ?? 100,
    offset: offsetArg ?? 0,
  };
}

function buildDocumentsUrl(paramsOrLimit = 100, offsetArg = 0) {
  const queryParams = buildDocumentQueryParams(paramsOrLimit, offsetArg);
  const searchParams = new URLSearchParams();

  Object.entries(queryParams).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      searchParams.append(key, value);
    }
  });

  return `${API_BASE_URL}/api/documents?${searchParams.toString()}`;
}

export async function getAdminEvaluation(query, { signal } = {}) {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) throw new Error("Query evaluasi tidak boleh kosong.");

  const params = new URLSearchParams({ query: trimmedQuery });
  const response = await apiFetch(`/api/admin/evaluation?${params}`, { signal });
  const payload = await readJsonResponse(response);

  if (!response.ok) {
    const detail = payload?.detail;
    const message = typeof detail === "string" ? detail : detail?.message;
    const error = new Error(
      message || payload?.message || "Gagal mengambil hasil evaluasi.",
    );
    error.status = response.status;
    error.code = detail?.code;
    error.reason = detail?.reason;
    throw error;
  }

  const data = payload?.data;
  if (
    !data ||
    typeof data.metrics_available !== "boolean" ||
    !Array.isArray(data.tfidf?.results) ||
    !Array.isArray(data.distilbert?.results)
  ) {
    throw new Error("Respons evaluasi tidak valid.");
  }
  return data;
}

export async function searchDocuments(query, options = 5) {
  const trimmedQuery = query.trim();
  const isOptionObject = typeof options === "object" && options !== null;

  const limit = isOptionObject ? (options.limit ?? 5) : (options ?? 5);

  const categoryId = isOptionObject
    ? (options.category_id ?? options.categoryId)
    : null;

  const year = isOptionObject ? options.year : null;

  if (!trimmedQuery) {
    return {
      data: [],
      meta: {
        query: "",
        limit,
        category_id: categoryId || null,
        year: year || null,
      },
      message: "Query pencarian masih kosong.",
    };
  }

  const searchParams = new URLSearchParams();

  searchParams.append("query", trimmedQuery);
  searchParams.append("limit", limit);

  if (
    categoryId !== undefined &&
    categoryId !== null &&
    categoryId !== "" &&
    categoryId !== "ALL"
  ) {
    searchParams.append("category_id", categoryId);
  }

  if (year !== undefined && year !== null && year !== "" && year !== "ALL") {
    searchParams.append("year", year);
  }

  const url = `${API_BASE_URL}/api/search?${searchParams.toString()}`;

  const response = await apiFetch(url);
  const responseJson = await readJsonResponse(response);

  if (!response.ok) {
    const backendMessage =
      responseJson?.message ||
      responseJson?.detail ||
      "Endpoint pencarian gagal diproses.";

    throw new Error(`Search API error ${response.status}: ${backendMessage}`);
  }

  return {
    data: responseJson?.data || [],
    meta: responseJson?.meta || {
      query: trimmedQuery,
      limit,
      category_id: categoryId || null,
      year: year || null,
    },
    message: responseJson?.message || "Pencarian berhasil.",
  };
}

export async function getDocumentCategorySummary() {
  const response = await apiFetch(
    `${API_BASE_URL}/api/documents/category-summary`,
  );
  const responseJson = await readJsonResponse(response);

  if (!response.ok) {
    const backendMessage =
      responseJson?.message ||
      responseJson?.detail ||
      "Ringkasan kategori dokumen gagal diambil dari backend.";

    throw new Error(
      `Category Summary API error ${response.status}: ${backendMessage}`,
    );
  }

  const rawSummary = Array.isArray(responseJson?.data) ? responseJson.data : [];

  const summary = rawSummary.map((item, index) =>
    normalizeCategorySummaryItem(item, index),
  );

  return {
    data: summary,
    meta: responseJson?.meta || {
      total: summary.length,
    },
    message:
      responseJson?.message ||
      "Document category summary retrieved successfully",
  };
}

export async function getDocuments(paramsOrLimit = 100, offsetArg = 0) {
  const queryParams = buildDocumentQueryParams(paramsOrLimit, offsetArg);
  const response = await apiFetch(buildDocumentsUrl(paramsOrLimit, offsetArg));
  const responseJson = await readJsonResponse(response);

  if (!response.ok) {
    const backendMessage =
      responseJson?.message ||
      responseJson?.detail ||
      "Daftar dokumen gagal diambil dari backend.";

    throw new Error(
      `Documents API error ${response.status}: ${backendMessage}`,
    );
  }

  const rawDocuments = Array.isArray(responseJson?.data)
    ? responseJson.data
    : [];

  const documents = rawDocuments.map((item, index) =>
    normalizeDocumentItem(item, index),
  );

  return {
    data: documents,
    meta: responseJson?.meta || {
      total: documents.length,
      limit: queryParams.limit,
      offset: queryParams.offset,
    },
    message: responseJson?.message || "Documents retrieved successfully",
  };
}

export async function getDocumentById(id) {
  if (!id) {
    throw new Error("ID dokumen tidak tersedia.");
  }

  const response = await apiFetch(`${API_BASE_URL}/api/documents/${id}`);
  const responseJson = await readJsonResponse(response);

  if (!response.ok) {
    const error = new Error([403, 404].includes(response.status)
      ? "Dokumen tidak tersedia atau tidak dapat diakses."
      : "Detail dokumen gagal dimuat. Silakan coba lagi.");
    error.status = response.status;
    throw error;
  }

  if (!responseJson?.data) {
    throw new Error("Data dokumen tidak ditemukan di response backend.");
  }

  return {
    data: normalizeDocumentItem(responseJson.data),
    message: responseJson.message || "Detail dokumen berhasil diambil.",
  };
}

export async function updateDocumentAccess(id, accessLevel) {
  if (!id) {
    throw new Error("ID dokumen tidak tersedia.");
  }

  const normalizedAccessLevel = String(accessLevel || "").toUpperCase();

  if (!["PUBLIC", "PRIVATE"].includes(normalizedAccessLevel)) {
    throw new Error("Access level harus PUBLIC atau PRIVATE.");
  }

  const response = await apiFetch(`${API_BASE_URL}/api/documents/${id}/access`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      access_level: normalizedAccessLevel,
    }),
  });

  const responseJson = await readJsonResponse(response);

  if (!response.ok) {
    const backendMessage =
      responseJson?.message ||
      responseJson?.detail ||
      "Gagal mengubah akses dokumen.";

    throw new Error(`Access API error ${response.status}: ${backendMessage}`);
  }

  return {
    data: responseJson?.data || null,
    message: responseJson?.message || "Akses dokumen berhasil diperbarui.",
  };
}

export async function uploadAdminDocument(formData) {
  if (!(formData instanceof FormData)) {
    throw new Error("Data upload tidak valid. FormData wajib digunakan.");
  }

  const response = await apiFetch(`${API_BASE_URL}/api/admin/documents/upload`, {
    method: "POST",
    body: formData,
  });

  const responseJson = await readJsonResponse(response);

  if (!response.ok) {
    let backendMessage =
      responseJson?.message ||
      responseJson?.detail ||
      "Upload dokumen gagal diproses oleh backend.";

    if (Array.isArray(responseJson?.detail)) {
      backendMessage = responseJson.detail
        .map((item) => item?.msg || item?.message || "Validasi gagal.")
        .join(" ");
    }

    throw new Error(`Upload API error ${response.status}: ${backendMessage}`);
  }

  return {
    data: responseJson?.data || null,
    meta: responseJson?.meta || {},
    message: responseJson?.message || "Dokumen berhasil diunggah.",
  };
}

export async function updateAdminDocumentMetadata(documentId, changes) {
  if (!documentId) throw new Error("ID dokumen tidak tersedia.");
  const response = await apiFetch(
    `${API_BASE_URL}/api/admin/documents/${documentId}/metadata`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(changes),
    },
  );
  const result = await readJsonResponse(response);
  if (!response.ok) {
    const detail = result?.detail;
    const message = Array.isArray(detail)
      ? detail.map((item) => item.msg).join(" ")
      : detail || result?.message || "Metadata gagal disimpan.";
    throw new Error(message);
  }
  return {
    data: normalizeDocumentItem(result.data),
    meta: result.meta || {},
    message: result.message || "Metadata dokumen berhasil diperbarui.",
  };
}

export async function deleteAdminDocument(documentId) {
  if (!documentId) {
    throw new Error("ID dokumen tidak tersedia.");
  }

  const response = await apiFetch(
    `${API_BASE_URL}/api/admin/documents/${documentId}`,
    {
      method: "DELETE",
    },
  );

  const responseJson = await readJsonResponse(response);

  if (!response.ok) {
    const backendMessage =
      responseJson?.message ||
      responseJson?.detail ||
      "Gagal menghapus dokumen.";

    throw new Error(`Delete API error ${response.status}: ${backendMessage}`);
  }

  return {
    data: responseJson?.data || null,
    meta: responseJson?.meta || {},
    message: responseJson?.message || "Dokumen berhasil dihapus.",
  };
}
// A single cookie-authenticated download endpoint serves PDF, JPEG and PNG.
// Validate actual bytes as well as the declared media type before exposing a blob URL.
const SUPPORTED_DOCUMENT_MIME = {
  "application/pdf": ".pdf",
  "image/jpeg": ".jpg",
  "image/png": ".png",
};

function dispositionFileName(contentDisposition) {
  const encoded = contentDisposition?.match(/filename\*\s*=\s*UTF-8'[^']*'([^;]+)/i);
  if (encoded) {
    try { return decodeURIComponent(encoded[1].trim()); } catch { /* Try plain filename. */ }
  }
  const plain = contentDisposition?.match(/(?:^|;)\s*filename\s*=\s*(?:"([^"]*)"|([^;]*))/i);
  return (plain?.[1] || plain?.[2] || "").trim();
}

function safeDocumentName(contentDisposition, fallback, mimeType) {
  const fileExtension = SUPPORTED_DOCUMENT_MIME[mimeType];
  let name = String(dispositionFileName(contentDisposition) || fallback || "dokumen")
    .split(/[\\/]/).pop()
    .replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069<>:"|?*]/g, "_")
    .trim().replace(/[. ]+$/g, "");
  if (!name || name === "-" || /^\.*$/.test(name)) name = "dokumen";
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)) name = `_${name}`;
  const match = name.match(/\.(pdf|jpe?g|png)$/i);
  // Prefer the original JPG/JPEG spelling when the bytes are actually JPEG.
  const extension = match && (
    (mimeType === "image/jpeg" && /^\.jpe?g$/i.test(match[0])) ||
    (mimeType === "application/pdf" && /^\.pdf$/i.test(match[0])) ||
    (mimeType === "image/png" && /^\.png$/i.test(match[0]))
  ) ? match[0] : fileExtension;
  const stem = (match ? name.slice(0, -match[0].length) : name.replace(/\.[^.]+$/, ""))
    .slice(0, 160).replace(/[. ]+$/g, "") || "dokumen";
  return `${stem}${extension}`;
}

function isValidDocumentSignature(bytes, mimeType) {
  const isPdf = bytes.length >= 5 && [37, 80, 68, 70, 45].every((byte, index) => bytes[index] === byte);
  const isPng = bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte);
  const isJpeg = bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (mimeType === "application/pdf") return isPdf;
  if (mimeType === "image/png") return isPng;
  if (mimeType === "image/jpeg") {
    // MPO is a multi-picture container with a JPEG header and MPF identifier.
    for (let index = 0; index < bytes.length - 3; index++) {
      if (bytes[index] === 77 && bytes[index + 1] === 80 && bytes[index + 2] === 70 && bytes[index + 3] === 0) return false;
    }
    return isJpeg;
  }
  return false;
}

async function fetchDocumentFile(documentId, signal, suggestedName = "") {
  if (!documentId) throw new Error("ID dokumen tidak tersedia.");
  const isPdfHint = /\.pdf$/i.test(String(suggestedName).trim()) || !suggestedName;
  const documentLabel = isPdfHint ? "PDF" : "Berkas";
  try {
    const response = await apiFetch(
      `${API_BASE_URL}/api/documents/${encodeURIComponent(documentId)}/download`,
      { signal },
    );
    if (!response.ok) {
      const unavailable = [400, 403, 404].includes(response.status);
      const error = new Error(unavailable
        ? `${documentLabel} belum tersedia atau tidak dapat diakses. Silakan hubungi pengelola arsip.`
        : `${documentLabel} gagal dimuat. Silakan coba lagi.`);
      error.status = response.status;
      error.fileUnavailable = unavailable;
      throw error;
    }
    const blob = await response.blob();
    const bytes = new Uint8Array(await blob.slice(0, 1024).arrayBuffer());
    const declaredMime = (response.headers.get("Content-Type") || "").split(";")[0].trim().toLowerCase();
    // Preserve PDF-only legacy responses when the server uses application/octet-stream.
    const mimeType = declaredMime === "application/octet-stream" || !declaredMime
      ? (isValidDocumentSignature(bytes, "application/pdf") ? "application/pdf"
        : isValidDocumentSignature(bytes, "image/png") ? "image/png"
        : isValidDocumentSignature(bytes, "image/jpeg") ? "image/jpeg" : "")
      : declaredMime;
    const advertisedName = dispositionFileName(response.headers.get("Content-Disposition"));
    if (/\.mpo$/i.test(advertisedName) || /\.mpo$/i.test(String(suggestedName).trim())) {
      const error = new Error("Format MPO belum didukung untuk pratinjau atau unduhan.");
      error.fileUnavailable = true;
      throw error;
    }
    if (!SUPPORTED_DOCUMENT_MIME[mimeType] || !blob.size || !isValidDocumentSignature(bytes, mimeType)) {
      const error = new Error(isPdfHint
        ? "Berkas yang diterima bukan PDF yang valid. Silakan hubungi pengelola arsip."
        : "Format atau isi berkas tidak didukung (hanya PDF, JPEG, dan PNG). Silakan hubungi pengelola arsip.");
      error.fileUnavailable = true;
      throw error;
    }
    return {
      blob: blob.type === mimeType ? blob : new Blob([blob], { type: mimeType }),
      mimeType,
      response,
    };
  } catch (error) {
    if (error.name === "AbortError" || error.status || error.fileUnavailable) throw error;
    throw new Error(`Koneksi terputus atau ${documentLabel} gagal dimuat. Periksa koneksi lalu coba lagi.`);
  }
}

export async function downloadDocument(documentId, fileName = "dokumen.pdf", { signal } = {}) {
  const { blob, mimeType, response } = await fetchDocumentFile(documentId, signal, fileName);
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
  const finalFileName = safeDocumentName(response.headers.get("Content-Disposition"), fileName, mimeType);
  const objectUrl = window.URL.createObjectURL(blob);
  const downloadLink = document.createElement("a");
  downloadLink.href = objectUrl;
  downloadLink.download = finalFileName;
  try {
    document.body.appendChild(downloadLink);
    downloadLink.click();
  } finally {
    downloadLink.remove();
    // Give the browser time to start reading the blob before releasing it.
    const revoke = window.URL.revokeObjectURL.bind(window.URL);
    setTimeout(() => revoke(objectUrl), 1000);
  }
  return { message: "Dokumen berhasil diunduh.", fileName: finalFileName };
}

export async function createDocumentPreview(documentId, { signal, fileName = "" } = {}) {
  const { blob, mimeType } = await fetchDocumentFile(documentId, signal, fileName);
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
  return { url: window.URL.createObjectURL(blob), mimeType };
}

// Existing admin callers still receive the same string URL (DOWNLOAD-FIX-04).
export async function createDocumentPreviewUrl(documentId, { signal } = {}) {
  const preview = await createDocumentPreview(documentId, { signal });
  return preview.url;
}
