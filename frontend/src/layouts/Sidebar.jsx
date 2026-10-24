import { useEffect, useState } from "react";
import { NavLink, Link, useLocation } from "react-router-dom";
import LogoutButton from "../components/common/LogoutButton";
import { useAuth } from "../auth/AuthContext";

const icons = {
  dashboard: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
  search: "M21 21l-5-5 M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0",
  repository: "M3 7h18v14H3z M3 7V3h7l3 4 M8 12h8 M8 16h5",
};

const adminLinks = [
  { to: "/admin/dashboard", label: "Dashboard", icon: "dashboard" },
  { to: "/admin/repository", label: "Repositori", icon: "repository" },
];
const studentLinks = [
  { to: "/search", label: "Pencarian", icon: "search" },
  { to: "/repository", label: "Repositori", icon: "repository" },
];

export default function Sidebar({ admin = false }) {
  const { pathname } = useLocation();
  const { user } = useAuth();
  const [collapsed, setCollapsed] = useState(() => {
    try { return globalThis.localStorage?.getItem("archida.sidebar.collapsed") === "true"; }
    catch { return false; }
  });
  useEffect(() => {
    try { globalThis.localStorage?.setItem("archida.sidebar.collapsed", String(collapsed)); }
    catch { /* Navigation remains usable when browser storage is unavailable. */ }
  }, [collapsed]);
  const links = admin ? adminLinks : studentLinks;
  const isDetail = pathname.startsWith(admin ? "/admin/documents/" : "/documents/");
  const currentLabel = isDetail
    ? "Detail Dokumen"
    : links.find((item) => item.to === pathname)?.label || "ARCHIDA";

  return (
    <>
      <a className="skip-link" href="#main-content">Lewati ke konten</a>
      <aside className="app-sidebar" data-collapsed={collapsed}>
        <div className="sidebar-brand">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
            <path d="M5 5l11-3v16L5 21V5Z M9 7l4-1 M9 11l4-1 M9 15l4-1 M19 6h2v15H10" />
          </svg>
          <div><p className="brand-name">ARCHIDA</p><p className="brand-caption">Arsip Semantik UNIDA</p></div>
        </div>
        <button type="button" className="sidebar-toggle"
          aria-label={collapsed ? "Perluas sidebar" : "Ciutkan sidebar"}
          title={collapsed ? "Perluas sidebar" : "Ciutkan sidebar"}
          aria-expanded={!collapsed} aria-controls="sidebar-menu"
          onClick={() => setCollapsed((value) => !value)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d={collapsed ? "m9 5 7 7-7 7" : "m15 5-7 7 7 7"} />
          </svg>
        </button>
        <p className="sidebar-section-label">Menu</p>
        <nav id="sidebar-menu" className="sidebar-links" aria-label={admin ? "Navigasi Admin" : "Navigasi Mahasiswa"}>
          {links.map((item) => (
            <NavLink key={item.to} to={item.to} aria-label={item.label} title={item.label}
              className={({ isActive }) => `sidebar-link${isActive || (isDetail && item.icon === "repository") ? " is-active" : ""}`}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={icons[item.icon]} /></svg>
              <span className="sidebar-link-label">{item.label}</span>
              <span className="sidebar-tooltip" aria-hidden="true">{item.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="sidebar-account" title={user?.name || (admin ? "Admin" : "Mahasiswa")}>
            <span className="account-mark" aria-hidden="true">{user?.name?.trim().charAt(0).toUpperCase() || (admin ? "A" : "M")}</span>
            <div className="sidebar-user-info"><p>{user?.name || (admin ? "Admin" : "Mahasiswa")}</p><span>{user?.role || (admin ? "ADMIN" : "MAHASISWA")}</span></div>
          </div>
          <LogoutButton />
        </div>
      </aside>
      <header className="workspace-header">
        <nav aria-label="Breadcrumb" className="breadcrumb">
          <span>ARCHIDA</span><span aria-hidden="true">/</span>
          {isDetail && <><Link to={admin ? "/admin/repository" : "/repository"}>Repositori</Link><span aria-hidden="true">/</span></>}
          <span aria-current="page">{currentLabel}</span>
        </nav>
        <span className="workspace-role">{admin ? "Admin" : "Mahasiswa"}</span>
      </header>
    </>
  );
}
