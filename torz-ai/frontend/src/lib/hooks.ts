import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { get, post, streamTool, type StreamEvent } from "./api";

export interface RunMeta {
  provider?: string | null;
  provider_label?: string;
  model?: string | null;
  engine?: string;
  fallback?: boolean;
  local?: boolean;
}

export interface RunState<T = any> {
  status: "idle" | "running" | "done" | "error";
  text: string;
  meta: RunMeta | null;
  progress: { stage?: string; current: number; total: number } | null;
  result: T | null;
  error: { kind: string; message: string } | null;
  passages: any[] | null;
}

const initial: RunState = { status: "idle", text: "", meta: null, progress: null, result: null, error: null, passages: null };

/** Run a streaming tool endpoint and expose its live state. */
export function useStreamRun<T = any>(onDone?: (result: T) => void) {
  const [state, setState] = useState<RunState<T>>(initial as RunState<T>);
  const abortRef = useRef<AbortController | null>(null);
  const qc = useQueryClient();
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  const start = useCallback(
    async (path: string, body: unknown) => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setState({ ...(initial as RunState<T>), status: "running" });
      await streamTool(
        path,
        body,
        (ev: StreamEvent) => {
          if (ctrl.signal.aborted) return;
          setState((s) => {
            switch (ev.type) {
              case "meta":
                return { ...s, meta: { ...(s.meta ?? {}), ...ev } };
              case "delta":
                return { ...s, text: s.text + (ev.text ?? "") };
              case "progress":
                return { ...s, progress: { stage: ev.stage, current: ev.current ?? 0, total: ev.total ?? 0 } };
              case "passages":
                return { ...s, passages: ev.passages };
              case "done":
                return {
                  ...s,
                  status: "done",
                  result: ev as unknown as T,
                  text: typeof ev.output === "string" ? ev.output : s.text,
                  meta: { ...(s.meta ?? {}), provider: ev.provider ?? s.meta?.provider, model: ev.model ?? s.meta?.model, engine: ev.engine ?? s.meta?.engine },
                };
              case "error":
                return { ...s, status: "error", error: { kind: ev.kind ?? "error", message: ev.message ?? "Something went wrong." } };
              default:
                return s;
            }
          });
          if (ev.type === "done") {
            qc.invalidateQueries({ queryKey: ["dashboard"] });
            qc.invalidateQueries({ queryKey: ["history"] });
            onDoneRef.current?.(ev as unknown as T);
          }
        },
        ctrl.signal,
      );
    },
    [qc],
  );

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    setState((s) => (s.status === "running" ? { ...s, status: s.text ? "done" : "idle", progress: null } : s));
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setState(initial as RunState<T>);
  }, []);

  useEffect(() => () => abortRef.current?.abort(), []);

  return { ...state, start, cancel, reset, setState };
}

/** useState persisted to localStorage (drafts survive refreshes and navigation). */
export function usePersistentState<T>(key: string, initialValue: T) {
  const storageKey = `torz:${key}`;
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      return raw !== null ? (JSON.parse(raw) as T) : initialValue;
    } catch {
      return initialValue;
    }
  });
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        localStorage.setItem(storageKey, JSON.stringify(value));
      } catch {
        /* storage full or unavailable */
      }
    }, 250);
    return () => clearTimeout(t);
  }, [storageKey, value]);
  return [value, setValue] as const;
}

export function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** Record that a tool page was opened (powers "recently used"). */
export function useToolVisit(toolId: string) {
  const qc = useQueryClient();
  useEffect(() => {
    post(`/api/usage/${toolId}`)
      .then(() => qc.invalidateQueries({ queryKey: ["dashboard"] }))
      .catch(() => undefined);
  }, [toolId, qc]);
}

export interface AIStatus {
  provider: string;
  provider_label: string;
  model: string;
  ok: boolean;
  message: string;
  local: boolean;
  kind?: string;
  fallback?: { provider: string; model: string } | null;
}

export function useAIStatus() {
  return useQuery<AIStatus>({
    queryKey: ["ai-status"],
    queryFn: () => get<AIStatus>("/api/ai/status"),
    refetchInterval: 60_000,
    staleTime: 15_000,
    retry: 1,
  });
}

export function useFavorites() {
  return useQuery<{ favorites: string[] }>({ queryKey: ["favorites"], queryFn: () => get("/api/favorites") });
}
