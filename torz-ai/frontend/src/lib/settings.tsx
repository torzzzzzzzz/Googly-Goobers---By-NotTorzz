import { createContext, useCallback, useContext, useEffect, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { get, patch } from "./api";

export interface AppSettings {
  profile: { name: string };
  appearance: { theme: "dark" | "light" | "system"; accent: string; font_size: string; compact: boolean; reduce_motion: boolean };
  ai: {
    default_provider: string;
    fallback_to_local: boolean;
    temperature: number;
    num_ctx: number;
    providers: Record<string, { base_url: string; model: string; enabled: boolean; label?: string; think?: boolean }>;
  };
  writing: { default_mode: string; rewrite_strength: number; language: string; explain_changes: boolean; dictionary?: string[] };
  study: { question_count: number; difficulty: string; auto_advance: boolean };
  dashboard: { shortcuts: string[] };
  autotyper: { wpm: number; natural_rhythm: boolean };
  privacy: { save_history: boolean };
}

interface SettingsResponse {
  settings: AppSettings;
  api_keys: Record<string, { set: boolean; masked: string }>;
}

interface Ctx {
  settings: AppSettings | undefined;
  apiKeys: SettingsResponse["api_keys"] | undefined;
  loading: boolean;
  error: unknown;
  update: (patch: Partial<{ [K in keyof AppSettings]: Partial<AppSettings[K]> | any }>) => Promise<void>;
}

const SettingsContext = createContext<Ctx | null>(null);

function applyAppearance(a?: AppSettings["appearance"]) {
  const root = document.documentElement;
  const theme = a?.theme ?? "dark";
  const resolved = theme === "system" ? (window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark") : theme;
  root.dataset.theme = resolved;
  root.dataset.accent = a?.accent ?? "cyan";
  root.dataset.font = a?.font_size ?? "medium";
  root.dataset.density = a?.compact ? "compact" : "comfortable";
  root.dataset.motion = a?.reduce_motion ? "reduce" : "full";
  try {
    localStorage.setItem("torz:appearance", JSON.stringify(a ?? {}));
  } catch {
    /* ignore */
  }
}

// Apply the last known appearance immediately to avoid a flash before settings load.
try {
  const cached = localStorage.getItem("torz:appearance");
  if (cached) applyAppearance(JSON.parse(cached));
} catch {
  /* ignore */
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const q = useQuery<SettingsResponse>({ queryKey: ["settings"], queryFn: () => get("/api/settings") });
  const m = useMutation({
    mutationFn: (p: any) => patch<SettingsResponse>("/api/settings", { patch: p }),
    onSuccess: (data) => {
      qc.setQueryData(["settings"], data);
      qc.invalidateQueries({ queryKey: ["ai-status"] });
    },
  });

  useEffect(() => {
    applyAppearance(q.data?.settings.appearance);
    if (q.data?.settings.appearance.theme === "system") {
      const mq = window.matchMedia("(prefers-color-scheme: light)");
      const fn = () => applyAppearance(q.data?.settings.appearance);
      mq.addEventListener("change", fn);
      return () => mq.removeEventListener("change", fn);
    }
  }, [q.data?.settings.appearance]);

  const update = useCallback(async (p: any) => {
    await m.mutateAsync(p);
  }, [m]);

  return (
    <SettingsContext.Provider value={{ settings: q.data?.settings, apiKeys: q.data?.api_keys, loading: q.isLoading, error: q.error, update }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings(): Ctx {
  const c = useContext(SettingsContext);
  if (!c) throw new Error("useSettings outside provider");
  return c;
}
