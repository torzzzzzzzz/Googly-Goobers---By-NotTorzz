import { lazy, Suspense, useEffect, useState, Component, type ReactNode } from "react";
import { Route, Routes, useLocation } from "react-router-dom";
import { Sidebar } from "./components/layout/Sidebar";
import { Topbar } from "./components/layout/Topbar";
import { Button, Spinner } from "./components/ui";
import { toolByPath } from "./lib/tools";

const Dashboard = lazy(() => import("./pages/Dashboard"));
const Humanizer = lazy(() => import("./pages/writing/Humanizer"));
const Assistant = lazy(() => import("./pages/writing/Assistant"));
const Grammar = lazy(() => import("./pages/writing/Grammar"));
const Paraphraser = lazy(() => import("./pages/writing/Paraphraser"));
const Rewriter = lazy(() => import("./pages/writing/Rewriter"));
const EssayImprover = lazy(() => import("./pages/writing/EssayImprover"));
const Simplifier = lazy(() => import("./pages/writing/Simplifier"));
const Summarizer = lazy(() => import("./pages/productivity/Summarizer"));
const Notes = lazy(() => import("./pages/productivity/Notes"));
const NoteEditor = lazy(() => import("./pages/productivity/NoteEditor"));
const AutoTyper = lazy(() => import("./pages/productivity/AutoTyper"));
const Documents = lazy(() => import("./pages/productivity/Documents"));
const DocumentEditor = lazy(() => import("./pages/productivity/DocumentEditor"));
const PdfReader = lazy(() => import("./pages/productivity/PdfReader"));
const QuizGenerator = lazy(() => import("./pages/study/QuizGenerator"));
const QuizPlayer = lazy(() => import("./pages/study/QuizPlayer"));
const Flashcards = lazy(() => import("./pages/study/Flashcards"));
const DeckStudy = lazy(() => import("./pages/study/DeckStudy"));
const StudyGuide = lazy(() => import("./pages/study/StudyGuide"));
const GuideView = lazy(() => import("./pages/study/GuideView"));
const PracticeTest = lazy(() => import("./pages/study/PracticeTest"));
const TestTaker = lazy(() => import("./pages/study/TestTaker"));
const AttemptReview = lazy(() => import("./pages/study/AttemptReview"));
const QA = lazy(() => import("./pages/study/QA"));
const History = lazy(() => import("./pages/History"));
const HistoryDetail = lazy(() => import("./pages/HistoryDetail"));
const Settings = lazy(() => import("./pages/Settings"));
const NotFound = lazy(() => import("./pages/NotFound"));

class ErrorBoundary extends Component<{ children: ReactNode; resetKey: string }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidUpdate(prev: { resetKey: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }
  render() {
    if (this.state.error)
      return (
        <div className="mx-auto max-w-lg p-10 text-center">
          <div className="text-lg font-semibold">This page hit an unexpected error</div>
          <p className="mt-2 text-sm text-muted">{this.state.error.message}</p>
          <Button className="mt-5" onClick={() => this.setState({ error: null })}>Try again</Button>
        </div>
      );
    return this.props.children;
  }
}

function PageFallback() {
  return (
    <div className="grid h-[60vh] place-items-center">
      <Spinner className="size-6" />
    </div>
  );
}

export function App() {
  const loc = useLocation();
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem("torz:sidebar") === "collapsed");
  useEffect(() => {
    localStorage.setItem("torz:sidebar", collapsed ? "collapsed" : "open");
  }, [collapsed]);
  useEffect(() => {
    const t = toolByPath(loc.pathname);
    document.title = t ? `${t.name} · TORZ AI` : loc.pathname.startsWith("/settings") ? "Settings · TORZ AI" : loc.pathname.startsWith("/history") ? "History · TORZ AI" : "TORZ AI";
  }, [loc.pathname]);

  return (
    <div className="flex min-h-screen">
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main className="flex-1">
          <ErrorBoundary resetKey={loc.pathname}>
            <Suspense fallback={<PageFallback />}>
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/humanizer" element={<Humanizer />} />
                <Route path="/assistant" element={<Assistant />} />
                <Route path="/grammar" element={<Grammar />} />
                <Route path="/paraphraser" element={<Paraphraser />} />
                <Route path="/rewriter" element={<Rewriter />} />
                <Route path="/essay" element={<EssayImprover />} />
                <Route path="/simplifier" element={<Simplifier />} />
                <Route path="/summarizer" element={<Summarizer />} />
                <Route path="/notes" element={<Notes />} />
                <Route path="/notes/:id" element={<NoteEditor />} />
                <Route path="/autotyper" element={<AutoTyper />} />
                <Route path="/documents" element={<Documents />} />
                <Route path="/documents/:id" element={<DocumentEditor />} />
                <Route path="/pdf" element={<PdfReader />} />
                <Route path="/pdf/:id" element={<PdfReader />} />
                <Route path="/files/:id" element={<PdfReader />} />
                <Route path="/quiz" element={<QuizGenerator />} />
                <Route path="/quiz/:id" element={<QuizPlayer />} />
                <Route path="/flashcards" element={<Flashcards />} />
                <Route path="/flashcards/:id" element={<DeckStudy />} />
                <Route path="/study-guide" element={<StudyGuide />} />
                <Route path="/study-guide/:id" element={<GuideView />} />
                <Route path="/practice-test" element={<PracticeTest />} />
                <Route path="/practice-test/:id" element={<TestTaker />} />
                <Route path="/attempts/:id" element={<AttemptReview />} />
                <Route path="/qa" element={<QA />} />
                <Route path="/history" element={<History />} />
                <Route path="/history/:id" element={<HistoryDetail />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="/settings/:section" element={<Settings />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}
