import { useEffect, useState, type ReactNode } from "react";
import { NavLink, useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  BookMarked,
  Check,
  CircleCheck,
  CircleX,
  Cloud,
  Cpu,
  Database,
  Download,
  ExternalLink,
  HardDrive,
  KeyRound,
  LoaderCircle,
  Palette,
  Plug,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  User,
} from "lucide-react";
import { api, del, downloadFrom, get, post, put, streamTool } from "../lib/api";
import { formatBytes } from "../lib/format";
import { useAIStatus } from "../lib/hooks";
import { useSettings } from "../lib/settings";
import { Alert, Badge, Button, Card, cx, Field, Input, ProgressBar, Segmented, Select, Slider, Switch, useUi } from "../components/ui";
import { Page } from "../components/tool/ToolKit";

const SECTIONS = [
  { id: "profile", label: "Profile", icon: User },
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "ai", label: "AI models", icon: Cpu },
  { id: "defaults", label: "Writing & study", icon: SlidersHorizontal },
  { id: "privacy", label: "Privacy & data", icon: ShieldCheck },
  { id: "system", label: "System", icon: Activity },
];

export default function Settings() {
  const { section = "profile" } = useParams();
  return (
    <Page wide>
      <h1 className="mb-6 text-[1.45rem] font-semibold tracking-tight">Settings</h1>
      <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
        <nav className="h-fit space-y-0.5" aria-label="Settings sections">
          {SECTIONS.map((s) => (
            <NavLink key={s.id} to={`/settings/${s.id}`} className={() => cx("flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition", section === s.id ? "bg-accent-soft font-medium text-ink" : "text-muted hover:bg-surface-2 hover:text-ink")}>
              <s.icon className={cx("size-4", section === s.id && "text-accent")} />
              {s.label}
            </NavLink>
          ))}
        </nav>
        <div className="min-w-0 space-y-5">
          {section === "profile" && <ProfileSection />}
          {section === "appearance" && <AppearanceSection />}
          {section === "ai" && <AISection />}
          {section === "defaults" && <DefaultsSection />}
          {section === "privacy" && <PrivacySection />}
          {section === "system" && <SystemSection />}
        </div>
      </div>
    </Page>
  );
}

