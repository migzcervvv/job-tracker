import { useEffect, useId, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { renderAsync } from "docx-preview";
import { getResumePreviewFile } from "../api/resumes.js";
import { extractErrorMessage } from "../api/errors.js";
import { Icon } from "./Icon.jsx";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();
const pdfOptions = {
  cMapUrl: `${import.meta.env.DEV ? "/node_modules/pdfjs-dist" : "/pdf"}/cmaps/`,
  standardFontDataUrl: `${import.meta.env.DEV ? "/node_modules/pdfjs-dist" : "/pdf"}/standard_fonts/`,
  wasmUrl: `${import.meta.env.DEV ? "/node_modules/pdfjs-dist" : "/pdf"}/wasm/`,
  isEvalSupported: false,
};

function WordPreview({ file }) {
  const [html, setHtml] = useState("");
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    async function render() {
      const container = document.createElement("div");
      await renderAsync(await file.arrayBuffer(), container, undefined, {
        useBase64URL: true,
        renderAltChunks: false,
      });
      if (!cancelled)
        setHtml(`<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>
        body { margin: 0; background: #f3f3f1; }
        .docx-wrapper { background: #f3f3f1 !important; padding: 20px !important; }
        section.docx { box-shadow: none !important; margin: 0 auto 20px !important; }
        @media (max-width: 800px) {
          .docx-wrapper { padding: 0 !important; }
          section.docx { width: 100% !important; padding: 24px !important; min-height: auto !important; }
        }
      </style></head><body>${container.innerHTML}</body></html>`);
    }
    void render().catch(() => {
      if (!cancelled) setFailed(true);
    });
    return () => {
      cancelled = true;
    };
  }, [file]);
  if (failed)
    return (
      <p role="alert">
        This Word document could not be displayed. It may be damaged or password
        protected.
      </p>
    );
  if (!html) return <p role="status">Rendering document…</p>;
  return (
    <iframe
      className="resume-word-frame"
      title="Resume document"
      sandbox=""
      srcDoc={html}
    />
  );
}

export default function ResumePreview({ resume, onClose }) {
  const dialog = useRef(null);
  const viewport = useRef(null);
  const titleId = useId();
  const [file, setFile] = useState(null);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [pages, setPages] = useState(0);
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [width, setWidth] = useState(760);
  const extension = resume.fileName?.split(".").pop()?.toLowerCase();
  const format =
    extension === "pdf" || resume.contentType === "application/pdf"
      ? "pdf"
      : extension === "docx" ||
          resume.contentType ===
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        ? "docx"
        : "unsupported";

  useEffect(() => {
    const element = dialog.current;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    element.showModal();
    return () => {
      element.close();
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, []);
  useEffect(() => {
    const element = viewport.current;
    const observer = new ResizeObserver(([entry]) =>
      setWidth(Math.max(160, entry.contentRect.width - 32)),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (format === "unsupported") return;
    const controller = new AbortController();
    void Promise.resolve().then(async () => {
      if (controller.signal.aborted) return;
      setFile(null);
      setError("");
      setPage(1);
      setPages(0);
      try {
        const blob = await getResumePreviewFile(resume.id, controller.signal);
        if (!controller.signal.aborted) setFile(blob);
      } catch (err) {
        if (!controller.signal.aborted)
          setError(
            extractErrorMessage(
              err,
              "The resume could not be loaded. Try again.",
            ),
          );
      }
    });
    return () => controller.abort();
  }, [resume.id, format, revision]);

  return (
    <dialog
      ref={dialog}
      className="resume-preview"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <header className="resume-preview-head">
        <div>
          <span className="eyebrow">RESUME PREVIEW</span>
          <h2 id={titleId}>{resume.fileName}</h2>
        </div>
        <button
          type="button"
          className="icon-btn"
          aria-label="Close resume preview"
          onClick={onClose}
        >
          <Icon name="close" />
        </button>
      </header>
      {format === "pdf" && file && !error && (
        <div className="resume-preview-toolbar">
          <div>
            <button
              type="button"
              className="icon-btn"
              aria-label="Previous page"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
            >
              <Icon name="back" size={18} />
            </button>
            <span aria-live="polite">
              Page {page} of {pages || "…"}
            </span>
            <button
              type="button"
              className="icon-btn"
              aria-label="Next page"
              disabled={!pages || page >= pages}
              onClick={() => setPage(page + 1)}
            >
              <Icon name="arrow" size={18} />
            </button>
          </div>
          <div>
            <button
              type="button"
              className="icon-btn"
              aria-label="Zoom out"
              disabled={zoom <= 0.5}
              onClick={() => setZoom(Math.max(0.5, zoom - 0.25))}
            >
              −
            </button>
            <button
              type="button"
              className="text-btn"
              aria-label="Fit to width"
              onClick={() => setZoom(1)}
            >
              {Math.round(zoom * 100)}%
            </button>
            <button
              type="button"
              className="icon-btn"
              aria-label="Zoom in"
              disabled={zoom >= 2}
              onClick={() => setZoom(Math.min(2, zoom + 0.25))}
            >
              +
            </button>
          </div>
        </div>
      )}
      <div className="resume-preview-viewport" ref={viewport}>
        {format === "unsupported" ? (
          <div className="empty-state">
            <Icon name="resume" size={28} />
            <h3>Preview unavailable for this format</h3>
            <p>
              PDF and DOCX resumes can be previewed here. For a legacy .doc
              file, save a copy as PDF or DOCX and upload it.
            </p>
          </div>
        ) : error ? (
          <div className="empty-state">
            <p role="alert">{error}</p>
            <button
              type="button"
              className="icon-btn"
              onClick={() => setRevision(revision + 1)}
            >
              Retry preview
            </button>
          </div>
        ) : !file ? (
          <div className="empty-state" role="status">
            <span className="loading-spinner" />
            Loading resume…
          </div>
        ) : format === "docx" ? (
          <WordPreview key={revision} file={file} />
        ) : (
          <Document
            file={file}
            options={pdfOptions}
            suspense={false}
            externalLinkTarget="_blank"
            externalLinkRel="noopener noreferrer"
            loading={<p role="status">Loading PDF…</p>}
            onLoadSuccess={({ numPages }) => setPages(numPages)}
            onLoadError={() =>
              setError(
                "This PDF could not be displayed. It may be damaged or password protected.",
              )
            }
          >
            <Page
              pageNumber={page}
              width={Math.floor(width * zoom)}
              loading={<p role="status">Rendering page…</p>}
              onRenderError={() =>
                setError(
                  "This PDF page could not be displayed. Try loading the preview again.",
                )
              }
            />
          </Document>
        )}
      </div>
    </dialog>
  );
}
