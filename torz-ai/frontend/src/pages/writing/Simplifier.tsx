import { ListMinus } from "lucide-react";
import { usePersistentState } from "../../lib/hooks";
import { Segmented } from "../../components/ui";
import { RewriteTool } from "../../components/tool/RewriteTool";

type Level = "elementary" | "middle" | "high" | "general";

export default function Simplifier() {
  const [level, setLevel] = usePersistentState<Level>("simplifier:level", "general");
  return (
    <RewriteTool
      toolId="simplifier"
      endpoint="/api/tools/simplify"
      actionLabel="Simplify"
      actionIcon={<ListMinus className="size-4" />}
      outputLabel="Simplified"
      showReadability
      buildBody={(text) => ({ text, level })}
      onRestoreSettings={(s) => s.level && setLevel(s.level)}
      disclaimer="Readability scores are calculated locally (Flesch reading ease and grade level)."
      options={
        <div className="flex flex-wrap items-center gap-4">
          <span className="label">Reading level</span>
          <Segmented
            value={level}
            onChange={setLevel}
            options={[
              { value: "elementary", label: "Elementary" },
              { value: "middle", label: "Middle school" },
              { value: "high", label: "High school" },
              { value: "general", label: "General adult" },
            ]}
          />
        </div>
      }
    />
  );
}