function Section({ title, description, children, action }: { title: string; description?: ReactNode; children: ReactNode; action?: ReactNode }) {
  return (
    <Card className="p-6">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-[1.05rem] font-semibold text-ink">{title}</h2>
          {description && <p className="mt-1 text-sm text-muted">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </Card>
  );
}

// ------------------------------------------------------------------------------------------------ profile

function ProfileSection() {
  const { settings, update } = useSettings();
  const { toast } = useUi();
  const [name, setName] = useState(settings?.profile.name ?? "");
  useEffect(() => setName(settings?.profile.name ?? ""), [settings?.profile.name]);
  return (
    <Section title="Profile" description="Used for the welcome message. TORZ AI has no accounts — everything stays on this computer.">
      <div className="flex max-w-md items-end gap-3">
        <Field label="Your name" className="flex-1"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Torz" /></Field>
        <Button variant="primary" onClick={async () => { await update({ profile: { name: name.trim() } }); toast("Saved"); }}>Save</Button>
      </div>
    </Section>
  );
}

// ------------------------------------------------------------------------------------------------ appearance

const ACCENTS = [
  { id: "cyan", color: "#22d3ee" },
  { id: "blue", color: "#60a5fa" },
  { id: "teal", color: "#2dd4bf" },
  { id: "violet", color: "#a78bfa" },
  { id: "emerald", color: "#34d399" },
  { id: "amber", color: "#fbbf24" },
];

function AppearanceSection() {
  const { settings, update } = useSettings();
  if (!settings) return null;
  const a = settings.appearance;
  return (
    <Section title="Appearance">
      <div className="space-y-6">
        <div>
          <div className="label mb-2">Theme</div>
          <Segmented value={a.theme} onChange={(v) => update({ appearance: { theme: v } })} options={[{ value: "dark", label: "Dark" }, { value: "light", label: "Light" }, { value: "system", label: "Match system" }]} />
        </div>
        <div>
          <div className="label mb-2">Accent color</div>
          <div className="flex gap-2.5">
            {ACCENTS.map((c) => (
              <button key={c.id} onClick={() => update({ appearance: { accent: c.id } })} aria-label={`${c.id} accent`} aria-pressed={a.accent === c.id} className={cx("grid size-9 place-items-center rounded-xl border-2 transition", a.accent === c.id ? "border-ink" : "border-transparent hover:scale-105")} style={{ background: c.color }}>
                {a.accent === c.id && <Check className="size-4 text-black/70" />}
              </button>
            ))}
          </div>
        </div>
        <div>
          <div className="label mb-2">Text size</div>
          <Segmented value={a.font_size} onChange={(v) => update({ appearance: { font_size: v } })} options={[{ value: "small", label: "Small" }, { value: "medium", label: "Medium" }, { value: "large", label: "Large" }, { value: "xl", label: "Extra large" }]} />
        </div>
        <div className="grid max-w-xl gap-4">
          <Switch checked={a.compact} onChange={(v) => update({ appearance: { compact: v } })} label="Compact layout" description="Tighter spacing to fit more on screen" />
          <Switch checked={a.reduce_motion} onChange={(v) => update({ appearance: { reduce_motion: v } })} label="Reduce motion" description="Turn off animations and transitions" />
        </div>
      </div>
    </Section>
  );
}

// ------------------------------------------------------------------------------------------------ AI

interface ProvidersResp {
  providers: { id: string; label: string; local: boolean; needs_key: boolean; default_base_url: string; docs_url: string }[];
  settings: any;
  api_keys: Record<string, { set: boolean; masked: string }>;
  recommended_models: { id: string; label: string; size: string; ram: string; note: string }[];
  secret_backend: string;
}

const PROVIDER_HELP: Record<string, ReactNode> = {
  ollama: <>Free and private: models run on your PC. Install from <a className="text-accent underline" href="https://ollama.com/download" target="_blank" rel="noreferrer">ollama.com/download</a>, start it, then download a model below.</>,
  openai_compatible: <>Any server that speaks the OpenAI API: <b>LM Studio</b> (local, free — start its server, default <code>http://127.0.0.1:1234/v1</code>), llama.cpp <code>llama-server</code>, Jan, vLLM, LocalAI — or hosted services like OpenRouter or Groq (their own pricing).</>,
  openai: <>Optional paid service — you pay OpenAI per use. TORZ AI itself adds no cost. Create a key at platform.openai.com.</>,
  anthropic: <>Optional paid service — you pay Anthropic per use. Create a key in the Anthropic Console.</>,
  gemini: <>Optional — Google AI Studio offers a limited free tier and paid usage. Create a key at aistudio.google.com.</>,
};

function AISection() {
  const qc = useQueryClient();
  const { update } = useSettings();
  const status = useAIStatus();
  const p = useQuery<ProvidersResp>({ queryKey: ["providers"], queryFn: () => get("/api/ai/providers") });
  const [selected, setSelected] = useState<string | null>(null);
  if (!p.data) return <Card className="p-6"><LoaderCircle className="size-5 animate-spin text-accent" /></Card>;
  const s = p.data.settings;
  const current = selected ?? s.default_provider;
  const prov = p.data.providers.find((x) => x.id === current)!;
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["providers"] });
    qc.invalidateQueries({ queryKey: ["ai-status"] });
    qc.invalidateQueries({ queryKey: ["settings"] });
  };

  return (
    <>
      <Section title="Active AI model" description="Every result shows which model produced it.">
        {status.data && (
          <Alert tone={status.data.ok ? "good" : "warn"} title={status.data.ok ? `${status.data.fallback ? status.data.fallback.model : status.data.model} via ${status.data.fallback ? "Ollama (fallback)" : status.data.provider_label}` : "No model connected"}>
            {status.data.message}
          </Alert>
        )}
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Switch checked={s.fallback_to_local} onChange={async (v) => { await update({ ai: { fallback_to_local: v } }); refresh(); }} label="Fall back to local Ollama" description="If a cloud provider fails, use your local model instead" />
          <div>
            <div className="mb-2 text-[0.9rem] text-ink">Creativity: {Number(s.temperature).toFixed(1)}</div>
            <Slider value={s.temperature} min={0} max={1.2} step={0.1} onChange={(v) => update({ ai: { temperature: v } })} labels={["Precise", "Balanced", "Creative"]} />
          </div>
          <Field label="Context window (Ollama)" hint="Larger handles longer text per request but needs more memory.">
            <Select value={s.num_ctx} onChange={(e) => update({ ai: { num_ctx: Number(e.target.value) } })}>
              {[4096, 8192, 16384, 32768].map((n) => <option key={n} value={n}>{n.toLocaleString()} tokens</option>)}
            </Select>
          </Field>
        </div>
      </Section>

      <Section title="Providers" description="Choose a provider to configure it. The one marked Default is used by every tool.">
        <div className="mb-5 grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {p.data.providers.map((x) => (
            <button key={x.id} onClick={() => setSelected(x.id)} className={cx("rounded-xl border p-3 text-left transition", current === x.id ? "border-accent/50 bg-accent-soft" : "border-line hover:border-line-strong")}>
              <div className="flex items-center gap-1.5">{x.local ? <HardDrive className="size-3.5 text-muted" /> : <Cloud className="size-3.5 text-muted" />}<span className="text-sm font-medium text-ink">{x.label}</span></div>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {s.default_provider === x.id && <Badge tone="accent">Default</Badge>}
                <Badge>{x.local ? "Local · free" : "Cloud · optional"}</Badge>
              </div>
            </button>
          ))}
        </div>
        <ProviderConfig key={current} prov={prov} cfg={s.providers[current]} isDefault={s.default_provider === current} keyStatus={p.data.api_keys[current]} recommended={p.data.recommended_models} onChanged={refresh} />
        <p className="mt-4 text-xs text-faint">API keys are stored with: {p.data.secret_backend}. They are never sent to the browser.</p>
      </Section>
    </>
  );
}

