"""Prompt templates and JSON schemas for every tool."""
from __future__ import annotations

import re
from typing import Any

from .base import ChatMessage

PLAIN_OUTPUT = (
    "Return only the resulting text. Do not add a title, preface, explanation, notes, or quotation marks "
    "around the output."
)

STYLE_GUIDE = (
    "Write like a careful human editor. Prefer plain, specific, concrete wording. Vary sentence length and "
    "openings. Avoid filler and stock phrases such as 'delve into', 'in today's fast-paced world', "
    "'it is important to note that', 'plays a crucial role', 'a testament to', 'navigating the landscape', "
    "'in conclusion' and 'furthermore' at the start of many sentences."
)


def _msgs(system: str, user: str) -> list[ChatMessage]:
    return [ChatMessage("system", system), ChatMessage("user", user)]


# ------------------------------------------------------------------------------------------------ humanizer

HUMANIZER_MODES = {
    "simple": (
        "Make light edits only. Correct awkward wording, grammar slips and clunky phrasing. Keep the original "
        "sentence structure, sentence order and most of the original wording. Preserve the author's voice."
    ),
    "standard": (
        "Improve flow and readability. Smooth transitions, replace stiff or generic phrasing with natural "
        "wording, reduce repeated words and vary sentence openings. Keep the meaning identical and keep the "
        "author's voice."
    ),
    "enhanced": (
        "Rewrite more substantially. Restructure sentences where it helps, strengthen transitions between ideas, "
        "vary sentence length and rhythm, remove repetition and filler, and make the writing clearer and more "
        "engaging. Keep every fact, claim and argument."
    ),
}


def humanizer_messages(text: str, mode: str, opts: dict[str, Any], language: str) -> list[ChatMessage]:
    rules = [HUMANIZER_MODES.get(mode, HUMANIZER_MODES["standard"]), STYLE_GUIDE]
    if opts.get("preserve_meaning", True):
        rules.append("Do not add, remove or change any facts, claims, numbers, names or dates.")
    vocab = [v.strip() for v in (opts.get("keep_terms") or []) if v.strip()]
    if opts.get("preserve_vocabulary", True):
        rules.append("Keep technical terms and subject-specific vocabulary unchanged.")
        if vocab:
            rules.append("These terms must appear unchanged: " + "; ".join(vocab[:40]) + ".")
    if opts.get("preserve_citations", True):
        rules.append("Keep every citation and reference marker exactly as written, e.g. (Smith, 2020), [3], ¹.")
    if opts.get("preserve_quotes", True):
        rules.append("Keep any text inside quotation marks exactly as written.")
    if opts.get("preserve_paragraphs", True):
        rules.append("Keep the same paragraphs in the same order, separated by blank lines.")
    if opts.get("maintain_length", True):
        rules.append("Keep the length within about 10% of the original.")
    tone = opts.get("tone", "original")
    if tone == "conversational":
        rules.append("Use a more conversational, relaxed tone; contractions are fine.")
    elif tone == "formal":
        rules.append("Use a more formal, polished tone; avoid slang and contractions.")
    else:
        rules.append("Keep the original tone and level of formality.")
    rules.append(language)
    system = (
        "You are TORZ AI's writing editor. You improve the quality and clarity of a user's writing so it reads "
        "naturally, while preserving their meaning and voice.\n\nRules:\n- " + "\n- ".join(rules) + "\n\n" + PLAIN_OUTPUT
    )
    return _msgs(system, f"Rewrite this text:\n\n{text}")


# ------------------------------------------------------------------------------------------------ paraphraser

PARAPHRASE_MODES = {
    "standard": "Reword it clearly and naturally for a general reader.",
    "academic": "Use an academic register: precise vocabulary, objective tone, formal sentence structure.",
    "simple": "Use simple, everyday words and short sentences that are easy to understand.",
    "professional": "Use a polished, professional business tone.",
    "conversational": "Use a friendly conversational tone, as if explaining to a friend.",
    "concise": "Make it as concise as possible: remove redundancy and wordiness without losing meaning.",
}
STRENGTH = {
    1: "Change only a few words and phrases; keep sentence structures.",
    2: "Reword some phrases and lightly adjust a few sentence structures.",
    3: "Reword most phrases and restructure some sentences.",
    4: "Reword almost everything and restructure most sentences.",
    5: "Fully rewrite every sentence with new structure and wording.",
}


