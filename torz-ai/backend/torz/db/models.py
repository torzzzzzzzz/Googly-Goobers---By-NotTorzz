"""SQLAlchemy ORM models for the local SQLite database."""
from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


def utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


class Base(DeclarativeBase):
    pass


class JsonMixin:
    @staticmethod
    def dumps(value: Any) -> str:
        return json.dumps(value, ensure_ascii=False)

    @staticmethod
    def loads(value: Optional[str], default: Any = None) -> Any:
        if not value:
            return default
        try:
            return json.loads(value)
        except (TypeError, ValueError):
            return default


class SchemaMigration(Base):
    __tablename__ = "schema_migrations"
    version: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    applied_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class Folder(Base):
    __tablename__ = "folders"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    parent_id: Mapped[Optional[int]] = mapped_column(ForeignKey("folders.id", ondelete="CASCADE"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)

    documents: Mapped[list["Document"]] = relationship(back_populates="folder")


class StoredFile(Base, JsonMixin):
    """An uploaded file plus the text extracted from it."""

    __tablename__ = "files"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    filename: Mapped[str] = mapped_column(String(400))
    ext: Mapped[str] = mapped_column(String(16))
    mime: Mapped[str] = mapped_column(String(120))
    size: Mapped[int] = mapped_column(Integer)
    sha256: Mapped[str] = mapped_column(String(64), index=True)
    stored_name: Mapped[str] = mapped_column(String(200))
    page_count: Mapped[int] = mapped_column(Integer, default=0)
    text: Mapped[str] = mapped_column(Text, default="")
    word_count: Mapped[int] = mapped_column(Integer, default=0)
    ocr_used: Mapped[bool] = mapped_column(Boolean, default=False)
    meta_json: Mapped[str] = mapped_column(Text, default="{}")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    last_opened_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)


class Document(Base):
    __tablename__ = "documents"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    title: Mapped[str] = mapped_column(String(300), default="Untitled document")
    content_html: Mapped[str] = mapped_column(Text, default="")
    content_text: Mapped[str] = mapped_column(Text, default="")
    word_count: Mapped[int] = mapped_column(Integer, default=0)
    folder_id: Mapped[Optional[int]] = mapped_column(ForeignKey("folders.id", ondelete="SET NULL"), nullable=True, index=True)
    source_file_id: Mapped[Optional[int]] = mapped_column(ForeignKey("files.id", ondelete="SET NULL"), nullable=True)
    pinned: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    last_opened_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    deleted_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True, index=True)

    folder: Mapped[Optional[Folder]] = relationship(back_populates="documents")
    versions: Mapped[list["DocumentVersion"]] = relationship(
        back_populates="document", cascade="all, delete-orphan", passive_deletes=True
    )


