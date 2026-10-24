import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";

export default function LogoutButton() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const handleLogout = async () => {
    setPending(true);
    setError("");
    try {
      await logout();
      navigate("/login", { replace: true });
    } catch {
      setError("Logout gagal. Coba kembali.");
    } finally {
      setPending(false);
    }
  };
  return <div>
    <button type="button" onClick={handleLogout} disabled={pending}
      aria-label={pending ? "Keluar..." : "Logout"} title={pending ? "Keluar..." : "Logout"}
      className="logout-button rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M9 4H4v16h5 M13 8l4 4-4 4 M8 12h13" /></svg>
      <span className="logout-label">{pending ? "Keluar..." : "Logout"}</span>
    </button>
    {error && <p role="alert" className="mt-1 text-xs text-red-700">{error}</p>}
  </div>;
}
