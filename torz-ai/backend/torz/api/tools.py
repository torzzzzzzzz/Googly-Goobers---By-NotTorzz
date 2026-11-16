"""AI tool routes. Every generating endpoint streams Server-Sent Events:
meta → (progress | delta | passages)* → done, or an error event."""
from __future__ import annotations

from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from ..offline.text import readability
from ..services import study, writing
from ..services.common import AppContext, get_ctx, resolve_source, sse

router = APIRouter(prefix="/api/tools")

Engine = Literal["ai", "offline"]


class TextIn(BaseModel):
    text: str = Field(min_length=1)


def _need_text(text: str) -> str:
    t = (text or "").strip()
    if not t:
        raise HTTPException(400, "Add some text first.")
    return t


# ------------------------------------------------------------------------------------------------ writing

class HumanizeIn(TextIn):
    mode: Literal["simple", "standard", "enhanced"] = "standard"
    preserve_meaning: bool = True
    preserve_vocabulary: bool = True
    preserve_citations: bool = True
    preserve_quotes: bool = True
    preserve_paragraphs: bool = True
    maintain_length: bool = True
    tone: Literal["original", "conversational", "formal"] = "original"
    keep_terms: list[str] = []


@router.post("/humanize")
async def humanize(body: HumanizeIn, ctx: AppContext = Depends(get_ctx)):
    opts = body.model_dump(exclude={"text", "mode"})
    return sse(writing.humanize(ctx, _need_text(body.text), body.mode, opts))


class ParaphraseIn(TextIn):
    mode: Literal["standard", "academic", "simple", "professional", "conversational", "concise"] = "standard"
    strength: int = Field(3, ge=1, le=5)
    keep_terms: list[str] = []


@router.post("/paraphrase")
async def paraphrase(body: ParaphraseIn, ctx: AppContext = Depends(get_ctx)):
    return sse(writing.paraphrase(ctx, _need_text(body.text), body.mode, body.strength, body.keep_terms))


class RewriteIn(TextIn):
    tone: str = Field("keep", max_length=40)
    length: Literal["shorter", "same", "longer"] = "same"
    audience: str = Field("", max_length=200)
    instructions: str = Field("", max_length=1000)


@router.post("/rewrite")
async def rewrite(body: RewriteIn, ctx: AppContext = Depends(get_ctx)):
    return sse(writing.rewrite(ctx, _need_text(body.text), body.tone, body.length, body.audience, body.instructions))


class SimplifyIn(TextIn):
    level: Literal["elementary", "middle", "high", "general"] = "general"


@router.post("/simplify")
async def simplify(body: SimplifyIn, ctx: AppContext = Depends(get_ctx)):
    return sse(writing.simplify(ctx, _need_text(body.text), body.level))


class EssayIn(TextIn):
    focus: list[str] = []
    level: Literal["light", "moderate", "strong"] = "moderate"


@router.post("/essay/feedback")
async def essay_feedback(body: EssayIn, ctx: AppContext = Depends(get_ctx)):
    async def gen():
        yield {"type": "progress", "stage": "Reading your essay", "current": 0, "total": 1}
        res = await writing.essay_feedback(ctx, _need_text(body.text), body.focus)
        yield {"type": "meta", "provider": res["provider"], "model": res["model"]}
        yield {"type": "done", **res}

    return sse(gen())


@router.post("/essay/improve")
async def essay_improve(body: EssayIn, ctx: AppContext = Depends(get_ctx)):
    return sse(writing.essay_improve(ctx, _need_text(body.text), body.focus, body.level))


class AssistantIn(TextIn):
    action: str = Field("improve", max_length=40)
    instruction: str = Field("", max_length=2000)
    context: str = ""
    explain: bool = False


@router.post("/assistant")
async def assistant(body: AssistantIn, ctx: AppContext = Depends(get_ctx)):
    return sse(writing.assistant(ctx, body.action, _need_text(body.text), body.instruction, body.context, body.explain))


class ComposeIn(BaseModel):
    topic: str = Field(min_length=3, max_length=2000)
    essay_type: str = Field("expository", max_length=40)
    words: int = Field(500, ge=100, le=5000)
    audience: str = Field("", max_length=200)
    points: str = Field("", max_length=3000)


@router.post("/assistant/compose")
async def compose(body: ComposeIn, ctx: AppContext = Depends(get_ctx)):
    return sse(writing.compose(ctx, body.topic, body.essay_type, body.words, body.audience, body.points))


