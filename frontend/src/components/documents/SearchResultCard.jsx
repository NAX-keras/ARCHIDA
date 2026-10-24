import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { formatStudentDescription } from "../../utils/studentPresentation.js";
import { downloadDocument } from "../../services/api";

function SearchResultCard({ document, rank }) {
  const navigate = useNavigate();
  const pendingDownload = useRef(false);
  const [fileUnavailable, setFileUnavailable] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadErrorMessage, setDownloadErrorMessage] = useState("");

  const documentId = document.document_id ?? document.id;
  const rankingScore = Number.isFinite(document.ranking_score) ? document.ranking_score : null;
  const accessLevel = String(document.access_level || document.accessLevel || "").toUpperCase();
  const isPrivate = accessLevel === "PRIVATE" || document.isPrivate === true;
  const formattedScore = rankingScore === null ? "-" : rankingScore.toFixed(4);
  const documentTitle = document.title || document.file_name || "Dokumen Tanpa Judul";
  const downloadFileName = document.file_name || document.fileName || document.title || `dokumen-${documentId}.pdf`;

  const handleDetailClick = () => {
    navigate(`/documents/${documentId}`, {
      state: {
        fromSearch: true,
        score: formattedScore,
        ranking_score: rankingScore,
        document: {
          id: documentId,
          document_id: document.document_id ?? documentId,
          title: document.title,
          file_name: document.file_name,
          fileName: document.fileName,
          category: document.category,
          category_id: document.category_id,
          year: document.year,
          access_level: document.access_level,
          accessLevel: document.accessLevel,
          accessLabel: document.accessLabel,
          isPrivate: document.isPrivate,
          similarity_score: document.similarity_score,
          ranking_score: rankingScore,
          cosine_distance: document.cosine_distance,
          snippet: document.snippet,
          description: document.description,
          keywords: document.keywords,
        },
      },
    });
  };

  const handleDownloadClick = async () => {
    if (!documentId || isPrivate || fileUnavailable || pendingDownload.current) return;
    pendingDownload.current = true;
    try {
      setIsDownloading(true);
      setDownloadErrorMessage("");
      await downloadDocument(documentId, downloadFileName);
    } catch (error) {
      console.error("Download document error:", error);
      if (error.fileUnavailable) setFileUnavailable(true);
      setDownloadErrorMessage(error.message || "Gagal mengunduh dokumen.");
    } finally {
      pendingDownload.current = false;
      setIsDownloading(false);
    }
  };

  return (
    <article className="result-card student-result-card">
      <div className="result-body">
        <div className="result-heading">
          <div className="result-meta">
            {rank ? <span className="rank-number" aria-label={`Peringkat ${rank}`}>{rank}</span> : null}
            <span className="tag-category">{document.category || "-"}</span>
            <span className="tag-year">Tahun {document.year || "-"}</span>
            {accessLevel && (
              <span className={isPrivate ? "tag-private" : "tag-public"}>
                {isPrivate
                  ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>
                  : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="12" cy="12" r="8" /><path d="M4 12h16 M12 4c2.5 2.3 2.5 13.7 0 16 M12 4c-2.5 2.3-2.5 13.7 0 16" /></svg>}
                {isPrivate ? "Terbatas" : "Publik"}
              </span>
            )}
          </div>
          <h3>{documentTitle}</h3>
          <p className="student-result-snippet">
            {formatStudentDescription(document.snippet)}
          </p>
          <p className="student-ranking-score mt-2 text-xs font-normal text-slate-600">
            Skor Ranking: {formattedScore}
          </p>
        </div>
        <div className="student-result-footer">
          <div className="result-actions">
            <button type="button" onClick={handleDetailClick}
              className="rounded-lg bg-blue-900 text-white hover:bg-blue-800">Detail</button>
            <button type="button" onClick={handleDownloadClick}
              disabled={isDownloading || isPrivate || fileUnavailable || !documentId}
              aria-busy={isDownloading}
              title={isPrivate ? "Berkas tidak dapat diakses." : "Unduh berkas asli."}
              className={`rounded-lg border transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${isPrivate ? "border-slate-200 bg-slate-100 text-slate-400" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"}`}>
              {isDownloading ? "Mengunduh..." : "Unduh"}
            </button>
          </div>
        </div>
        {downloadErrorMessage && <div role="alert" className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">{downloadErrorMessage}</div>}
      </div>
    </article>
  );
}

export default SearchResultCard;
