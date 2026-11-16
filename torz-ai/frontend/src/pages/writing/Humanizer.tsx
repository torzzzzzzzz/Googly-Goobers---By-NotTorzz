import { WandSparkles } from "lucide-react";
import { usePersistentState } from "../../lib/hooks";
import { useSettings } from "../../lib/settings";
import { Checkbox, Field, Input, Segmented } from "../../components/ui";
import { RewriteTool } from "../../components/tool/RewriteTool";

type Mode = "simple" | "standard" | "enhanced";
type Tone = "original" | "conversational" | "formal";

const MODE_HELP: Record<Mode, string> = {
  simple: "Light touch: fixes awkward wording and keeps your structure and voice.",
  standard: "Smoother flow and readability, less repetition, natural phrasing.",
  enhanced: "Deeper rewrite: stronger transitions, varied sentences, clearer and more engaging.",
};

const PRESERVE = [
  ["preserve_meaning", "Preserve meaning"],
  ["preserve_vocabulary", "Keep key vocabulary"],
  ["preserve_citations", "Keep citations"],
  ["preserve_quotes", "Keep quotations"],
  ["preserve_paragraphs", "Keep paragraphs"],
  ["maintain_length", "Keep approximate length"],
] as const;

export default function Humanizer() {
  const { settings } = useSettings();
  const defaultMode = (settings?.writing.default_mode as Mode) ?? "standard";
  const [mode, setMode] = usePersistentState<Mode>("humanizer:mode", defaultMode);
  const [tone, setTone] = usePersistentState<Tone>("humanizer:tone", "original");
  const [opts, setOpts] = usePersistentState<Record<string, boolean>>("humanizer:opts", Object.fromEntries(PRESERVE.map(([k]) => [k, true])));
  const [terms, setTerms] = usePersistentState("humanizer:terms", "");

  return (
    <RewriteTool
      toolId="humanizer"
      endpoint="/api/tools/humanize"
      actionLabel="Rewrite"
      actionIcon={<WandSparkles className="size-4" />}
      outputLabel="Rewritten"
      buildBody={(text) => ({ text, mode, tone, ...opts, keep_terms: terms.split(",").map((t) => t.trim()).filter(Boolean) })}
      onRestoreSettings={(s) => {
        if (s.mode) setMode(s.mode);
        if (s.tone) setTone(s.tone);
      }}
      disclaimer="Focused on clarity, flow and your own voice. TORZ AI does not run or promise AI-detector scores."
      options={
        <div className="grid gap-5 lg:grid-cols-[auto_1fr]">
          <div>
            <div className="label mb-2">Mode</div>
            <Segmented value={mode} onChange={setMode} options={[{ value: "simple", label: "Simple" }, { value: "standard", label: "Standard" }, { value: "enhanced", label: "Enhanced" }]} />
            <p className="mt-2 max-w-sm text-xs text-muted">{MODE_HELP[mode]}</p>
            <div className="label mb-2 mt-4">Tone</div>
            <Segmented size="sm" value={tone} onChange={setTone} options={[{ value: "original", label: "Keep tone" }, { value: "conversational", label: "More conversational" }, { value: "formal", label: "More formal" }]} />
          </div>
          <div>
            <div className="label mb-2">Preserve</div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3">
              {PRESERVE.map(([k, label]) => (
                <Checkbox key={k} checked={opts[k] ?? true} onChange={(v) => setOpts({ ...opts, [k]: v })} label={label} />
              ))}
            </div>
            <Field label="Terms to keep exactly (comma-separated, optional)" className="mt-4">
              <Input value={terms} onChange={(e) => setTerms(e.target.value)} placeholder="e.g. photosynthesis, Treaty of Versailles" />
            </Field>
          </div>
        </div>
      }
    />
  );
}
