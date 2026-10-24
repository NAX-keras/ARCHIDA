import { Routes, Route, Navigate } from "react-router-dom";

import LoginPage from "../pages/auth/LoginPage";
import SearchPage from "../pages/student/SearchPage";
import StudentRepositoryPage from "../pages/student/RepositoryPage";
import DocumentDetailPage from "../pages/student/DocumentDetailPage";

import AdminDashboardPage from "../pages/admin/AdminDashboardPage";
import AdminRepositoryPage from "../pages/admin/RepositoryPage";
import AdminDocumentDetailPage from "../pages/admin/AdminDocumentDetailPage";
import RequireAuth from "../auth/RequireAuth";

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />

      <Route path="/login" element={<LoginPage />} />

      <Route element={<RequireAuth />}>
      <Route path="/search" element={<SearchPage />} />
      <Route path="/repository" element={<StudentRepositoryPage />} />
      <Route path="/documents/:id" element={<DocumentDetailPage />} />
      </Route>

      <Route element={<RequireAuth adminOnly />}>
      <Route path="/admin/dashboard" element={<AdminDashboardPage />} />
      <Route path="/admin/repository" element={<AdminRepositoryPage />} />
      <Route
        path="/admin/documents/:id"
        element={<AdminDocumentDetailPage />}
      />
      <Route path="/admin/evaluation" element={<Navigate to="/admin/dashboard" replace />} />
      </Route>
    </Routes>
  );
}

export default AppRoutes;
