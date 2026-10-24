import { createContext, useContext, useEffect, useRef, useState } from "react";
import { getCurrentUser, loginWithPassword, logoutSession } from "../services/authService";
import { AUTH_EXPIRED_EVENT } from "../services/http";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState("");
  const generation = useRef(0);

  useEffect(() => {
    let active = true;
    const initialGeneration = generation.current;
    const clearSession = () => {
      generation.current += 1;
      setUser(null);
      setAuthLoading(false);
    };
    globalThis.addEventListener(AUTH_EXPIRED_EVENT, clearSession);
    getCurrentUser()
      .then((identity) => {
        if (active && generation.current === initialGeneration) setUser(identity);
      })
      .catch(() => {
        if (active) setAuthError("Koneksi autentikasi gagal. Silakan coba login kembali.");
      })
      .finally(() => { if (active) setAuthLoading(false); });
    return () => {
      active = false;
      globalThis.removeEventListener(AUTH_EXPIRED_EVENT, clearSession);
    };
  }, []);

  const login = async (identifier, password) => {
    generation.current += 1;
    setUser(null);
    setAuthError("");
    await loginWithPassword(identifier, password);
    const identity = await getCurrentUser();
    if (!identity) throw new Error("Cookie sesi tidak tersedia. Pastikan konfigurasi origin dan cookie sesuai.");
    setUser(identity);
    return identity;
  };

  const logout = async () => {
    await logoutSession();
    generation.current += 1;
    setUser(null);
    setAuthError("");
  };

  return <AuthContext.Provider value={{ user, role: user?.role, isAuthenticated: !!user,
    authLoading, authError, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
