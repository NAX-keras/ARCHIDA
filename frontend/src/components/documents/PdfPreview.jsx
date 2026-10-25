import { useEffect, useRef, useState } from "react";
import workerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";

// Small screens and browsers without a native viewer need an in-page renderer.
// Only the authenticated object URL created by services/api is passed here.
export default function PdfPreview({ url, title, className }) {
  const [useCanvas, setUseCanvas] = useState(() =>
    window.matchMedia("(max-width: 767px)").matches || navigator.pdfViewerEnabled !== true);
  const [pdf, setPdf] = useState(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [width, setWidth] = useState(320);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const host = useRef(null);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 767px)");
    const update = () => setUseCanvas(media.matches || navigator.pdfViewerEnabled !== true);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!useCanvas) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(1, entry.contentRect.width)));
    observer.observe(host.current);
    return () => observer.disconnect();
  }, [useCanvas]);

  useEffect(() => {
    if (!useCanvas) return;
    let cancelled = false;
    let task;
    setPdf(null);
    setPageNumber(1);
    setLoading(true);
    setError("");
    (async () => {
      try {
        const { getDocument, GlobalWorkerOptions } = await import("pdfjs-dist/legacy/build/pdf.mjs");
        if (cancelled) return;
        GlobalWorkerOptions.workerSrc = workerUrl;
        task = getDocument({ url, isEvalSupported: false });
        const loaded = await task.promise;
        if (!cancelled) setPdf(loaded);
      } catch {
        if (!cancelled) {
          setError("PDF tidak dapat ditampilkan. Gunakan tombol Unduh untuk membuka berkas di perangkat Anda.");
          setLoading(false);
        }
      }
    })();
    return () => { cancelled = true; void task?.destroy().catch(() => {}); };
  }, [url, useCanvas]);

  useEffect(() => {
    if (!useCanvas || !pdf) return;
    let cancelled = false;
    let renderTask;
    setLoading(true);
    setError("");
    (async () => {
      let page;
      try {
        page = await pdf.getPage(pageNumber);
        if (cancelled) return;
        const viewport = page.getViewport({ scale: width / page.getViewport({ scale: 1 }).width });
        const ratio = Math.min(window.devicePixelRatio || 1, 2);
        // A new canvas avoids concurrent rendering when rotating or changing pages.
        const canvas = document.createElement("canvas");
        canvas.width = Math.ceil(viewport.width * ratio);
        canvas.height = Math.ceil(viewport.height * ratio);
        canvas.style.width = "100%";
        canvas.style.height = "auto";
        canvas.setAttribute("role", "img");
        canvas.setAttribute("aria-label", `${title}, halaman ${pageNumber}`);
        renderTask = page.render({ canvasContext: canvas.getContext("2d"), viewport,
          transform: [ratio, 0, 0, ratio, 0, 0] });
        await renderTask.promise;
        if (!cancelled) host.current.replaceChildren(canvas);
      } catch {
        if (!cancelled) setError("Halaman PDF gagal ditampilkan. Coba halaman lain atau gunakan Unduh.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; renderTask?.cancel(); };
  }, [pdf, pageNumber, width, useCanvas]);

  if (!useCanvas) return <iframe src={url} title={title} className={className} />;
  return (
    <div className="min-w-0 rounded-lg border border-slate-200 bg-white p-3" aria-label={title}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <button type="button" disabled={!pdf || pageNumber <= 1 || loading}
          onClick={() => setPageNumber((page) => page - 1)}
          className="min-h-11 rounded border border-slate-300 px-3 text-sm disabled:opacity-50">Sebelumnya</button>
        <span className="text-sm" aria-live="polite">Halaman {pageNumber} / {pdf?.numPages || "—"}</span>
        <button type="button" disabled={!pdf || pageNumber >= pdf.numPages || loading}
          onClick={() => setPageNumber((page) => page + 1)}
          className="min-h-11 rounded border border-slate-300 px-3 text-sm disabled:opacity-50">Berikutnya</button>
      </div>
      {loading && <p role="status" className="mb-3 text-sm text-slate-600">Memuat halaman PDF...</p>}
      {error && <p role="alert" className="mb-3 text-sm text-amber-800">{error}</p>}
      <div ref={host} className="min-h-[240px] w-full" aria-busy={loading} />
    </div>
  );
}