def paraphrase_messages(text: str, mode: str, strength: int, keep_terms: list[str], language: str) -> list[ChatMessage]:
    rules = [
        PARAPHRASE_MODES.get(mode, PARAPHRASE_MODES["standard"]),
        STRENGTH.get(int(strength), STRENGTH[3]),
        "Preserve the original meaning and every factual detail (numbers, names, dates, claims).",
        "Keep the same paragraph breaks.",
        STYLE_GUIDE,
        language,
    ]
    if keep_terms:
        rules.append("Keep these words unchanged: " + "; ".join(keep_terms[:40]) + ".")
    system = "You paraphrase text.\n\nRules:\n- " + "\n- ".join(rules) + "\n\n" + PLAIN_OUTPUT
    return _msgs(system, f"Paraphrase this text:\n\n{text}")


# ------------------------------------------------------------------------------------------------ rewriter

def rewriter_messages(text: str, tone: str, length: str, audience: str, instructions: str, language: str) -> list[ChatMessage]:
    rules = []
    if tone and tone != "keep":
        rules.append(f"Rewrite it in a {tone} tone.")
    if length == "shorter":
        rules.append("Make it noticeably shorter (about 30-50% fewer words) while keeping the key points.")
    elif length == "longer":
        rules.append("Make it longer (about 30-60% more words) by developing the existing ideas, without inventing facts.")
    else:
        rules.append("Keep roughly the same length.")
    if audience:
        rules.append(f"Write for this audience: {audience}.")
    if instructions:
        rules.append(f"Follow these extra instructions from the user: {instructions}")
    rules += ["Keep all facts accurate; do not invent information.", STYLE_GUIDE, language]
    system = "You rewrite text to meet the user's goals.\n\nRules:\n- " + "\n- ".join(rules) + "\n\n" + PLAIN_OUTPUT
    return _msgs(system, f"Rewrite this text:\n\n{text}")


# ------------------------------------------------------------------------------------------------ simplifier

READING_LEVELS = {
    "elementary": "a 10-year-old reader (grade 4-5)",
    "middle": "a middle-school reader (grade 7-8)",
    "high": "a high-school reader (grade 10)",
    "general": "a general adult audience",
}


def simplifier_messages(text: str, level: str, language: str) -> list[ChatMessage]:
    system = (
        "You simplify text so it is easy to read.\n\nRules:\n"
        f"- Target {READING_LEVELS.get(level, READING_LEVELS['general'])}.\n"
        "- Split long sentences into shorter ones. One idea per sentence.\n"
        "- Replace jargon and rare words with common words; if a technical term must stay, explain it briefly.\n"
        "- Use active voice.\n"
        "- Keep every important fact and the original meaning. Do not add new information.\n"
        "- Keep paragraph breaks.\n"
        f"- {language}\n\n{PLAIN_OUTPUT}"
    )
    return _msgs(system, f"Simplify this text:\n\n{text}")


# ------------------------------------------------------------------------------------------------ grammar

def grammar_messages(text: str, language: str) -> list[ChatMessage]:
    system = (
        "You are a meticulous proofreader. Correct spelling, grammar, punctuation, capitalization, verb tense, "
        "subject-verb agreement, missing words and accidentally repeated words. Fix clearly awkward sentence "
        "structure only when it is genuinely wrong or confusing.\n"
        "Make the minimum changes needed. Do not rephrase sentences that are already correct. Do not change "
        "the meaning, style, tone or word choice beyond the corrections. Keep line breaks and paragraphs exactly.\n"
        f"{language}\n\nReturn only the corrected text."
    )
    return _msgs(system, f"Proofread and correct this text:\n\n{text}")


GRAMMAR_EXPLAIN_SCHEMA = {
    "type": "object",
    "properties": {
        "items": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "original": {"type": "string"},
                    "corrected": {"type": "string"},
                    "explanation": {"type": "string"},
                },
                "required": ["original", "corrected", "explanation"],
            },
        }
    },
    "required": ["items"],
}


