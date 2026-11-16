import { RefreshCw } from "lucide-react";
import { usePersistentState } from "../../lib/hooks";
import { Field, Input, Segmented, Select } from "../../components/ui";
import { RewriteTool } from "../../components/tool/RewriteTool";

const TONES = ["keep", "formal", "casual", "friendly", "confident", "persuasive", "neutral", "enthusiastic", "empathetic", "academic"];

export default function Rewriter() {
  const [tone, setTone] = usePersistentState("rewriter:tone", "keep");
  const [length, setLength] = usePersistentState<"shorter" | "same" | "longer">("rewriter:length", "same");
  const [audience, setAudience] = usePersistentState("rewriter:audience", "");
  const [instructions, setInstructions] = usePersistentState("rewriter:instructions", "");
  return (
    <RewriteTool
      toolId="rewriter"
      endpoint="/api/tools/rewrite"
      actionLabel="Rewrite"
      actionIcon={<RefreshCw className="size-4" />}
      outputLabel="Rewritten"
      buildBody={(text) => ({ text, tone, length, audience, instructions })}
      onRestoreSettings={(s) => {
        if (s.tone) setTone(s.tone);
        if (s.length) setLength(s.length);
        setAudience(s.audience ?? "");
        setInstructions(s.instructions ?? "");
      }}
      options={
        <div className="grid gap-4 md:grid-cols-4">
          <Field label="Tone">
            <Select value={tone} onChange={(e) => setTone(e.target.value)}>
              {TONES.map((t) => <option key={t} value={t}>{t === "keep" ? "Keep current tone" : t[0].toUpperCase() + t.slice(1)}</option>)}
            </Select>
          </Field>
          <div>
            <div className="mb-1.5 text-[0.82rem] font-medium text-ink-2">Length</div>
            <Segmented value={length} onChange={setLength} options={[{ value: "shorter", label: "Shorter" }, { value: "same", label: "Same" }, { value: "longer", label: "Longer" }]} />
          </div>
          <Field label="Audience (optional)">
            <Input value={audience} onChange={(e) => setAudience(e.target.value)} placeholder="e.g. my professor, a 5th grader" />
          </Field>
          <Field label="Extra instructions (optional)">
            <Input value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder="e.g. use British spelling" />
          </Field>
        </div>
      }
    />
  );
}
