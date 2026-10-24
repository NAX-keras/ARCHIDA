import { useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import logoUnida from "../../assets/logo-unida.png";

import { useAuth } from "../../auth/AuthContext";
import { resolvePostLoginDestination } from "../../auth/redirect.js";

function LoginPage() {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const { user, authError, login } = useAuth();
  const location = useLocation();

  const handleLogin = async (event) => {
    event.preventDefault();

    if (!identifier.trim() || !password) {
      setErrorMessage("Email admin atau NIM dan password wajib diisi.");
      return;
    }

    setPending(true);
    setErrorMessage("");

    try {
      await login(identifier, password);
    } catch (error) {
      setErrorMessage(error.message || "Login gagal.");
    } finally {
      setPassword("");
      setPending(false);
    }
  };

  // Session checking happens in the background.
  // If an authenticated session is found, redirect automatically.
  if (user) {
    return (
      <Navigate
        to={resolvePostLoginDestination(user.role, location.state?.from)}
        replace
      />
    );
  }

  return (
    <div className="login-screen">
      <div className="login-layout">
        <aside className="login-identity">
          <div className="login-brand">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              aria-hidden="true"
            >
              <path d="M5 5l11-3v16L5 21V5Z M9 7l4-1 M9 11l4-1 M9 15l4-1 M19 6h2v15H10" />
            </svg>

            <div>
              <p className="brand-name">ARCHIDA</p>
              <p className="brand-caption">Arsip Semantik UNIDA</p>
            </div>
          </div>

          <div>
            <h2>Arsip universitas, mudah ditemukan.</h2>
            <p className="mt-5">
              Temukan dokumen UNIDA Gontor dengan kata kunci atau kalimat sehari-hari.
            </p>
          </div>
        </aside>

        <main className="login-card">
          <div className="mb-7">
            <img
              src={logoUnida}
              alt="Logo Universitas Darussalam Gontor"
              className="mb-6 h-16 w-auto object-contain"
            />

            <h1 className="text-slate-900">Masuk ke ARCHIDA</h1>

            <p className="mt-2 text-sm leading-6 text-slate-500">
              Gunakan akun Admin atau Mahasiswa Anda.
            </p>
          </div>

          {(errorMessage || authError) && (
            <p role="alert" className="login-error">
              {errorMessage || authError}
            </p>
          )}

          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label
                htmlFor="login-identifier"
                className="mb-2 block text-sm font-semibold text-slate-700"
              >
                Email Admin / NIM Mahasiswa
              </label>

              <input
                id="login-identifier"
                type="text"
                value={identifier}
                onChange={(event) => setIdentifier(event.target.value)}
                placeholder="Masukkan email admin atau NIM"
                autoComplete="username"
                required
                className="w-full border border-slate-300 px-4 text-sm"
              />
            </div>

            <div>
              <label
                htmlFor="login-password"
                className="mb-2 block text-sm font-semibold text-slate-700"
              >
                Password
              </label>

              <div className="password-wrap">
                <input
                  id="login-password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Masukkan password"
                  autoComplete="current-password"
                  required
                  className="w-full border border-slate-300 px-4 text-sm"
                />

                <button
                  type="button"
                  className="password-toggle"
                  aria-pressed={showPassword}
                  onClick={() => setShowPassword((value) => !value)}
                >
                  {showPassword ? "Sembunyikan" : "Tampilkan"}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={pending}
              aria-busy={pending}
              className="w-full rounded-lg bg-blue-900 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-60"
            >
              {pending ? "Memproses..." : "Masuk"}
            </button>
          </form>
        </main>
      </div>
    </div>
  );
}

export default LoginPage;