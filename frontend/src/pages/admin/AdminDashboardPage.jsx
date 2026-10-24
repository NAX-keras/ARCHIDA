import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import AdminNavbar from "../../layouts/AdminNavbar";
import { getDocumentCategorySummary, getDocuments } from "../../services/api";
function StatusCard({
  title,
  value,
  description,
  colorClass = "text-blue-900",
}) {
  return (
    <div className="stat-card">
      <p className="text-sm text-slate-500">{title}</p>

      <h2 className={`mt-2 text-2xl font-bold ${colorClass}`}>{value}</h2>

      <p className="mt-2 text-xs leading-5 text-slate-400">{description}</p>
    </div>
  );
}

function AdminDashboardPage() {
  const [totalDocuments, setTotalDocuments] = useState(null);
  const [categories, setCategories] = useState([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [categoriesError, setCategoriesError] = useState("");
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      setErrorMessage("");

      const documentsResult = await getDocuments({
        limit: 1,
        offset: 0,
      });

      setTotalDocuments(
        documentsResult.meta?.total ?? null,
      );

    } catch (error) {
      console.error("Dashboard admin error:", error);

      setErrorMessage(
        error.message ||
          "Ringkasan arsip belum dapat dimuat. Silakan coba lagi.",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboardData();
  }, []);

  useEffect(() => {
    let active = true;
    getDocumentCategorySummary()
      .then((result) => { if (active) setCategories(result.data); })
      .catch((error) => { if (active) setCategoriesError(error.message || "Statistik kategori belum tersedia."); })
      .finally(() => { if (active) setCategoriesLoading(false); });
    return () => { active = false; };
  }, []);

  return (
    <div className="app-shell admin-shell">
      <AdminNavbar />

      <main id="main-content" tabIndex={-1} className="app-main">
        <section className="page-intro">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">
              Dashboard Admin
            </h1>

            <p className="mt-2 text-sm leading-6 text-slate-600">
              Pantau koleksi arsip dan kelola dokumen dalam satu tempat.
            </p>
          </div>

          {errorMessage && (
            <div role="alert" className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
              {errorMessage}
            </div>
          )}

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <StatusCard
              title="Total Dokumen"
              value={loading ? "..." : totalDocuments ?? "—"}
              description="Jumlah dokumen dalam repositori Admin."
            />
            <div className="stat-card">
              <h2 className="text-lg font-semibold text-slate-800">Kelola arsip</h2>
              <p className="mt-2 text-sm text-slate-600">Telusuri, unggah, dan perbarui informasi dokumen.</p>
              <Link to="/admin/repository" className="mt-4 inline-flex rounded-lg bg-blue-900 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-800">Kelola Dokumen</Link>
            </div>
          </div>
        </section>

        <section aria-labelledby="category-statistics-title" className="mt-7">
          <h2 id="category-statistics-title" className="text-lg font-semibold text-slate-800">Dokumen per Kategori</h2>
          <p className="mt-1 text-sm text-slate-500">Jumlah dokumen aktual pada repositori Admin.</p>
          {categoriesLoading && <p role="status" className="mt-4 text-sm text-slate-500">Memuat statistik kategori...</p>}
          {categoriesError && <p role="alert" className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">{categoriesError}</p>}
          {!categoriesLoading && !categoriesError && categories.length === 0 && <p className="mt-4 text-sm text-slate-500">Belum ada kategori dokumen.</p>}
          <div className="category-stat-grid mt-4">
            {categories.map((category) => (
              <div key={category.categoryKey} className="category-stat-card">
                <div><h3>{category.category}</h3><p className="category-stat-value">{category.total}</p><span>dokumen</span></div>
                <span className="category-stat-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M5 3h9l5 5v13H5z M14 3v6h5 M9 13h6 M9 17h6" /></svg></span>
              </div>
            ))}
          </div>
        </section>

      </main>
    </div>
  );
}

export default AdminDashboardPage;
