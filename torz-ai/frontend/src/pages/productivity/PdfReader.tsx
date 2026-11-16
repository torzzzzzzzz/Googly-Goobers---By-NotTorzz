import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import {
  ArrowLeft,
  BookOpenCheck,
  BrainCircuit,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Copy,
  FilePlus,
  FileText,
  FileUp,
  GraduationCap,
  Layers,
  MessageCircleQuestion,
  Minus,
  NotebookPen,
  Plus,
  ScanText,
  Trash2,
} from "lucide-react";
import { authedUrl, del, get, post, upload } from "../../lib/api";
import { formatBytes, timeAgo } from "../../lib/format";
import { useToolVisit } from "../../lib/hooks";
import { Alert, Badge, Button, Card, EmptyState, IconButton, Spinner, Tabs, useUi } from "../../components/ui";
import { Page, ToolHeader, useCopy } from "../../components/tool/ToolKit";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export default function PdfReader() {
  useToolVisit("pdf");
  const { id } = useParams();
  return id ? <Viewer fileId={Number(id)} /> : <FileLibrary />;
}

function FileLibrary() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const { toast, confirm } = useUi();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const files = useQuery<{ files: any[] }>({ queryKey: ["files"], queryFn: () => get("/api/files") });

  const onFile = async (f?: File) => {
    if (!f) return;
    setBusy(true);
    try {
      const res = await upload<any>("/api/files", f);
      qc.invalidateQueries({ queryKey: ["files"] });
      for (const w of res.warnings ?? []) toast(w, "info");
      nav(`/pdf/${res.id}`);
    } catch (e) {
      toast((e as Error).message, "bad");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <Page wide>
      <ToolHeader toolId="pdf" />
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          onFile(e.dataTransfer.files?.[0]);
        }}
        className="card mb-6 flex w-full flex-col items-center justify-center gap-3 border-dashed px-6 py-12 text-center transition hover:border-accent/50"
      >
        {busy ? <Spinner className="size-7" /> : <FileUp className="size-7 text-accent" />}
        <div className="text-[1rem] font-semibold text-ink">{busy ? "Reading your file… (scanned PDFs use OCR and take longer)" : "Drop a PDF here or click to upload"}</div>
        <div className="text-sm text-muted">PDF, DOCX, TXT, Markdown, or an image (PNG/JPG) for OCR</div>
      </button>
      <input ref={fileRef} type="file" hidden accept=".pdf,.docx,.txt,.md,.markdown,.png,.jpg,.jpeg" onChange={(e) => onFile(e.target.files?.[0])} />
      <h2 className="mb-3 text-[1.02rem] font-semibold">Your files</h2>
      {files.data?.files.length === 0 && <Card><EmptyState icon={<BookOpenCheck />} title="No files yet" description="Uploaded files stay in your private library so you can reopen them any time." /></Card>}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {files.data?.files.map((f) => (
          <Card key={f.id} className="card-hover group relative flex items-start gap-3 p-4">
            <div className="grid size-11 shrink-0 place-items-center rounded-xl border border-line bg-surface-2 text-[0.65rem] font-bold uppercase text-accent">{f.ext}</div>
            <Link to={`/pdf/${f.id}`} className="min-w-0 flex-1">
              <div className="truncate font-medium text-ink">{f.filename}</div>
              <div className="mt-0.5 text-xs text-muted">
                {f.pages ? `${f.pages} pages · ` : ""}{f.word_count.toLocaleString()} words · {formatBytes(f.size)}
              </div>
              <div className="mt-1.5 flex gap-1.5">
                {f.ocr_used && <Badge tone="accent">OCR</Badge>}
                <span className="text-xs text-faint">{timeAgo(f.created_at)}</span>
              </div>
            </Link>
            <IconButton
              label="Delete file"
              className="opacity-0 group-hover:opacity-100"
              onClick={async () => {
                if (await confirm({ title: `Delete ${f.filename}?`, message: "The file and its extracted text are removed. Notes, quizzes and decks made from it are kept.", danger: true, confirmLabel: "Delete" })) {
                  await del(`/api/files/${f.id}`);
                  qc.invalidateQueries({ queryKey: ["files"] });
                }
              }}
            >
              <Trash2 className="size-4" />
            </IconButton>
          </Card>
        ))}
      </div>
    </Page>
  );
}