def grammar_explain_messages(pairs: list[tuple[str, str]]) -> list[ChatMessage]:
    listing = "\n".join(f"{i+1}. \"{a}\" -> \"{b}\"" for i, (a, b) in enumerate(pairs))
    system = (
        "You explain proofreading corrections to a student in one short sentence each (max 25 words). "
        "Name the rule involved (e.g. subject-verb agreement, comma splice, spelling). Respond in JSON."
    )
    user = (
        "Explain each correction. Return {\"items\": [{\"original\", \"corrected\", \"explanation\"}]} in the same "
        f"order.\n\n{listing}"
    )
    return _msgs(system, user)


# ------------------------------------------------------------------------------------------------ writing assistant

ASSISTANT_ACTIONS: dict[str, str] = {
    "improve": "Improve the writing: clarity, flow, word choice and grammar. Keep the meaning and voice.",
    "improve_intro": "This is an introduction. Make it stronger: a clear hook, context, and a precise thesis or purpose statement.",
    "improve_conclusion": "This is a conclusion. Make it stronger: restate the main point in fresh words, synthesize the key ideas, and end with a meaningful final thought. Do not introduce new evidence.",
    "rewrite": "Rewrite this paragraph so it is clearer and better organized, keeping all of its ideas.",
    "expand": "Expand this text by developing its ideas with more explanation, reasoning and detail. Do not invent statistics, quotes or sources.",
    "shorten": "Shorten this text substantially while keeping its essential meaning.",
    "vocabulary": "Improve the vocabulary: replace vague, repetitive or weak words with more precise and varied ones. Keep it natural, not pretentious.",
    "grammar": "Correct all grammar, spelling and punctuation errors with minimal changes.",
    "transitions": "Improve the transitions between sentences and paragraphs so the ideas connect logically.",
    "awkward": "Fix awkward, wordy or confusing sentences so they read smoothly.",
    "tone_formal": "Adjust the tone to be more formal and academic.",
    "tone_casual": "Adjust the tone to be more casual and conversational.",
    "tone_confident": "Adjust the tone to be more confident and assertive.",
    "tone_friendly": "Adjust the tone to be warmer and friendlier.",
    "continue": "Continue writing from where the text ends, matching its style, for about one more paragraph. Return only the new continuation.",
}


def assistant_messages(action: str, text: str, instruction: str, context: str, language: str) -> list[ChatMessage]:
    task = ASSISTANT_ACTIONS.get(action, "")
    if action == "custom" or not task:
        task = instruction or "Improve this text."
    elif instruction:
        task += f" Additional instruction: {instruction}"
    system = f"You are TORZ AI's writing assistant inside a document editor.\nTask: {task}\n{STYLE_GUIDE}\n{language}\n\n{PLAIN_OUTPUT}"
    user = f"Text:\n\n{text}"
    if context and context.strip() and context.strip() != text.strip():
        user = f"Surrounding document (for context only, do not rewrite it):\n{context[:3000]}\n\n---\n\n{user}"
    return _msgs(system, user)


def essay_writer_messages(topic: str, essay_type: str, words: int, audience: str, points: str, language: str) -> list[ChatMessage]:
    system = (
        "You write well-structured essays. Use a clear introduction with a thesis, body paragraphs that each "
        "develop one main idea with reasoning and examples, smooth transitions, and a conclusion. Do not invent "
        "precise statistics, quotations or citations; if evidence is needed, describe it generally. "
        f"{STYLE_GUIDE}\n{language}\n\nReturn only the essay text with a title on the first line."
    )
    user = f"Write a {essay_type or 'expository'} essay of about {words} words on: {topic}"
    if audience:
        user += f"\nAudience: {audience}"
    if points:
        user += f"\nPoints to include: {points}"
    return _msgs(system, user)


def explain_changes_messages(original: str, revised: str) -> list[ChatMessage]:
    system = (
        "You are a writing tutor. Compare the original and revised text and explain the most important changes "
        "and why they improve the writing. Use a short bullet list (max 8 bullets), each starting with the kind "
        "of change in bold, e.g. **Clarity:**. Be specific and quote short fragments."
    )
    return _msgs(system, f"Original:\n{original}\n\nRevised:\n{revised}")


