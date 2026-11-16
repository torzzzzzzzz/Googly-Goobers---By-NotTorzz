import { Repeat2 } from "lucide-react";
import { usePersistentState } from "../../lib/hooks";
import { useSettings } from "../../lib/settings";
import { Field, Input, Segmented, Slider } from "../../components/ui";
import { RewriteTool } from "../../components/tool/RewriteTool";

type Mode = "standard" | "academic" | "simple" | "professional" | "conversational" | "concise";

export default function Paraphraser() {
  const { settings } = useSettings();
  const [mode, setMode] = usePersistentState<Mode>("paraphraser:mode", "standard");
  const [strength, setStrength] = usePersistentState("paraphraser:strength", settings?.writing.rewrite_strength ?? 3);
  const [terms, setTerms] = usePersistentState("paraphraser:terms", "");
  return (
    <RewriteTool
      toolId="paraphraser"
      endpoint="/api/tools/paraphrase"
      actionLabel="Paraphrase"
      actionIcon={<Repeat2 className="size-4" />}
      outputLabel="Paraphrased"
      buildBody={(text) => ({ text, mode, strength, keep_terms: terms.split(",").map((t) => t.trim()).filter(Boolean) })}
      onRestoreSettings={(s) => {
        if (s.mode) setMode(s.mode);
        if (s.strength) setStrength(s.strength);
      }}
      disclaimer="Meaning, names, numbers and facts are kept. Check the preservation report after each run."
      options={
        <div className="grid gap-5 lg:grid-cols-[auto_1fr]">
          <div>
            <div className="label mb-2">Style</div>
            <Segmented
              value={mode}
              onChange={setMode}
              options={[
                { value: "standard", label: "Standard" },
                { value: "academic", label: "Academic" },
                { value: "simple", label: "Simple" },
                { value: "professional", label: "Professional" },
                { value: "conversational", label: "Conversational" },
                { value: "concise", label: "Concise" },
              ]}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <div className="label mb-3">How much to change: {["", "Light", "Mild", "Moderate", "Strong", "Complete"][strength]}</div>
              <Slider value={strength} onChange={setStrength} min={1} max={5} labels={["Light", "", "Moderate", "", "Complete"]} />
            </div>
            <Field label="Words to keep unchanged (optional)">
              <Input value={terms} onChange={(e) => setTerms(e.target.value)} placeholder="comma-separated" />
            </Field>
          </div>
        </div>
      }
    />
  );
}
