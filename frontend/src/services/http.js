// Keep localhost/127.0.0.1 consistent during local development.
// In production, API requests use the same origin (e.g. https://archida.vercel.app/api/...).
const developmentHost =
  globalThis.location?.hostname === "localhost"
    ? "localhost"
    : "127.0.0.1";

export const API_BASE_URL =
  import.meta.env?.VITE_API_BASE_URL ||
  (import.meta.env.DEV ? `http://${developmentHost}:8000` : "");

export const AUTH_EXPIRED_EVENT = "archida:auth-expired";

export async function apiFetch(path, options = {}) {
  const { skipAuthHandling = false, ...requestOptions } = options;

  const url = path.startsWith("/")
    ? `${API_BASE_URL}${path}`
    : path;

  const response = await fetch(url, {
    ...requestOptions,
    credentials: "include",
  });

  if (response.status === 401 && !skipAuthHandling) {
    globalThis.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));

    const error = new Error("Sesi berakhir. Silakan login kembali.");
    error.status = 401;
    throw error;
  }

  return response;
}