def explain_mistakes_messages(text: str) -> list[ChatMessage]:
    system = (
        "You are a writing tutor. Identify the writing mistakes and weaknesses in the text (grammar, punctuation, "
        "word choice, clarity, structure). For each, quote the fragment, explain what is wrong and how to fix it. "
        "Use a concise bullet list in Markdown. If the text is already strong, say so and give 1-3 refinements."
    )
    return _msgs(system, f"Text:\n\n{text}")


# ------------------------------------------------------------------------------------------------ essay improver

ESSAY_FEEDBACK_SCHEMA = {
    "type": "object",
    "properties": {
        "overall": {"type": "string"},
        "scores": {
            "type": "object",
            "properties": {k: {"type": "integer"} for k in ("thesis", "structure", "evidence", "clarity", "grammar", "style")},
            "required": ["thesis", "structure", "evidence", "clarity", "grammar", "style"],
        },
        "strengths": {"type": "array", "items": {"type": "string"}},
        "improvements": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["overall", "scores", "strengths", "improvements"],
}


def essay_feedback_messages(text: str, focus: list[str]) -> list[ChatMessage]:
    system = (
        "You are an experienced writing instructor grading an essay. Be honest, specific and constructive. "
        "Score each area from 1 (weak) to 10 (excellent). Respond with JSON only: "
        '{"overall": "2-3 sentence assessment", "scores": {"thesis", "structure", "evidence", "clarity", '
        '"grammar", "style"}, "strengths": ["..."], "improvements": ["specific actionable suggestion"]}'
    )
    focus_txt = f"\nPay particular attention to: {', '.join(focus)}." if focus else ""
    return _msgs(system, f"Essay:{focus_txt}\n\n{text}")


def essay_improve_messages(text: str, focus: list[str], level: str, language: str) -> list[ChatMessage]:
    areas = ", ".join(focus) if focus else "thesis clarity, structure, transitions, evidence use, clarity and grammar"
    depth = {
        "light": "Make conservative improvements; keep most sentences.",
        "moderate": "Improve noticeably while keeping the essay's structure and all of its arguments.",
        "strong": "Revise thoroughly: reorganize paragraphs if needed and rewrite weak sentences, keeping the author's arguments.",
    }.get(level, "Improve noticeably while keeping the essay's structure and all of its arguments.")
    system = (
        f"You revise student essays. Improve: {areas}. {depth} Do not invent statistics, quotations or sources. "
        f"Keep citations exactly. {STYLE_GUIDE}\n{language}\n\n{PLAIN_OUTPUT}"
    )
    return _msgs(system, f"Revise this essay:\n\n{text}")


# ------------------------------------------------------------------------------------------------ summarizer

SUMMARY_FORMATS = {
    "short": "Write a short summary in 2-4 sentences capturing the main point.",
    "detailed": "Write a detailed summary covering every main section and important supporting detail, in well-organized paragraphs.",
    "bullets": "Write a bullet-point summary. Each bullet is one key point. Use '- ' bullets.",
    "paragraph": "Write the summary as a single cohesive paragraph.",
    "facts": "List the most important facts (numbers, dates, names, findings, definitions) as '- ' bullets.",
    "arguments": "Identify the main arguments or claims and the reasoning or evidence given for each. Use '- ' bullets with the claim in bold followed by its support.",
    "vocabulary": "List the key vocabulary and terms used, each as '- **Term**: definition as used in the text'.",
}


def summary_messages(text: str, fmt: str, target_words: int, language: str, partial: bool = False) -> list[ChatMessage]:
    instr = SUMMARY_FORMATS.get(fmt, SUMMARY_FORMATS["short"])
    length = f" Aim for about {target_words} words." if target_words else ""
    system = (
        "You summarize documents accurately. Use only information stated in the text; never add facts, "
        f"opinions or outside knowledge. {instr}{length}\n{language}\n"
        "Use Markdown formatting where helpful. Return only the summary."
    )
    label = "Section of a longer document" if partial else "Text"
    return _msgs(system, f"{label}:\n\n{text}")


def summary_combine_messages(partials: list[str], fmt: str, target_words: int, language: str) -> list[ChatMessage]:
    instr = SUMMARY_FORMATS.get(fmt, SUMMARY_FORMATS["short"])
    length = f" Aim for about {target_words} words." if target_words else ""
    system = (
        "You combine partial summaries of consecutive sections of one document into one final summary. "
        "Use only the information given; remove duplication; keep the document's order. "
        f"{instr}{length}\n{language}\nUse Markdown where helpful. Return only the final summary."
    )
    joined = "\n\n".join(f"Section {i+1} summary:\n{p}" for i, p in enumerate(partials))
    return _msgs(system, joined)


# ------------------------------------------------------------------------------------------------ smart notes

NOTES_SCHEMA = {
    "type": "object",
    "properties": {
        "title": {"type": "string"},
        "main_topic": {"type": "string"},
        "overview": {"type": "string"},
        "key_concepts": {"type": "array", "items": {"type": "object", "properties": {"name": {"type": "string"}, "explanation": {"type": "string"}}, "required": ["name", "explanation"]}},
        "definitions": {"type": "array", "items": {"type": "object", "properties": {"term": {"type": "string"}, "definition": {"type": "string"}}, "required": ["term", "definition"]}},
        "key_information": {"type": "array", "items": {"type": "string"}},
        "dates": {"type": "array", "items": {"type": "object", "properties": {"date": {"type": "string"}, "event": {"type": "string"}}, "required": ["date", "event"]}},
        "people": {"type": "array", "items": {"type": "object", "properties": {"name": {"type": "string"}, "significance": {"type": "string"}}, "required": ["name", "significance"]}},
        "examples": {"type": "array", "items": {"type": "string"}},
        "arguments": {"type": "array", "items": {"type": "string"}},
        "remember": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["title", "main_topic", "overview", "key_concepts", "definitions", "key_information", "dates", "people", "examples", "arguments", "remember"],
}


def notes_messages(text: str, detail: str, language: str) -> list[ChatMessage]:
    depth = {"brief": "Be brief: only the essentials.", "detailed": "Be thorough: capture every important point."}.get(detail, "Be reasonably complete but concise.")
    system = (
        "You turn study material into organized study notes. Use ONLY information found in the text. Leave a "
        "list empty if the text has nothing for it (for example no dates or no people). Do not invent anything. "
        f"{depth} {language}\nRespond with JSON only, using exactly these keys: title, main_topic, overview, "
        "key_concepts [{name, explanation}], definitions [{term, definition}], key_information [string], "
        "dates [{date, event}], people [{name, significance}], examples [string], arguments [string], remember [string]."
    )
    return _msgs(system, f"Text:\n\n{text}")


# ------------------------------------------------------------------------------------------------ quiz / test

QUESTION_TYPES = {
    "multiple_choice": "multiple_choice (exactly 4 options, one correct; 'answer' is the full text of the correct option)",
    "true_false": "true_false ('answer' is 'True' or 'False'; options ['True','False'])",
    "short_answer": "short_answer (answerable in one sentence; 'answer' is a model answer)",
    "fill_blank": "fill_blank (the question is a sentence from the material with one key word or phrase replaced by '_____'; 'answer' is the missing word or phrase)",
    "definition": "definition (ask what a key term means; 'answer' is the definition)",
    "written": "written (an open question needing a paragraph answer; 'answer' is a model answer listing the key points)",
}

QUIZ_SCHEMA = {
    "type": "object",
    "properties": {
        "questions": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "type": {"type": "string", "enum": list(QUESTION_TYPES.keys())},
                    "difficulty": {"type": "string", "enum": ["easy", "medium", "hard"]},
                    "question": {"type": "string"},
                    "options": {"type": "array", "items": {"type": "string"}},
                    "answer": {"type": "string"},
                    "explanation": {"type": "string"},
                    "source_quote": {"type": "string"},
                },
                "required": ["type", "difficulty", "question", "options", "answer", "explanation", "source_quote"],
            },
        }
    },
    "required": ["questions"],
}