function Viewer({ fileId }: { fileId: number }) {
  const nav = useNavigate();
  const qc = useQueryClient();
  const { toast } = useUi();
  const copy = useCopy();
  const file = useQuery<any>({ queryKey: ["file", fileId], queryFn: () => get(`/api/files/${fileId}`) });
  const [doc, setDoc] = useState<pdfjs.PDFDocumentProxy | null>(null);
  const [page, setPage] = useState(1);
  const [scale, setScale] = useState(1.2);
  const [tab, setTab] = useState<"actions" | "text">("actions");
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [ocrBusy, setOcrBusy] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isPdf = file.data?.ext === "pdf";

  useEffect(() => {
    if (!isPdf) return;
    let task: pdfjs.PDFDocumentLoadingTask | null = null;
    let cancelled = false;
    authedUrl(`/api/files/${fileId}/raw`).then((url) => {
      task = pdfjs.getDocument({ url });
      task.promise.then((d) => !cancelled && setDoc(d)).catch((e) => !cancelled && setLoadErr(String(e?.message ?? e)));
    });
    return () => {
      cancelled = true;
      task?.destroy();
    };
  }, [fileId, isPdf]);

  useEffect(() => {
    if (!doc || !canvasRef.current) return;
    let renderTask: ReturnType<pdfjs.PDFPageProxy["render"]> | null = null;
    let cancelled = false;
    doc.getPage(page).then((p) => {
      if (cancelled || !canvasRef.current) return;
      const viewport = p.getViewport({ scale });
      const dpr = window.devicePixelRatio || 1;
      const canvas = canvasRef.current;
      canvas.width = Math.floor(viewport.width * dpr);
      canvas.height = Math.floor(viewport.height * dpr);
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;
      renderTask = p.render({ canvas, viewport, transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined });
      renderTask.promise.catch(() => undefined);
    });
    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [doc, page, scale]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT" || (e.target as HTMLElement)?.tagName === "TEXTAREA") return;
      if (e.key === "ArrowRight" || e.key === "PageDown") setPage((p) => Math.min(doc?.numPages ?? p, p + 1));
      if (e.key === "ArrowLeft" || e.key === "PageUp") setPage((p) => Math.max(1, p - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [doc]);

  if (file.isLoading) return <div className="grid h-[60vh] place-items-center"><Spinner className="size-6" /></div>;
  if (file.isError || !file.data)
    return (
      <Page>
        <EmptyState title="File not found" description="It may have been deleted." action={<Button onClick={() => nav("/pdf")}>Back to files</Button>} />
      </Page>
    );
  const f = file.data;
  const pageTexts: string[] | null = f.page_texts ?? null;
  const goTool = (path: string) => nav(path, { state: { fileId: f.id, fileName: f.filename } });
  const rerunOcr = async () => {
    setOcrBusy(true);
    try {
      await post(`/api/files/${f.id}/ocr`);
      await qc.invalidateQueries({ queryKey: ["file", fileId] });
      toast("OCR finished");
    } catch (e) {
      toast((e as Error).message, "bad");
    } finally {
      setOcrBusy(false);
    }
  };

  const actions = [
    { label: "Summarize", icon: FileText, path: "/summarizer" },
    { label: "Smart notes", icon: NotebookPen, path: "/notes" },
    { label: "Quiz", icon: ClipboardCheck, path: "/quiz" },
    { label: "Flashcards", icon: Layers, path: "/flashcards" },
    { label: "Study guide", icon: GraduationCap, path: "/study-guide" },
    { label: "Practice test", icon: BrainCircuit, path: "/practice-test" },
    { label: "Ask questions", icon: MessageCircleQuestion, path: "/qa" },
  ];

  return (
    <div className="mx-auto grid w-full max-w-[1600px] animate-rise gap-5 px-6 py-6 lg:grid-cols-[1fr_380px]">
      <div className="min-w-0">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <IconButton label="Back to files" onClick={() => nav("/pdf")}><ArrowLeft className="size-4" /></IconButton>
          <h1 className="min-w-0 flex-1 truncate text-[1.2rem] font-semibold">{f.filename}</h1>
          {isPdf && doc && (
            <div className="flex items-center gap-1 rounded-xl border border-line bg-surface p-1">
              <IconButton label="Previous page" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}><ChevronLeft className="size-4" /></IconButton>
              <span className="px-2 text-sm tabular-nums text-ink-2">{page} / {doc.numPages}</span>
              <IconButton label="Next page" onClick={() => setPage((p) => Math.min(doc.numPages, p + 1))} disabled={page >= doc.numPages}><ChevronRight className="size-4" /></IconButton>
              <span className="mx-1 h-5 w-px bg-line" />
              <IconButton label="Zoom out" onClick={() => setScale((s) => Math.max(0.5, +(s - 0.2).toFixed(1)))}><Minus className="size-4" /></IconButton>
              <span className="w-12 text-center text-xs tabular-nums text-muted">{Math.round(scale * 100)}%</span>
              <IconButton label="Zoom in" onClick={() => setScale((s) => Math.min(3, +(s + 0.2).toFixed(1)))}><Plus className="size-4" /></IconButton>
            </div>
          )}
        </div>
        <Card className="flex max-h-[calc(100vh-150px)] min-h-[70vh] justify-center overflow-auto bg-bg-2 p-6">
          {isPdf ? (
            loadErr ? (
              <Alert tone="bad" title="This PDF could not be displayed">{loadErr} — the extracted text is still available on the right.</Alert>
            ) : !doc ? (
              <Spinner className="size-6" />
            ) : (
              <canvas ref={canvasRef} className="h-fit rounded-md bg-white shadow-pop" aria-label={`Page ${page}`} />
            )
          ) : (
            <div className="prose-torz max-w-3xl whitespace-pre-wrap">{f.text}</div>
          )}
        </Card>
      </div>

      <div className="lg:sticky lg:top-20 lg:self-start">
        <Card className="flex max-h-[calc(100vh-110px)] flex-col overflow-hidden">
          <div className="px-3 pt-1">
            <Tabs value={tab} onChange={setTab} tabs={[{ value: "actions", label: "Study tools" }, { value: "text", label: "Extracted text" }]} />
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            {tab === "actions" ? (
              <div className="space-y-4">
                <div className="flex flex-wrap gap-1.5 text-xs text-muted">
                  {f.pages > 0 && <Badge>{f.pages} pages</Badge>}
                  <Badge>{f.word_count.toLocaleString()} words</Badge>
                  {f.ocr_used && <Badge tone="accent">OCR: {f.meta?.ocr_pages ?? "some"} pages</Badge>}
                </div>
                {(f.meta?.warnings ?? []).map((w: string) => <Alert key={w} tone="warn">{w}</Alert>)}
                <div className="grid grid-cols-2 gap-2">
                  {actions.map((a) => (
                    <button key={a.path} onClick={() => goTool(a.path)} className="flex flex-col items-start gap-2 rounded-xl border border-line bg-surface-2 p-3 text-left transition hover:border-accent/40">
                      <a.icon className="size-4 text-accent" />
                      <span className="text-sm font-medium text-ink">{a.label}</span>
                    </button>
                  ))}
                </div>
                <div className="space-y-2 border-t border-line pt-4">
                  <Button className="w-full" size="sm" icon={<FilePlus className="size-3.5" />} onClick={async () => { const d = await post(`/api/files/${f.id}/to-document`); toast("Text copied into a new document"); nav(`/documents/${d.id}`); }}>
                    Open text as a document
                  </Button>
                  {isPdf && (
                    <Button className="w-full" size="sm" variant="ghost" loading={ocrBusy} icon={<ScanText className="size-3.5" />} onClick={rerunOcr}>
                      Re-read with OCR (for scans)
                    </Button>
                  )}
                </div>
              </div>
            ) : (
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <span className="label">{isPdf && pageTexts ? `Page ${page}` : "Full text"}</span>
                  <Button size="sm" variant="ghost" icon={<Copy className="size-3.5" />} onClick={() => copy(isPdf && pageTexts ? pageTexts[page - 1] ?? "" : f.text)}>Copy</Button>
                </div>
                <div className="whitespace-pre-wrap text-[0.85rem] leading-relaxed text-ink-2">
                  {(isPdf && pageTexts ? pageTexts[page - 1] : f.text) || <span className="text-faint">No text on this page.</span>}
                </div>
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
