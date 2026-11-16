// Shared "generate from material" settings for quizzes and practice tests.
import { Checkbox, Field, Input, Segmented } from "../ui";

export const QTYPE_LABEL: Record<string, string> = {
  multiple_choice: "Multiple choice",
  true_false: "True / false",
  short_answer: "Short answer",
  fill_blank: "Fill in the blank",
  definition: "Definition",
  written: "Written response",
};

export type Difficulty = "easy" | "medium" | "hard" | "mixed";

export function QuestionSettings({
  count,
  setCount,
  types,
  setTypes,
  difficulty,
  setDifficulty,
  available,
  title,
  setTitle,
}: {
  count: number;
  setCount: (n: number) => void;
  types: string[];
  setTypes: (t: string[]) => void;
  difficulty: Difficulty;
  setDifficulty: (d: Difficulty) => void;
  available: string[];
  title: string;
  setTitle: (t: string) => void;
}) {
  return (
    <div className="space-y-4">
      <Field label="Title (optional)">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Uses the material's title if empty" />
      </Field>
      <div>
        <div className="label mb-2">Number of questions</div>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented size="sm" value={String([5, 10, 15, 20, 30].includes(count) ? count : "custom")} onChange={(v) => v !== "custom" && setCount(Number(v))}
            options={[{ value: "5", label: "5" }, { value: "10", label: "10" }, { value: "15", label: "15" }, { value: "20", label: "20" }, { value: "30", label: "30" }, { value: "custom", label: "Custom" }]} />
          <Input type="number" min={1} max={100} value={count} onChange={(e) => setCount(Math.max(1, Math.min(100, Number(e.target.value) || 1)))} className="w-20" aria-label="Number of questions" />
        </div>
      </div>
      <div>
        <div className="label mb-2">Question types</div>
        <div className="grid grid-cols-2 gap-2">
          {available.map((t) => (
            <Checkbox key={t} checked={types.includes(t)} onChange={(v) => setTypes(v ? [...types, t] : types.filter((x) => x !== t))} label={QTYPE_LABEL[t]} />
          ))}
        </div>
        {types.length === 0 && <p className="mt-1.5 text-xs text-bad">Choose at least one question type.</p>}
      </div>
      <div>
        <div className="label mb-2">Difficulty</div>
        <Segmented size="sm" value={difficulty} onChange={setDifficulty} options={[{ value: "easy", label: "Easy" }, { value: "medium", label: "Medium" }, { value: "hard", label: "Hard" }, { value: "mixed", label: "Mixed" }]} />
      </div>
    </div>
  );
}
