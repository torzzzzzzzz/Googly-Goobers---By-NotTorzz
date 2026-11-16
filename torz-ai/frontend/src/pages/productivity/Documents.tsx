import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Copy,
  Download,
  Ellipsis,
  FileText,
  FileUp,
  Folder,
  FolderOpen,
  FolderPlus,
  Pencil,
  Pin,
  Plus,
  RotateCcw,
  Search,
  Trash2,
} from "lucide-react";
import { del, downloadFrom, get, patch, post, upload } from "../../lib/api";
import { timeAgo } from "../../lib/format";
import { useDebounced, useToolVisit } from "../../lib/hooks";
import { Button, Card, cx, EmptyState, IconButton, Input, Menu, Select, Skeleton, useUi } from "../../components/ui";
import { Page, ToolHeader } from "../../components/tool/ToolKit";

type View = { kind: "all" } | { kind: "folder"; id: number } | { kind: "trash" };

export default function Documents() {
  useToolVisit("documents");
  const nav = useNavigate();
  const qc = useQueryClient();
  const { toast, confirm } = useUi();
  const [view, setView] = useState<View>({ kind: "all" });
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("updated");
  const dq = useDebounced(q, 250);
  const fileRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);

  const folders = useQuery<{ folders: any[] }>({ queryKey: ["folders"], queryFn: () => get("/api/folders") });
  const docs = useQuery<{ documents: any[] }>({
    queryKey: ["documents", view, dq, sort],
    queryFn: () => get("/api/documents", { q: dq, sort, trash: view.kind === "trash", folder_id: view.kind === "folder" ? view.id : undefined }),
  });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["documents"] });
    qc.invalidateQueries({ queryKey: ["folders"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
  };

  const newDoc = async () => {
    const d = await post<{ id: number }>("/api/documents", { title: "Untitled document", folder_id: view.kind === "folder" ? view.id : null });
    refresh();
    nav(`/documents/${d.id}`);
  };
  const newFolder = async () => {
    const name = await confirm({ title: "New folder", input: { label: "Folder name", placeholder: "e.g. History essays" }, confirmLabel: "Create" });
    if (typeof name === "string") {
      await post("/api/folders", { name });
      refresh();
    }
  };
  const importFile = async (f?: File) => {
    if (!f) return;
    setImporting(true);
    try {
      const d = await upload<any>("/api/documents/import", f, view.kind === "folder" ? { folder_id: String(view.id) } : undefined);
      refresh();
      toast(`Imported ${f.name}`);
      nav(`/documents/${d.id}`);
    } catch (e) {
      toast((e as Error).message, "bad");
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const rename = async (d: any) => {
    const title = await confirm({ title: "Rename document", input: { label: "Title", initial: d.title }, confirmLabel: "Rename" });
    if (typeof title === "string") {
      await patch(`/api/documents/${d.id}`, { title });
      refresh();
    }
  };
  const move = async (d: any, folderId: number | null) => {
    await patch(`/api/documents/${d.id}`, folderId === null ? { move_to_root: true } : { folder_id: folderId });
    refresh();
    toast("Moved");
  };
  const trash = async (d: any) => {
    await del(`/api/documents/${d.id}`);
    refresh();
    toast(<span>Moved to trash. <button className="text-accent underline" onClick={async () => { await post(`/api/documents/${d.id}/restore`); refresh(); }}>Undo</button></span>);
  };

  const folderList = folders.data?.folders ?? [];
  const current = view.kind === "folder" ? folderList.find((f) => f.id === view.id) : null;

  return (
    <Page wide>
      <ToolHeader
        toolId="documents"
        actions={
          <>
            <Button icon={importing ? undefined : <FileUp className="size-4" />} loading={importing} onClick={() => fileRef.current?.click()}>Import file</Button>
            <Button variant="primary" icon={<Plus className="size-4" />} onClick={newDoc}>New document</Button>
            <input ref={fileRef} type="file" hidden accept=".pdf,.docx,.txt,.md,.markdown" onChange={(e) => importFile(e.target.files?.[0])} />
          </>
        }
      />
      <div className="grid gap-5 lg:grid-cols-[230px_1fr]">
        <Card className="h-fit p-2">
          <FolderButton active={view.kind === "all"} icon={<FileText className="size-4" />} label="All documents" onClick={() => setView({ kind: "all" })} />
          <div className="label mb-1 mt-3 flex items-center justify-between px-2.5">
            Folders
            <IconButton label="New folder" onClick={newFolder} className="size-7"><FolderPlus className="size-3.5" /></IconButton>
          </div>
          {folderList.length === 0 && <div className="px-2.5 py-1.5 text-xs text-faint">No folders yet</div>}
          {folderList.map((f) => (
            <div key={f.id} className="group relative">
              <FolderButton active={view.kind === "folder" && view.id === f.id} icon={view.kind === "folder" && view.id === f.id ? <FolderOpen className="size-4" /> : <Folder className="size-4" />} label={f.name} count={f.count} onClick={() => setView({ kind: "folder", id: f.id })} />
              <div className="absolute right-1 top-1 opacity-0 group-hover:opacity-100">
                <Menu
                  trigger={(t) => <IconButton label="Folder options" className="size-7" onClick={t}><Ellipsis className="size-3.5" /></IconButton>}
                  items={[
                    { label: "Rename", icon: <Pencil />, onClick: async () => { const name = await confirm({ title: "Rename folder", input: { label: "Name", initial: f.name }, confirmLabel: "Rename" }); if (typeof name === "string") { await patch(`/api/folders/${f.id}`, { name, parent_id: f.parent_id }); refresh(); } } },
                    { label: "Delete folder", icon: <Trash2 />, danger: true, onClick: async () => { if (await confirm({ title: `Delete folder “${f.name}”?`, message: "Documents inside are kept and moved to All documents.", danger: true, confirmLabel: "Delete folder" })) { await del(`/api/folders/${f.id}`); if (view.kind === "folder" && view.id === f.id) setView({ kind: "all" }); refresh(); } } },
                  ]}
                />
              </div>
            </div>
          ))}
          <div className="my-2 h-px bg-line" />
          <FolderButton active={view.kind === "trash"} icon={<Trash2 className="size-4" />} label="Trash" onClick={() => setView({ kind: "trash" })} />
        </Card>

        <div>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <h2 className="text-[1.05rem] font-semibold">{view.kind === "trash" ? "Trash" : current ? current.name : "All documents"}</h2>
            <div className="relative ml-auto w-full max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search documents" className="pl-9" aria-label="Search documents" />
            </div>
            <Select value={sort} onChange={(e) => setSort(e.target.value)} className="w-40" aria-label="Sort">
              <option value="updated">Last edited</option>
              <option value="created">Date created</option>
              <option value="title">Title</option>
            </Select>
            {view.kind === "trash" && (docs.data?.documents.length ?? 0) > 0 && (
              <Button variant="danger" size="sm" onClick={async () => { if (await confirm({ title: "Empty trash?", message: "Documents in the trash will be deleted permanently.", danger: true, confirmLabel: "Empty trash" })) { await post("/api/documents/trash/empty"); refresh(); } }}>Empty trash</Button>
            )}
          </div>

          {docs.isLoading && <div className="space-y-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-16" />)}</div>}
          {docs.data?.documents.length === 0 && (
            <Card>
              {view.kind === "trash" ? (
                <EmptyState icon={<Trash2 />} title="Trash is empty" description="Deleted documents stay here until you remove them permanently." />
              ) : (
                <EmptyState icon={<FileText />} title={q ? "No matching documents" : "No documents here yet"} description="Create a document, or import a PDF, Word or text file." action={<Button icon={<Plus className="size-4" />} onClick={newDoc}>New document</Button>} />
              )}
            </Card>
          )}
          <div className="space-y-2">
            {docs.data?.documents.map((d) => (
              <Card key={d.id} className="group flex items-center gap-4 px-4 py-3 transition hover:border-line-strong">
                <div className="grid size-10 shrink-0 place-items-center rounded-xl border border-line bg-surface-2"><FileText className="size-4 text-accent" /></div>
                {view.kind === "trash" ? (
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium text-ink">{d.title}</div>
                    <div className="text-xs text-muted">Deleted {timeAgo(d.deleted_at)} · {d.word_count} words</div>
                  </div>
                ) : (
                  <Link to={`/documents/${d.id}`} className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      {d.pinned && <Pin className="size-3.5 fill-current text-accent" />}
                      <span className="truncate font-medium text-ink">{d.title}</span>
                    </div>
                    <div className="truncate text-xs text-muted">{d.snippet || "Empty document"}</div>
                  </Link>
                )}
                <div className="hidden text-right text-xs text-muted sm:block">
                  <div>{d.word_count.toLocaleString()} words</div>
                  <div className="text-faint">{timeAgo(d.updated_at)}</div>
                </div>
                {view.kind === "trash" ? (
                  <div className="flex gap-1.5">
                    <Button size="sm" icon={<RotateCcw className="size-3.5" />} onClick={async () => { await post(`/api/documents/${d.id}/restore`); refresh(); toast("Restored"); }}>Restore</Button>
                    <Button size="sm" variant="danger" onClick={async () => { if (await confirm({ title: "Delete permanently?", message: `“${d.title}” cannot be recovered afterwards.`, danger: true, confirmLabel: "Delete forever" })) { await del(`/api/documents/${d.id}`, { permanent: true }); refresh(); } }}>Delete</Button>
                  </div>
                ) : (
                  <Menu
                    trigger={(t) => <IconButton label="Document options" onClick={t}><Ellipsis className="size-4" /></IconButton>}
                    items={[
                      { label: "Open", icon: <FileText />, onClick: () => nav(`/documents/${d.id}`) },
                      { label: "Rename", icon: <Pencil />, onClick: () => rename(d) },
                      { label: d.pinned ? "Unpin" : "Pin to top", icon: <Pin />, onClick: async () => { await patch(`/api/documents/${d.id}`, { pinned: !d.pinned }); refresh(); } },
                      { label: "Duplicate", icon: <Copy />, onClick: async () => { await post(`/api/documents/${d.id}/duplicate`); refresh(); toast("Duplicated"); } },
                      { label: "Export as Word", icon: <Download />, onClick: () => downloadFrom(`/api/documents/${d.id}/export`, { format: "docx" }) },
                      { label: "Export as PDF", icon: <Download />, onClick: () => downloadFrom(`/api/documents/${d.id}/export`, { format: "pdf" }) },
                      "divider",
                      ...(d.folder_id ? [{ label: "Move to All documents", icon: <FolderOpen />, onClick: () => move(d, null) }] : []),
                      ...folderList.filter((f) => f.id !== d.folder_id).map((f) => ({ label: `Move to ${f.name}`, icon: <Folder />, onClick: () => move(d, f.id) })),
                      "divider",
                      { label: "Move to trash", icon: <Trash2 />, danger: true, onClick: () => trash(d) },
                    ]}
                  />
                )}
              </Card>
            ))}
          </div>
        </div>
      </div>
    </Page>
  );
}

function FolderButton({ active, icon, label, count, onClick }: { active: boolean; icon: React.ReactNode; label: string; count?: number; onClick: () => void }) {
  return (
    <button onClick={onClick} className={cx("flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition", active ? "bg-accent-soft text-ink" : "text-ink-2 hover:bg-surface-2")}>
      <span className={active ? "text-accent" : "text-muted"}>{icon}</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {count !== undefined && <span className="pr-6 text-xs text-faint">{count}</span>}
    </button>
  );
}
