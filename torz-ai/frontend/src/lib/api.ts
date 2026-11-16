// API client for the local TORZ AI backend (token-protected, same origin).

export class ApiError extends Error {
  status: number;
  kind: string;
  constructor(message: string, status = 0, kind = "http") {
    super(message);
    this.status = status;
    this.kind = kind;
  }
}

let tokenPromise: Promise<string> | null = null;

export function getToken(): Promise<string> {
  if (!tokenPromise) {
    const meta = document.querySelector<HTMLMetaElement>('meta[name="torz-token"]');
    if (meta?.content) {
      tokenPromise = Promise.resolve(meta.content);
    } else {
      tokenPromise = fetch("/api/session")
        .then((r) => {
          if (!r.ok) throw new ApiError("Could not open a session with the TORZ AI server.", r.status);
          return r.json();
        })
        .then((d) => d.token as string)
        .catch((e) => {
          tokenPromise = null;
          throw e instanceof ApiError ? e : new ApiError("The TORZ AI server is not reachable. Is it running?", 0, "offline");
        });
    }
  }
  return tokenPromise;
}

type Query = Record<string, string | number | boolean | undefined | null>;

function buildUrl(path: string, query?: Query): string {
  const url = new URL(path, window.location.origin);
  if (query) for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
  return url.pathname + url.search;
}

async function parseError(r: Response): Promise<ApiError> {
  let msg = `${r.status} ${r.statusText}`;
  try {
    const d = await r.json();
    if (d?.detail) msg = typeof d.detail === "string" ? d.detail : JSON.stringify(d.detail);
  } catch {
    /* not JSON */
  }
  return new ApiError(msg, r.status);
}

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown; query?: Query; form?: FormData; signal?: AbortSignal } = {}): Promise<T> {
  const token = await getToken();
  const headers: Record<string, string> = { "X-TORZ-Token": token };
  let body: BodyInit | undefined;
  if (opts.form) body = opts.form;
  else if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.body);
  }
  let r: Response;
  try {
    r = await fetch(buildUrl(path, opts.query), { method: opts.method ?? (body ? "POST" : "GET"), headers, body, signal: opts.signal });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new ApiError("The TORZ AI server is not reachable. Is it running?", 0, "offline");
  }
  if (!r.ok) throw await parseError(r);
  if (r.status === 204) return undefined as T;
  const ct = r.headers.get("content-type") ?? "";
  return (ct.includes("application/json") ? r.json() : r.text()) as Promise<T>;
}

export const get = <T = any>(path: string, query?: Query) => api<T>(path, { query });
export const post = <T = any>(path: string, body?: unknown) => api<T>(path, { method: "POST", body: body ?? {} });
export const patch = <T = any>(path: string, body: unknown) => api<T>(path, { method: "PATCH", body });
export const put = <T = any>(path: string, body: unknown) => api<T>(path, { method: "PUT", body });
export const del = <T = any>(path: string, query?: Query) => api<T>(path, { method: "DELETE", query });

export async function upload<T = any>(path: string, file: File, extra?: Record<string, string>): Promise<T> {
  const form = new FormData();
  form.append("file", file);
  if (extra) for (const [k, v] of Object.entries(extra)) form.append(k, v);
  return api<T>(path, { method: "POST", form });
}

/** URL usable in <a href> / <iframe> / pdf.js (token passed as a query parameter). */
export async function authedUrl(path: string, query?: Query): Promise<string> {
  const token = await getToken();
  return buildUrl(path, { ...(query ?? {}), token });
}

export async function downloadFrom(path: string, query?: Query, init?: { method?: string; body?: unknown }) {
  const token = await getToken();
  const r = await fetch(buildUrl(path, query), {
    method: init?.method ?? "GET",
    headers: { "X-TORZ-Token": token, ...(init?.body ? { "Content-Type": "application/json" } : {}) },
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });
  if (!r.ok) throw await parseError(r);
  const blob = await r.blob();
  const cd = r.headers.get("content-disposition") ?? "";
  const m = /filename="?([^";]+)"?/.exec(cd);
  saveBlob(blob, m?.[1] ?? "download");
}

export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// ------------------------------------------------------------------------------------------------ SSE streaming

export interface StreamEvent {
  type: "meta" | "delta" | "progress" | "passages" | "done" | "error";
  [k: string]: any;
}

export const SETUP_ERROR_KINDS = new Set(["no_model", "unavailable", "not_configured", "model_not_found", "auth", "timeout"]);

export async function streamTool(path: string, body: unknown, onEvent: (ev: StreamEvent) => void, signal?: AbortSignal): Promise<void> {
  const token = await getToken();
  let r: Response;
  try {
    r = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json", "X-TORZ-Token": token }, body: JSON.stringify(body), signal });
  } catch (e) {
    if ((e as Error).name === "AbortError") return;
    onEvent({ type: "error", kind: "offline", message: "The TORZ AI server is not reachable. Is it running?" });
    return;
  }
  if (!r.ok || !r.body) {
    const err = await parseError(r);
    onEvent({ type: "error", kind: "bad_request", message: err.message });
    return;
  }
  const reader = r.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let finished = false;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buf.indexOf("\n\n")) >= 0) {
        const chunk = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        for (const line of chunk.split("\n")) {
          if (!line.startsWith("data:")) continue;
          try {
            const ev = JSON.parse(line.slice(5).trim()) as StreamEvent;
            if (ev.type === "done" || ev.type === "error") finished = true;
            onEvent(ev);
          } catch {
            /* ignore malformed line */
          }
        }
      }
    }
  } catch (e) {
    if ((e as Error).name === "AbortError") return;
    onEvent({ type: "error", kind: "stream", message: "The connection to the server was interrupted." });
    return;
  }
  if (!finished && !signal?.aborted) onEvent({ type: "error", kind: "stream", message: "The response ended unexpectedly." });
}