DIFFICULTY_TXT = {
    "easy": "easy (recall of facts stated directly)",
    "medium": "medium (understanding and connecting ideas)",
    "hard": "hard (application, inference and comparison, still answerable from the material)",
    "mixed": "a mix of easy, medium and hard",
}


def quiz_messages(text: str, plan: dict[str, int], difficulty: str, avoid: list[str], language: str) -> list[ChatMessage]:
    wanted = "\n".join(f"- {n} × {QUESTION_TYPES[t]}" for t, n in plan.items() if n > 0)
    total = sum(plan.values())
    avoid_txt = ""
    if avoid:
        avoid_txt = "\nDo not repeat these existing questions:\n" + "\n".join(f"- {q}" for q in avoid[:30])
    system = (
        "You write exam questions strictly from the provided study material. Every question and answer must be "
        "fully supported by the material; never use outside knowledge. For each question copy a short exact "
        "sentence or phrase from the material that supports the answer into 'source_quote'. Each 'explanation' "
        "says why the answer is correct, in one or two sentences. Questions must be clear and unambiguous. "
        f"Difficulty: {DIFFICULTY_TXT.get(difficulty, DIFFICULTY_TXT['mixed'])}. {language}\n"
        "Respond with JSON only: {\"questions\": [{\"type\", \"difficulty\", \"question\", \"options\", \"answer\", "
        "\"explanation\", \"source_quote\"}]}. Use an empty options list for types without options."
    )
    user = f"Write exactly {total} questions:\n{wanted}{avoid_txt}\n\nStudy material:\n\n{text}"
    return _msgs(system, user)


