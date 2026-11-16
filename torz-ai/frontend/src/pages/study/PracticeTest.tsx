import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { BrainCircuit } from "lucide-react";
import { get } from "../../lib/api";
import { formatDateTime, formatDuration } from "../../lib/format";
import { useToolVisit } from "../../lib/hooks";
import { Badge, Card, EmptyState, Tabs } from "../../components/ui";
import { Page, ToolHeader } from "../../components/tool/ToolKit";
import { CreateQuiz, QuizLibrary } from "./QuizGenerator";

export default function PracticeTest() {
  useToolVisit("practice_test");
  const [tab, setTab] = useState<"create" | "tests" | "history">("create");
  const tests = useQuery<{ quizzes: any[] }>({ queryKey: ["quizzes", "practice_test"], queryFn: () => get("/api/quizzes", { kind: "practice_test" }) });
  const attempts = useQuery<{ attempts: any[] }>({ queryKey: ["attempts", "practice_test"], queryFn: () => get("/api/attempts", { kind: "practice_test" }), enabled: tab === "history" });
  return (
    <Page wide>
      <ToolHeader toolId="practice_test" />
      <div className="mb-5">
        <Tabs value={tab} onChange={setTab} tabs={[{ value: "create", label: "Create test" }, { value: "tests", label: "My tests", count: tests.data?.quizzes.length }, { value: "history", label: "Test history" }]} />
      </div>
      {tab === "create" && <CreateQuiz kind="practice_test" />}
      {tab === "tests" && <QuizLibrary kind="practice_test" basePath="/practice-test" />}
      {tab === "history" && (
        attempts.data?.attempts.length === 0 ? (
          <Card><EmptyState icon={<BrainCircuit />} title="No completed tests yet" description="Your scores will be listed here after you submit a test." /></Card>
        ) : (
          <Card className="overflow-hidden">
            <table className="w-full text-sm">
              <thead className="border-b border-line bg-surface-2 text-left text-xs text-muted">
                <tr><th className="px-4 py-2.5 font-medium">Test</th><th className="px-4 py-2.5 font-medium">Score</th><th className="px-4 py-2.5 font-medium">Time</th><th className="px-4 py-2.5 font-medium">Completed</th></tr>
              </thead>
              <tbody>
                {attempts.data?.attempts.map((a) => (
                  <tr key={a.id} className="border-b border-line last:border-0 hover:bg-surface-2">
                    <td className="px-4 py-3"><Link to={`/attempts/${a.id}`} className="font-medium text-ink hover:text-accent">{a.quiz_title}</Link></td>
                    <td className="px-4 py-3"><Badge tone={a.percent >= 80 ? "good" : a.percent >= 50 ? "warn" : "bad"}>{a.percent}%</Badge> <span className="ml-1 text-xs text-muted">{a.score}/{a.max_score}</span></td>
                    <td className="px-4 py-3 text-muted">{formatDuration(a.duration_s)}{a.time_limit_s ? ` / ${formatDuration(a.time_limit_s)}` : ""}</td>
                    <td className="px-4 py-3 text-muted">{formatDateTime(a.finished_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )
      )}
    </Page>
  );
}
