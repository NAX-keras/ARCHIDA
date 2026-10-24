// Keep localhost/127.0.0.1 consistent: SameSite cookies require the same site.
const developmentHost = globalThis.location?.hostname === "localhost"
  ? "localhost" : "127.0.0.1";
export const API_BASE_URL = import.meta.env?.VITE_API_BASE_URL || `http://${developmentHost}:8000`;
export const AUTH_EXPIRED_EVENT = "archida:auth-expired";

export async function apiFetch(path, options = {}) {
  const { skipAuthHandling = false, ...requestOptions } = options;
  const url = path.startsWith("/") ? `${API_BASE_URL}${path}` : path;
  const response = await fetch(url, { ...requestOptions, credentials: "include" });
  if (response.status === 401 && !skipAuthHandling) {
    globalThis.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
    const error = new Error("Sesi berakhir. Silakan login kembali.");
    error.status = 401;
    throw error;
  }
  return response;
}
