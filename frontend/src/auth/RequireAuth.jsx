import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "./AuthContext";

export default function RequireAuth({ adminOnly = false }) {
  const { user, authLoading } = useAuth();
  const location = useLocation();
  if (authLoading) return <p className="p-8 text-slate-600">Memeriksa sesi...</p>;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  if (adminOnly && user.role !== "ADMIN") return <Navigate to="/search" replace />;
  return <Outlet />;
}