GRADE_SCHEMA = {
    "type": "object",
    "properties": {
        "score": {"type": "number"},
        "verdict": {"type": "string", "enum": ["correct", "partially_correct", "incorrect"]},
        "feedback": {"type": "string"},
    },
    "required": ["score", "verdict", "feedback"],
}


def grade_messages(question: str, model_answer: str, student_answer: str, source: str) -> list[ChatMessage]:
    system = (
        "You grade a student's written answer against the model answer and source material. Be fair: accept "
        "different wording that shows the same understanding. Score from 0.0 to 1.0. Give 1-3 sentences of "
        "specific feedback addressed to the student. Respond with JSON only: "
        '{"score": number, "verdict": "correct"|"partially_correct"|"incorrect", "feedback": "..."}'
    )
    user = (
        f"Question: {question}\nModel answer: {model_answer}\nStudent answer: {student_answer or '(blank)'}\n\n"
        f"Relevant source material:\n{source[:2500]}"
    )
    return _msgs(system, user)


# ------------------------------------------------------------------------------------------------ flashcards

FLASHCARD_SCHEMA = {
    "type": "object",
    "properties": {
        "cards": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "front": {"type": "string"},
                    "back": {"type": "string"},
                    "explanation": {"type": "string"},
                    "topic": {"type": "string"},
                    "source_quote": {"type": "string"},
                },
                "required": ["front", "back", "explanation", "topic", "source_quote"],
            },
        }
    },
    "required": ["cards"],
}


def flashcard_messages(text: str, count: int, style: str, avoid: list[str], language: str) -> list[ChatMessage]:
    style_txt = {
        "qa": "question on the front, concise answer on the back",
        "term": "key term on the front, its definition on the back",
        "mixed": "a mix of term/definition cards and question/answer cards",
    }.get(style, "a mix of term/definition cards and question/answer cards")
    avoid_txt = ("\nDo not duplicate these existing cards:\n" + "\n".join(f"- {a}" for a in avoid[:30])) if avoid else ""
    system = (
        "You create study flashcards strictly from the provided material; never use outside knowledge. "
        f"Card style: {style_txt}. Backs are short (one or two sentences). 'explanation' adds helpful context "
        "from the material (optional, may be empty). 'topic' is a 1-3 word category. 'source_quote' is a short "
        f"exact phrase from the material supporting the card. {language}\n"
        'Respond with JSON only: {"cards": [{"front", "back", "explanation", "topic", "source_quote"}]}'
    )
    return _msgs(system, f"Create exactly {count} flashcards.{avoid_txt}\n\nMaterial:\n\n{text}")


# ------------------------------------------------------------------------------------------------ study guide

