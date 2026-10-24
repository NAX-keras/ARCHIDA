import { apiFetch } from "./http.js";

async function readAuthResponse(response) {
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(typeof body?.detail === "string" ? body.detail : "Autentikasi gagal.");
    error.status = response.status;
    throw error;
  }
  return body?.data;
}

export async function loginWithPassword(identifier, password) {
  const response = await apiFetch("/api/auth/login", {
    method: "POST", skipAuthHandling: true,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier: identifier.trim(), password }),
  });
  return readAuthResponse(response);
}

export async function getCurrentUser() {
  const response = await apiFetch("/api/auth/me", { skipAuthHandling: true });
  if (response.status === 401) return null;
  return readAuthResponse(response);
}

export async function logoutSession() {
  const response = await apiFetch("/api/auth/logout", { method: "POST" });
  await readAuthResponse(response);
}