function ProviderConfig({ prov, cfg, isDefault, keyStatus, recommended, onChanged }: { prov: ProvidersResp["providers"][0]; cfg: any; isDefault: boolean; keyStatus: { set: boolean; masked: string }; recommended: ProvidersResp["recommended_models"]; onChanged: () => void }) {
  const { update } = useSettings();
  const { toast } = useUi();
  const [baseUrl, setBaseUrl] = useState(cfg.base_url);
  const [key, setKey] = useState("");
  const [test, setTest] = useState<any>(null);
  const [testing, setTesting] = useState(false);
  const models = useQuery<{ models: { id: string; label: string; size?: number }[]; error?: { message: string } }>({ queryKey: ["models", prov.id], queryFn: () => get(`/api/ai/providers/${prov.id}/models`), retry: false });

  const runTest = async () => {
    setTesting(true);
    try {
      setTest(await post(`/api/ai/providers/${prov.id}/test`));
      models.refetch();
    } finally {
      setTesting(false);
    }
  };
  const saveCfg = async (patch: Record<string, unknown>) => {
    await update({ ai: { providers: { [prov.id]: patch } } });
    onChanged();
  };

  return (
    <div className="space-y-5 rounded-2xl border border-line bg-bg-2 p-5">
      <div className="text-sm text-ink-2">{PROVIDER_HELP[prov.id]}</div>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Server address">
          <div className="flex gap-2">
            <Input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />
            <Button disabled={baseUrl === cfg.base_url} onClick={() => saveCfg({ base_url: baseUrl.trim() })}>Save</Button>
          </div>
        </Field>
        <Field label="Model" hint={models.data?.error ? models.data.error.message : !cfg.model ? "Empty = pick automatically" : undefined}>
          <Select value={cfg.model} onChange={(e) => saveCfg({ model: e.target.value })}>
            <option value="">Automatic</option>
            {cfg.model && !models.data?.models.some((m) => m.id === cfg.model) && <option value={cfg.model}>{cfg.model}</option>}
            {models.data?.models.map((m) => <option key={m.id} value={m.id}>{m.label || m.id}</option>)}
          </Select>
        </Field>
      </div>
      {(prov.needs_key || prov.id === "openai_compatible") && (
        <Field label={prov.needs_key ? "API key" : "API key (only for hosted services)"}>
          <div className="flex flex-wrap items-center gap-2">
            <Input type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder={keyStatus.set ? `Saved (${keyStatus.masked}) — enter a new key to replace` : "Paste your key"} className="max-w-md" autoComplete="off" />
            <Button icon={<KeyRound className="size-4" />} disabled={!key.trim()} onClick={async () => { await put(`/api/ai/providers/${prov.id}/key`, { key }); setKey(""); toast("API key saved securely"); onChanged(); models.refetch(); }}>Save key</Button>
            {keyStatus.set && <Button variant="ghost" icon={<Trash2 className="size-4" />} onClick={async () => { await del(`/api/ai/providers/${prov.id}/key`); onChanged(); }}>Remove</Button>}
          </div>
        </Field>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button icon={<Plug className="size-4" />} loading={testing} onClick={runTest}>Test connection</Button>
        {!isDefault && <Button variant="primary" onClick={async () => { await update({ ai: { default_provider: prov.id } }); onChanged(); toast(`${prov.label} is now the default`); }}>Make default</Button>}
        {prov.docs_url && <a href={prov.docs_url} target="_blank" rel="noreferrer"><Button variant="ghost" icon={<ExternalLink className="size-4" />}>Get it</Button></a>}
      </div>
      {test && (
        <Alert tone={test.ok ? "good" : "bad"} title={test.ok ? "Connected" : "Connection failed"}>
          {test.message} {test.ok && <span className="text-muted">({test.latency_ms} ms{test.version ? `, Ollama ${test.version}` : ""})</span>}
        </Alert>
      )}
      {prov.id === "ollama" && <OllamaModels recommended={recommended} installed={models.data?.models ?? []} onChanged={() => { models.refetch(); onChanged(); }} />}
    </div>
  );
}

function OllamaModels({ recommended, installed, onChanged }: { recommended: ProvidersResp["recommended_models"]; installed: { id: string; size?: number }[]; onChanged: () => void }) {
  const { toast, confirm } = useUi();
  const [pulling, setPulling] = useState<{ model: string; status: string; pct: number | null } | null>(null);
  const [custom, setCustom] = useState("");
  const pull = async (model: string) => {
    setPulling({ model, status: "starting", pct: null });
    await streamTool("/api/ai/ollama/pull", { model }, (ev) => {
      if (ev.type === "progress") setPulling({ model, status: ev.status, pct: ev.total ? Math.round((100 * (ev.completed ?? 0)) / ev.total) : null });
      if (ev.type === "done") { toast(`${model} is ready`); onChanged(); }
      if (ev.type === "error") toast(ev.message, "bad");
    });
    setPulling(null);
  };
  const isInstalled = (id: string) => installed.some((m) => m.id === id || m.id === `${id}:latest`);
  return (
    <div className="space-y-4 border-t border-line pt-5">
      <div>
        <div className="label mb-2">Installed models</div>
        {installed.length === 0 ? <p className="text-sm text-muted">None yet (or Ollama is not running).</p> : (
          <div className="space-y-1.5">
            {installed.map((m) => (
              <div key={m.id} className="flex items-center gap-3 rounded-lg border border-line bg-surface px-3 py-2 text-sm">
                <CircleCheck className="size-4 text-good" />
                <span className="flex-1 text-ink">{m.id}</span>
                <span className="text-xs text-muted">{formatBytes(m.size)}</span>
                <button aria-label={`Delete ${m.id}`} className="text-faint hover:text-bad" onClick={async () => { if (await confirm({ title: `Delete ${m.id}?`, message: "Frees disk space. You can download it again later.", danger: true, confirmLabel: "Delete" })) { await del(`/api/ai/ollama/models/${encodeURIComponent(m.id)}`); onChanged(); } }}><Trash2 className="size-4" /></button>
              </div>
            ))}
          </div>
        )}
      </div>
      <div>
        <div className="label mb-2">Recommended models</div>
        <div className="grid gap-2 md:grid-cols-2">
          {recommended.map((m) => (
            <div key={m.id} className="rounded-xl border border-line bg-surface p-3">
              <div className="flex items-center gap-2">
                <span className="font-medium text-ink">{m.label}</span>
                <span className="text-xs text-muted">{m.size} · {m.ram}</span>
              </div>
              <p className="mt-1 text-xs text-muted">{m.note}</p>
              <div className="mt-2.5">
                {isInstalled(m.id) ? <Badge tone="good">Installed</Badge> : pulling?.model === m.id ? (
                  <div><div className="mb-1 text-xs text-muted">{pulling.status}{pulling.pct !== null ? ` · ${pulling.pct}%` : ""}</div><ProgressBar value={pulling.pct ?? 0} indeterminate={pulling.pct === null} /></div>
                ) : (
                  <Button size="sm" icon={<Download className="size-3.5" />} disabled={!!pulling} onClick={() => pull(m.id)}>Download</Button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="flex max-w-md items-end gap-2">
        <Field label="Other model from the Ollama library" className="flex-1"><Input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="e.g. mistral:7b" /></Field>
        <Button disabled={!custom.trim() || !!pulling} onClick={() => pull(custom.trim())} icon={<Download className="size-4" />}>Download</Button>
      </div>
      {pulling && !recommended.some((r) => r.id === pulling.model) && (
        <div><div className="mb-1 text-xs text-muted">{pulling.model}: {pulling.status}{pulling.pct !== null ? ` · ${pulling.pct}%` : ""}</div><ProgressBar value={pulling.pct ?? 0} indeterminate={pulling.pct === null} /></div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ defaults

const LANGS = ["auto", "English", "Spanish", "French", "German", "Portuguese", "Italian", "Dutch", "Polish", "Turkish", "Russian", "Ukrainian", "Arabic", "Hindi", "Chinese", "Japanese", "Korean", "Vietnamese", "Indonesian"];

function DefaultsSection() {
  const { settings, update } = useSettings();
  const { toast } = useUi();
  if (!settings) return null;
  const w = settings.writing;
  const st = settings.study;
  const dict = w.dictionary ?? [];
  return (
    <>
      <Section title="Writing defaults">
        <div className="grid gap-5 md:grid-cols-2">
          <div>
            <div className="label mb-2">Default humanizer mode</div>
            <Segmented value={w.default_mode} onChange={(v) => update({ writing: { default_mode: v } })} options={[{ value: "simple", label: "Simple" }, { value: "standard", label: "Standard" }, { value: "enhanced", label: "Enhanced" }]} />
          </div>
          <div>
            <div className="label mb-3">Default rewrite strength: {w.rewrite_strength}</div>
            <Slider value={w.rewrite_strength} min={1} max={5} onChange={(v) => update({ writing: { rewrite_strength: v } })} labels={["Light", "", "Moderate", "", "Complete"]} />
          </div>
          <Field label="Output language" hint="“Same as input” keeps the language of your text.">
            <Select value={w.language} onChange={(e) => update({ writing: { language: e.target.value } })}>
              {LANGS.map((l) => <option key={l} value={l}>{l === "auto" ? "Same as input" : l}</option>)}
            </Select>
          </Field>
          <div className="pt-6"><Switch checked={w.explain_changes} onChange={(v) => update({ writing: { explain_changes: v } })} label="Explain changes by default" description="Writing Assistant adds an explanation after each edit" /></div>
        </div>
      </Section>
      <Section title="Study defaults">
        <div className="grid gap-5 md:grid-cols-3">
          <Field label="Questions per quiz"><Input type="number" min={1} max={100} value={st.question_count} onChange={(e) => update({ study: { question_count: Number(e.target.value) || 10 } })} /></Field>
          <div>
            <div className="label mb-2">Difficulty</div>
            <Segmented size="sm" value={st.difficulty} onChange={(v) => update({ study: { difficulty: v } })} options={[{ value: "easy", label: "Easy" }, { value: "medium", label: "Medium" }, { value: "hard", label: "Hard" }, { value: "mixed", label: "Mixed" }]} />
          </div>
          <div className="pt-6"><Switch checked={st.auto_advance} onChange={(v) => update({ study: { auto_advance: v } })} label="Auto-advance after a correct answer" /></div>
        </div>
      </Section>
      <Section title="Personal dictionary" description="Words the offline grammar checker should never flag as spelling mistakes.">
        {dict.length === 0 ? <p className="text-sm text-muted">Empty. Use “Add to dictionary” in the Grammar Checker.</p> : (
          <div className="flex flex-wrap gap-2">
            {dict.map((d) => (
              <span key={d} className="flex items-center gap-1.5 rounded-full border border-line px-3 py-1 text-sm">
                <BookMarked className="size-3.5 text-muted" />{d}
                <button aria-label={`Remove ${d}`} className="text-faint hover:text-bad" onClick={async () => { await update({ writing: { dictionary: dict.filter((x) => x !== d) } }); toast("Removed"); }}>×</button>
              </span>
            ))}
          </div>
        )}
      </Section>
    </>
  );
}

// ------------------------------------------------------------------------------------------------ privacy

function PrivacySection() {
  const { settings, update } = useSettings();
  const qc = useQueryClient();
  const nav = useNavigate();
  const { confirm, toast } = useUi();
  const info = useQuery<any>({ queryKey: ["system-info"], queryFn: () => get("/api/system/info") });
  return (
    <>
      <Section title="Where your data lives" description="TORZ AI stores everything locally. Nothing is uploaded, tracked or shared. The only network calls are to the AI provider you choose.">
        {info.data && (
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat icon={<Database className="size-4" />} label="Database" value={formatBytes(info.data.db_size)} />
            <Stat icon={<HardDrive className="size-4" />} label="Uploaded files" value={formatBytes(info.data.files_size)} />
            <Stat icon={<HardDrive className="size-4" />} label="Free disk space" value={formatBytes(info.data.disk_free)} />
          </div>
        )}
        {info.data && <div className="mt-4 rounded-xl border border-line bg-bg-2 px-4 py-3 font-mono text-xs text-ink-2">{info.data.data_dir}</div>}
        <div className="mt-5 max-w-xl">
          {settings && <Switch checked={settings.privacy.save_history} onChange={(v) => update({ privacy: { save_history: v } })} label="Save tool history" description="When off, results are not added to History (documents, notes, decks and quizzes you create are still saved)." />}
        </div>
      </Section>
      <Section title="Your data">
        <div className="flex flex-wrap gap-2">
          <Button icon={<Download className="size-4" />} onClick={() => downloadFrom("/api/system/export").catch((e) => toast(e.message, "bad"))}>Export all data (.zip)</Button>
          <Button variant="danger" icon={<Trash2 className="size-4" />} onClick={async () => { if (await confirm({ title: "Clear all history?", message: "Deletes every history entry. Documents, notes, decks and quizzes are kept.", danger: true, confirmLabel: "Clear history" })) { const r = await del("/api/history"); toast(`Deleted ${r.deleted} entries`); qc.invalidateQueries(); } }}>Clear history</Button>
          <Button variant="danger" icon={<Trash2 className="size-4" />} onClick={async () => {
            if (await confirm({ title: "Delete all documents?", message: "Every document is moved to the trash, then the trash is emptied. This cannot be undone.", danger: true, confirmLabel: "Delete all documents" })) {
              const { documents } = await get("/api/documents");
              for (const d of documents) await del(`/api/documents/${d.id}`);
              const r = await post("/api/documents/trash/empty");
              toast(`Deleted ${r.deleted} documents`);
              qc.invalidateQueries();
            }
          }}>Delete all documents</Button>
        </div>
      </Section>
      <Section title="Reset TORZ AI" description="Erases all documents, notes, decks, quizzes, history, uploads, saved API keys and settings.">
        <Button variant="danger" onClick={async () => {
          const v = await confirm({ title: "Reset everything?", message: "This permanently deletes all your TORZ AI data. Type RESET to confirm.", danger: true, input: { label: "Confirmation", placeholder: "RESET" }, confirmLabel: "Reset TORZ AI" });
          if (v === "RESET") {
            await post("/api/system/reset", { confirm: "RESET" });
            localStorage.clear();
            qc.clear();
            toast("TORZ AI was reset");
            nav("/");
            window.location.reload();
          } else if (v) toast("Type RESET exactly to confirm", "bad");
        }}>Reset application</Button>
      </Section>
    </>
  );
}

function Stat({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line bg-bg-2 p-4">
      <div className="flex items-center gap-2 text-xs text-muted">{icon}{label}</div>
      <div className="mt-1.5 text-lg font-semibold text-ink">{value}</div>
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ system

function SystemSection() {
  const info = useQuery<any>({ queryKey: ["system-info"], queryFn: () => get("/api/system/info") });
  const status = useAIStatus();
  const [diag, setDiag] = useState<any>(null);
  const [running, setRunning] = useState(false);
  const d = info.data;
  return (
    <>
      <Section title="About">
        {d && (
          <dl className="grid gap-x-8 gap-y-2.5 text-sm sm:grid-cols-2">
            <Row k="Version" v={`TORZ AI ${d.version}`} />
            <Row k="Server" v={<span className="flex items-center gap-1.5"><CircleCheck className="size-3.5 text-good" />Running at {d.address}</span>} />
            <Row k="AI model" v={status.data ? (status.data.ok ? `${status.data.model} (${status.data.provider_label})` : "Not connected") : "…"} />
            <Row k="OCR" v={d.ocr.available ? d.ocr.engine : "Not installed"} />
            <Row k="Database" v={`SQLite, schema v${d.db_schema_version}, ${formatBytes(d.db_size)}`} />
            <Row k="Key storage" v={d.secret_backend} />
            <Row k="Python" v={d.python} />
            <Row k="Platform" v={d.platform} />
            <Row k="Upload limit" v={`${d.max_upload_mb} MB per file`} />
            <Row k="Uptime" v={`${Math.floor(d.uptime_s / 60)} min`} />
          </dl>
        )}
      </Section>
      <Section title="Diagnostics" description="Checks the database, storage, OCR, key storage and AI connection." action={<Button icon={<Activity className="size-4" />} loading={running} onClick={async () => { setRunning(true); try { setDiag(await api("/api/system/diagnostics", { method: "POST", body: {} })); } finally { setRunning(false); } }}>Run diagnostics</Button>}>
        {!diag && <p className="text-sm text-muted">Press Run diagnostics.</p>}
        {diag && (
          <div className="space-y-2">
            {diag.checks.map((c: any) => (
              <div key={c.name} className="flex items-start gap-3 rounded-xl border border-line px-4 py-2.5 text-sm">
                {c.ok ? <CircleCheck className="mt-0.5 size-4 shrink-0 text-good" /> : <CircleX className="mt-0.5 size-4 shrink-0 text-bad" />}
                <span className="w-44 shrink-0 font-medium text-ink">{c.name}</span>
                <span className="min-w-0 break-words text-muted">{c.detail}</span>
              </div>
            ))}
          </div>
        )}
      </Section>
    </>
  );
}

function Row({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="flex gap-3 border-b border-line py-1.5">
      <dt className="w-28 shrink-0 text-muted">{k}</dt>
      <dd className="min-w-0 text-ink">{v}</dd>
    </div>
  );
}