@router.post("/assistant/explain-mistakes")
async def explain_mistakes(body: TextIn, ctx: AppContext = Depends(get_ctx)):
    return sse(writing.explain_mistakes(ctx, _need_text(body.text)))


class GrammarIn(TextIn):
    engine: Engine = "ai"
    explain: bool = True


@router.post("/grammar")
async def grammar(body: GrammarIn, ctx: AppContext = Depends(get_ctx)):
    return sse(writing.grammar(ctx, body.text, body.engine, body.explain))


@router.post("/readability")
def readability_stats(body: TextIn):
    return readability(body.text)


# ------------------------------------------------------------------------------------------------ study

class SourceIn(BaseModel):
    text: Optional[str] = None
    file_id: Optional[int] = None
    document_id: Optional[int] = None
    note_id: Optional[int] = None
    engine: Engine = "ai"
    title: str = Field("", max_length=300)


class SummarizeIn(SourceIn):
    format: Literal["short", "detailed", "bullets", "paragraph", "facts", "arguments", "vocabulary"] = "short"
    length: int = Field(0, ge=0, le=5000)


@router.post("/summarize")
async def summarize(body: SummarizeIn, ctx: AppContext = Depends(get_ctx)):
    src = resolve_source(ctx, body.text, body.file_id, body.document_id, body.note_id)
    return sse(study.summarize(ctx, src, body.format, body.length, body.engine))


class NotesIn(SourceIn):
    detail: Literal["brief", "standard", "detailed"] = "standard"


@router.post("/notes")
async def notes(body: NotesIn, ctx: AppContext = Depends(get_ctx)):
    src = resolve_source(ctx, body.text, body.file_id, body.document_id, body.note_id)
    return sse(study.smart_notes(ctx, src, body.detail, body.engine))


QTypes = Literal["multiple_choice", "true_false", "short_answer", "fill_blank", "definition", "written"]


class QuizIn(SourceIn):
    count: int = Field(10, ge=1, le=100)
    types: list[QTypes] = ["multiple_choice", "true_false", "fill_blank"]
    difficulty: Literal["easy", "medium", "hard", "mixed"] = "mixed"
    kind: Literal["quiz", "practice_test"] = "quiz"
    time_limit_min: int = Field(0, ge=0, le=600)


@router.post("/quiz")
async def quiz(body: QuizIn, ctx: AppContext = Depends(get_ctx)):
    src = resolve_source(ctx, body.text, body.file_id, body.document_id, body.note_id)
    return sse(study.create_quiz(ctx, src, body.kind, body.count, list(body.types), body.difficulty, body.engine,
                                 body.title, body.time_limit_min))


class FlashIn(SourceIn):
    count: int = Field(15, ge=1, le=200)
    style: Literal["qa", "term", "mixed"] = "mixed"


@router.post("/flashcards")
async def flashcards(body: FlashIn, ctx: AppContext = Depends(get_ctx)):
    src = resolve_source(ctx, body.text, body.file_id, body.document_id, body.note_id)
    return sse(study.create_deck(ctx, src, body.count, body.style, body.engine, body.title))


@router.post("/study-guide")
async def study_guide(body: SourceIn, ctx: AppContext = Depends(get_ctx)):
    src = resolve_source(ctx, body.text, body.file_id, body.document_id, body.note_id)
    return sse(study.create_study_guide(ctx, src, body.engine, body.title))


class QASource(BaseModel):
    type: Literal["file", "document", "note", "text"]
    id: Optional[int] = None
    text: Optional[str] = None
    label: str = ""


class QAIn(BaseModel):
    question: str = Field(min_length=2, max_length=2000)
    sources: list[QASource] = Field(min_length=1)
    history: list[tuple[str, str]] = []
    engine: Engine = "ai"


@router.post("/qa")
async def qa(body: QAIn, ctx: AppContext = Depends(get_ctx)):
    resolved = []
    for i, s in enumerate(body.sources):
        src = resolve_source(ctx, s.text if s.type == "text" else None,
                             s.id if s.type == "file" else None,
                             s.id if s.type == "document" else None,
                             s.id if s.type == "note" else None)
        resolved.append((s.label or src.title or f"Source {i + 1}", f"{s.type}:{s.id or i}", src.text))
    return sse(study.answer_question(ctx, body.question, resolved, body.history, body.engine))