class DocumentVersion(Base):
    __tablename__ = "document_versions"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    document_id: Mapped[int] = mapped_column(ForeignKey("documents.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(300))
    content_html: Mapped[str] = mapped_column(Text)
    word_count: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    document: Mapped[Document] = relationship(back_populates="versions")


class HistoryEntry(Base, JsonMixin):
    """One run of any tool. Covers writing history and humanization history (tool = 'humanizer')."""

    __tablename__ = "history_entries"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    tool: Mapped[str] = mapped_column(String(60), index=True)
    title: Mapped[str] = mapped_column(String(300))
    input_text: Mapped[str] = mapped_column(Text, default="")
    output_text: Mapped[str] = mapped_column(Text, default="")
    output_json: Mapped[str] = mapped_column(Text, default="")
    settings_json: Mapped[str] = mapped_column(Text, default="{}")
    engine: Mapped[str] = mapped_column(String(20), default="ai")
    provider: Mapped[str] = mapped_column(String(60), default="")
    model: Mapped[str] = mapped_column(String(200), default="")
    duration_ms: Mapped[int] = mapped_column(Integer, default=0)
    words_in: Mapped[int] = mapped_column(Integer, default=0)
    words_out: Mapped[int] = mapped_column(Integer, default=0)
    source_file_id: Mapped[Optional[int]] = mapped_column(ForeignKey("files.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)


class Summary(Base):
    __tablename__ = "summaries"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    history_id: Mapped[Optional[int]] = mapped_column(ForeignKey("history_entries.id", ondelete="SET NULL"), nullable=True)
    source_file_id: Mapped[Optional[int]] = mapped_column(ForeignKey("files.id", ondelete="SET NULL"), nullable=True)
    title: Mapped[str] = mapped_column(String(300))
    format: Mapped[str] = mapped_column(String(40))
    length: Mapped[int] = mapped_column(Integer, default=0)
    content: Mapped[str] = mapped_column(Text)
    engine: Mapped[str] = mapped_column(String(20), default="ai")
    provider: Mapped[str] = mapped_column(String(60), default="")
    model: Mapped[str] = mapped_column(String(200), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class Note(Base, JsonMixin):
    __tablename__ = "notes"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    title: Mapped[str] = mapped_column(String(300))
    content_html: Mapped[str] = mapped_column(Text, default="")
    content_text: Mapped[str] = mapped_column(Text, default="")
    data_json: Mapped[str] = mapped_column(Text, default="{}")
    tags: Mapped[str] = mapped_column(String(500), default="")
    color: Mapped[str] = mapped_column(String(20), default="")
    pinned: Mapped[bool] = mapped_column(Boolean, default=False)
    source_file_id: Mapped[Optional[int]] = mapped_column(ForeignKey("files.id", ondelete="SET NULL"), nullable=True)
    history_id: Mapped[Optional[int]] = mapped_column(ForeignKey("history_entries.id", ondelete="SET NULL"), nullable=True)
    engine: Mapped[str] = mapped_column(String(20), default="ai")
    provider: Mapped[str] = mapped_column(String(60), default="")
    model: Mapped[str] = mapped_column(String(200), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class FlashcardDeck(Base):
    __tablename__ = "flashcard_decks"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    title: Mapped[str] = mapped_column(String(300))
    description: Mapped[str] = mapped_column(Text, default="")
    source_file_id: Mapped[Optional[int]] = mapped_column(ForeignKey("files.id", ondelete="SET NULL"), nullable=True)
    engine: Mapped[str] = mapped_column(String(20), default="ai")
    provider: Mapped[str] = mapped_column(String(60), default="")
    model: Mapped[str] = mapped_column(String(200), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    last_studied_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    cards: Mapped[list["Flashcard"]] = relationship(
        back_populates="deck", cascade="all, delete-orphan", passive_deletes=True, order_by="Flashcard.position"
    )


class Flashcard(Base):
    __tablename__ = "flashcards"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    deck_id: Mapped[int] = mapped_column(ForeignKey("flashcard_decks.id", ondelete="CASCADE"), index=True)
    position: Mapped[int] = mapped_column(Integer, default=0)
    front: Mapped[str] = mapped_column(Text)
    back: Mapped[str] = mapped_column(Text)
    explanation: Mapped[str] = mapped_column(Text, default="")
    topic: Mapped[str] = mapped_column(String(200), default="")
    status: Mapped[str] = mapped_column(String(20), default="new")  # new | known | difficult
    box: Mapped[int] = mapped_column(Integer, default=1)  # Leitner box 1-5
    reviews: Mapped[int] = mapped_column(Integer, default=0)
    correct: Mapped[int] = mapped_column(Integer, default=0)
    last_reviewed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    deck: Mapped[FlashcardDeck] = relationship(back_populates="cards")


class Quiz(Base, JsonMixin):
    """A generated quiz or practice test (kind = 'quiz' | 'practice_test')."""

    __tablename__ = "quizzes"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    kind: Mapped[str] = mapped_column(String(20), default="quiz", index=True)
    title: Mapped[str] = mapped_column(String(300))
    source_text: Mapped[str] = mapped_column(Text, default="")
    source_file_id: Mapped[Optional[int]] = mapped_column(ForeignKey("files.id", ondelete="SET NULL"), nullable=True)
    settings_json: Mapped[str] = mapped_column(Text, default="{}")
    engine: Mapped[str] = mapped_column(String(20), default="ai")
    provider: Mapped[str] = mapped_column(String(60), default="")
    model: Mapped[str] = mapped_column(String(200), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    questions: Mapped[list["QuizQuestion"]] = relationship(
        back_populates="quiz", cascade="all, delete-orphan", passive_deletes=True, order_by="QuizQuestion.position"
    )
    attempts: Mapped[list["QuizAttempt"]] = relationship(
        back_populates="quiz", cascade="all, delete-orphan", passive_deletes=True, order_by="QuizAttempt.started_at"
    )


class QuizQuestion(Base, JsonMixin):
    __tablename__ = "quiz_questions"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    quiz_id: Mapped[int] = mapped_column(ForeignKey("quizzes.id", ondelete="CASCADE"), index=True)
    position: Mapped[int] = mapped_column(Integer, default=0)
    type: Mapped[str] = mapped_column(String(30))  # multiple_choice | true_false | short_answer | fill_blank | definition | written
    difficulty: Mapped[str] = mapped_column(String(20), default="medium")
    prompt: Mapped[str] = mapped_column(Text)
    options_json: Mapped[str] = mapped_column(Text, default="[]")
    answer: Mapped[str] = mapped_column(Text)
    explanation: Mapped[str] = mapped_column(Text, default="")
    source_quote: Mapped[str] = mapped_column(Text, default="")
    points: Mapped[float] = mapped_column(Float, default=1.0)

    quiz: Mapped[Quiz] = relationship(back_populates="questions")


class QuizAttempt(Base, JsonMixin):
    __tablename__ = "quiz_attempts"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    quiz_id: Mapped[int] = mapped_column(ForeignKey("quizzes.id", ondelete="CASCADE"), index=True)
    answers_json: Mapped[str] = mapped_column(Text, default="{}")
    results_json: Mapped[str] = mapped_column(Text, default="[]")
    score: Mapped[float] = mapped_column(Float, default=0)
    max_score: Mapped[float] = mapped_column(Float, default=0)
    time_limit_s: Mapped[int] = mapped_column(Integer, default=0)
    duration_s: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String(20), default="completed")
    started_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    finished_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    quiz: Mapped[Quiz] = relationship(back_populates="attempts")


class StudyGuide(Base, JsonMixin):
    __tablename__ = "study_guides"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    title: Mapped[str] = mapped_column(String(300))
    data_json: Mapped[str] = mapped_column(Text, default="{}")
    source_file_id: Mapped[Optional[int]] = mapped_column(ForeignKey("files.id", ondelete="SET NULL"), nullable=True)
    engine: Mapped[str] = mapped_column(String(20), default="ai")
    provider: Mapped[str] = mapped_column(String(60), default="")
    model: Mapped[str] = mapped_column(String(200), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class Favorite(Base):
    __tablename__ = "favorites"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    tool_id: Mapped[str] = mapped_column(String(60), unique=True)
    position: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class Setting(Base):
    """Application preferences, stored as JSON values by key."""

    __tablename__ = "settings"
    key: Mapped[str] = mapped_column(String(100), primary_key=True)
    value_json: Mapped[str] = mapped_column(Text)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)


class ToolUsage(Base):
    __tablename__ = "tool_usage"
    tool_id: Mapped[str] = mapped_column(String(60), primary_key=True)
    count: Mapped[int] = mapped_column(Integer, default=0)
    last_used_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class Activity(Base):
    """Local activity log that powers the dashboard statistics."""

    __tablename__ = "activity"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    tool_id: Mapped[str] = mapped_column(String(60), index=True)
    kind: Mapped[str] = mapped_column(String(40), default="run")
    words_in: Mapped[int] = mapped_column(Integer, default=0)
    words_out: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)


class AutoTyperJob(Base, JsonMixin):
    __tablename__ = "autotyper_jobs"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    title: Mapped[str] = mapped_column(String(300))
    text: Mapped[str] = mapped_column(Text)
    settings_json: Mapped[str] = mapped_column(Text, default="{}")
    target: Mapped[str] = mapped_column(String(40), default="extension")  # extension | google_docs
    status: Mapped[str] = mapped_column(String(20), default="ready")
    progress: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