STUDY_GUIDE_SCHEMA = {
    "type": "object",
    "properties": {
        "title": {"type": "string"},
        "overview": {"type": "string"},
        "topics": {"type": "array", "items": {"type": "object", "properties": {"name": {"type": "string"}, "summary": {"type": "string"}, "key_points": {"type": "array", "items": {"type": "string"}}}, "required": ["name", "summary", "key_points"]}},
        "vocabulary": {"type": "array", "items": {"type": "object", "properties": {"term": {"type": "string"}, "definition": {"type": "string"}}, "required": ["term", "definition"]}},
        "key_concepts": {"type": "array", "items": {"type": "object", "properties": {"concept": {"type": "string"}, "explanation": {"type": "string"}}, "required": ["concept", "explanation"]}},
        "examples": {"type": "array", "items": {"type": "string"}},
        "facts": {"type": "array", "items": {"type": "string"}},
        "common_mistakes": {"type": "array", "items": {"type": "string"}},
        "review_questions": {"type": "array", "items": {"type": "object", "properties": {"question": {"type": "string"}, "answer": {"type": "string"}}, "required": ["question", "answer"]}},
    },
    "required": ["title", "overview", "topics", "vocabulary", "key_concepts", "examples", "facts", "common_mistakes", "review_questions"],
}


def study_guide_messages(text: str, language: str) -> list[ChatMessage]:
    system = (
        "You build a study guide from the provided course material. Use only the material's information. "
        "'common_mistakes' lists misconceptions or easy-to-confuse points a student should watch for, based on "
        "the material. 'review_questions' are questions with short answers from the material. Leave a list "
        f"empty if the material has nothing for it. {language}\nRespond with JSON only with keys: title, overview, "
        "topics [{name, summary, key_points}], vocabulary [{term, definition}], key_concepts [{concept, "
        "explanation}], examples, facts, common_mistakes, review_questions [{question, answer}]."
    )
    return _msgs(system, f"Course material:\n\n{text}")


# ------------------------------------------------------------------------------------------------ Q&A

def qa_messages(question: str, passages: list[tuple[int, str]], history: list[tuple[str, str]], language: str) -> list[ChatMessage]:
    ctx = "\n\n".join(f"[{n}] {p}" for n, p in passages)
    system = (
        "You answer questions using ONLY the numbered passages from the user's documents. Cite passages inline "
        "like [1] or [2][3] after the sentences they support. If the passages do not contain the answer, say "
        "clearly that the documents do not say, and mention what related information they do contain. Never "
        f"use outside knowledge. Be concise and direct; use Markdown lists when helpful. {language}"
    )
    msgs = [ChatMessage("system", system)]
    for q, a in history[-4:]:
        msgs.append(ChatMessage("user", q))
        msgs.append(ChatMessage("assistant", a))
    msgs.append(ChatMessage("user", f"Passages:\n\n{ctx}\n\nQuestion: {question}"))
    return msgs


# ------------------------------------------------------------------------------------------------ output cleanup

_PREFACE = re.compile(
    r"^\s*(?:sure[,!.]?\s*|certainly[,!.]?\s*|of course[,!.]?\s*|okay[,!.]?\s*)?"
    r"(?:here(?:'s| is| are)[^\n]{0,120}?:|(?:rewritten|revised|paraphrased|simplified|corrected|improved|updated)"
    r"(?: text| version| essay| paragraph)?\s*:)\s*\n+",
    re.I,
)
_TRAILER = re.compile(r"\n+\s*(?:note|notes|changes made|explanation)s?\s*:.*$", re.I | re.S)


def clean_output(text: str, original: str = "") -> str:
    """Remove chatty prefaces/trailers that small models sometimes add."""
    out = re.sub(r"<think>.*?</think>", "", text, flags=re.S).strip()
    out = _PREFACE.sub("", out, count=1).strip()
    if original and not re.search(r"(?i)\b(note|explanation)s?\s*:", original):
        out = _TRAILER.sub("", out).strip()
    if len(out) > 2 and out[0] == out[-1] == '"' and original and not original.strip().startswith('"'):
        out = out[1:-1].strip()
    if out.startswith("```") and out.endswith("```"):
        out = out.strip("`").strip()
        if out.lower().startswith(("text\n", "markdown\n")):
            out = out.split("\n", 1)[1]
    return out
