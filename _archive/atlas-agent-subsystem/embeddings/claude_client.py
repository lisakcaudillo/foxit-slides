"""In-house Claude API client — direct HTTP via urllib.request.

No third-party dependencies.  Reads ANTHROPIC_API_KEY from the environment.

Public entry point
------------------
align_documents(chunks_a, chunks_b, doc_name_a, doc_name_b) -> list[dict]
    Ask Claude to match and classify every section from Document A against
    Document B, and generate one-sentence impact summaries for changed pairs.
"""
from __future__ import annotations

import json
import os
import re
import urllib.error
import urllib.request
from typing import Optional

# ---------------------------------------------------------------------------
# API constants
# ---------------------------------------------------------------------------

_API_URL = "https://api.anthropic.com/v1/messages"
_MODEL = "claude-sonnet-4-6"
_ANTHROPIC_VERSION = "2023-06-01"
_DEFAULT_MAX_TOKENS = 8192
_REQUEST_TIMEOUT = 180  # seconds — long documents may take time

# Max characters of section text sent per chunk in the alignment prompt.
# 600 chars ≈ 120 words — enough for Claude to understand clause content
# without blowing the context budget on very long documents.
_CHUNK_TEXT_LIMIT = 600


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _get_api_key() -> str:
    key = os.environ.get("ANTHROPIC_API_KEY", "").strip()
    if not key:
        raise EnvironmentError(
            "ANTHROPIC_API_KEY environment variable is not set. "
            "Set it before running Atlas."
        )
    return key


def _call_claude(prompt: str, max_tokens: int = _DEFAULT_MAX_TOKENS) -> str:
    """POST a single-turn message to Claude and return the assistant text."""
    payload = json.dumps({
        "model": _MODEL,
        "max_tokens": max_tokens,
        "messages": [{"role": "user", "content": prompt}],
    }).encode("utf-8")

    req = urllib.request.Request(
        _API_URL,
        data=payload,
        headers={
            "Content-Type": "application/json",
            "x-api-key": _get_api_key(),
            "anthropic-version": _ANTHROPIC_VERSION,
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=_REQUEST_TIMEOUT) as resp:
            body = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        error_body = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(
            f"Anthropic API error {exc.code}: {error_body}"
        ) from exc

    return body["content"][0]["text"]


def _extract_json(text: str) -> dict:
    """Extract the first JSON object from *text*, handling markdown fences."""
    text = re.sub(r"```(?:json)?\s*", "", text).strip()
    text = re.sub(r"```\s*$", "", text).strip()

    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    brace_start = text.find("{")
    brace_end = text.rfind("}")
    if brace_start != -1 and brace_end > brace_start:
        try:
            return json.loads(text[brace_start: brace_end + 1])
        except json.JSONDecodeError:
            pass

    raise ValueError(
        f"Could not extract valid JSON from Claude response:\n{text[:400]}"
    )


def _format_chunks(chunks: list[dict], prefix: str) -> str:
    """Format chunk dicts for inclusion in the alignment prompt."""
    lines: list[str] = []
    for ch in chunks:
        cid = ch.get("chunk_id", "?")
        clause = ch.get("clause_number") or ch.get("heading_text") or "—"
        page = ch.get("page_number", "?")
        raw_text = ch.get("text") or ""
        text = raw_text[:_CHUNK_TEXT_LIMIT].strip()
        if len(raw_text) > _CHUNK_TEXT_LIMIT:
            text += "..."
        lines.append(f"[{prefix}-{cid}] {clause}  (p.{page})")
        lines.append(text)
        lines.append("")
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Public entry points
# ---------------------------------------------------------------------------


def verify_impact_summary(
    summary: str,
    text_a: Optional[str],
    text_b: Optional[str],
) -> bool:
    """Check whether an impact summary is supported by the source chunk text.

    Calls Claude with a tight fact-checking prompt. Returns True if the
    summary accurately reflects the source text, False if it overstates,
    invents facts, or misrepresents the content.

    Used for the SourceCheckup gate on high-risk change cards.
    """
    source_parts: list[str] = []
    if text_a:
        source_parts.append(f"Original clause:\n{text_a[:800]}")
    if text_b:
        source_parts.append(f"Revised clause:\n{text_b[:800]}")
    source_block = "\n\n".join(source_parts) or "(no source text)"

    prompt = f"""You are a legal document fact-checker. You verify whether a summary accurately represents the meaning of a clause, even when the summary uses different words or translates German terms into English.

{source_block}

Summary to verify:
"{summary}"

Your task: does the summary faithfully represent the substance of the clause changes shown above?

Rules:
- The source clauses may be in German, English, or both. The summary may use English equivalents for German terms — this is acceptable and should NOT cause a false failure.
- Verify meaning, not wording. A summary that paraphrases accurately is correct even if it shares no exact words with the source.
- Mark as false ONLY if the summary invents a claim not present in the source, states a value or date incorrectly, or materially misrepresents what changed.
- If the source text is formatted as a markdown table or contains mixed German/English, focus on the substantive content.

Return ONLY a valid JSON object — no explanation, no markdown:
{{"verified": true}} if the summary faithfully represents the clause, or {{"verified": false}} if it invents facts, states incorrect values, or materially misrepresents the change."""

    try:
        response_text = _call_claude(prompt, max_tokens=32)
        parsed = _extract_json(response_text)
        return bool(parsed.get("verified", False))
    except Exception:
        # On any failure (API error, parse error), default to unverified
        return False


def align_documents(
    chunks_a: list[dict],
    chunks_b: list[dict],
    doc_name_a: str = "Document A",
    doc_name_b: str = "Document B",
) -> list[dict]:
    """Ask Claude to align two document versions and classify each section.

    Parameters
    ----------
    chunks_a, chunks_b:
        Lists of chunk dicts as written by
        :func:`~comparison.ingestor.ingest_for_comparison`.
        Each dict must contain at minimum: ``chunk_id``, ``text``,
        ``clause_number``, ``heading_text``, ``page_number``.
    doc_name_a, doc_name_b:
        Display names used in the prompt and error messages.

    Returns
    -------
    list[dict]
        One dict per match with keys:
        ``id_a``, ``id_b``, ``classification``, ``impact_summary``.
        ``id_a`` is ``None`` for added sections; ``id_b`` is ``None`` for
        deleted sections.  ``impact_summary`` is a one-sentence string for
        ``changed`` pairs, else ``None``.
    """
    if not chunks_a or not chunks_b:
        return []

    ids_a = [ch["chunk_id"] for ch in chunks_a]
    ids_b = [ch["chunk_id"] for ch in chunks_b]

    prompt = f"""You are a legal document comparison expert. Compare two versions of a document section by section.

DOCUMENT A — "{doc_name_a}" ({len(chunks_a)} sections):
{_format_chunks(chunks_a, "A")}

DOCUMENT B — "{doc_name_b}" ({len(chunks_b)} sections):
{_format_chunks(chunks_b, "B")}

TASK: Match each section from Document A to the corresponding section in Document B.

Classification rules:
- "unchanged": Same section exists in both, no substantive content change. Ignore minor formatting, hyphenation, or line-break differences.
- "changed": Same section exists in both versions but the content has changed.
- "deleted": Section exists in Document A only (set id_b to null).
- "added": Section exists in Document B only (set id_a to null).
- "moved": Identical or near-identical content exists in both versions but at a notably different position in the document.

For each "changed" pair write a concise one-sentence impact_summary describing what changed and why it matters.
For all other classifications set impact_summary to null.

For every match set confidence to a float 0.0–1.0. Confidence measures how certain you are that BOTH the pairing is correct AND the classification is accurate. It must reflect classification risk, not just matching certainty — a pair can be obviously the same section but still deserve low confidence if the classification boundary is hard to judge.

Confidence scale:
- 0.95–1.0: Pairing unambiguous AND classification clearly correct. Reserve for:
    * "unchanged" where content is truly identical word-for-word
    * "added" or "deleted" with strong structural evidence (distinct clause number, entirely new section)
    * "changed" where the difference is substantial (new paragraphs, restructured clauses, significant rewrite)
- 0.75–0.94: Pairing likely correct but classification carries meaningful risk. Use for:
    * "changed" where the ONLY differences are numeric values, dates, percentages, amounts, or cross-reference numbers in otherwise identical surrounding text — these are the highest-risk misclassification cases because they look almost unchanged at a glance
    * "changed" where a schedule or annex reference number was renumbered (e.g. "Schedule 2" → "Schedule 3") — easy to miss as unchanged
    * "unchanged" where surrounding text is near-identical and a subtle difference may exist
    * Any pair where clause numbers do not align between versions
- 0.50–0.74: Plausible match but content boundaries are unclear or the classification is genuinely uncertain.
- Below 0.50: Last resort — very uncertain pairing or no good match exists.

CALIBRATION RULE: "changed" pairs where the only visible difference is a number, date, percentage, or cross-reference MUST have confidence ≤ 0.85. Returning 1.0 on these cases is a calibration error.

Constraints:
- Every section ID from A ({ids_a}) must appear exactly once across all matches.
- Every section ID from B ({ids_b}) must appear exactly once (either matched or listed as "added").
- Return ONLY a valid JSON object. No explanation, no markdown, no extra text.

Required format (note calibrated confidence values — numeric-only changes score lower):
{{
  "matches": [
    {{"id_a": 0, "id_b": 0, "classification": "unchanged", "confidence": 0.98, "impact_summary": null}},
    {{"id_a": 1, "id_b": 2, "classification": "changed", "confidence": 0.91, "impact_summary": "Payment terms extended from net-30 to net-60, increasing cash-flow risk for the service provider."}},
    {{"id_a": 4, "id_b": 4, "classification": "changed", "confidence": 0.76, "impact_summary": "Notice period shortened from 5 to 3 Business Days — numeric-only change in otherwise identical clause text."}},
    {{"id_a": 3, "id_b": null, "classification": "deleted", "confidence": 0.95, "impact_summary": null}},
    {{"id_a": null, "id_b": 5, "classification": "added", "confidence": 0.97, "impact_summary": null}}
  ]
}}"""

    # Alignment response grows with chunk count: 70 chunks × ~60 tokens/entry
    # plus JSON overhead.  Use 16k to give headroom for large documents.
    response_text = _call_claude(prompt, max_tokens=16384)
    parsed = _extract_json(response_text)

    matches = parsed.get("matches")
    if not isinstance(matches, list):
        raise ValueError(
            f"Claude response missing 'matches' array.\nResponse: {response_text[:400]}"
        )

    valid_classifications = {"unchanged", "changed", "deleted", "added", "moved"}

    # Track which IDs Claude covered so we can detect dropped chunks
    seen_a: set[int] = set()
    seen_b: set[int] = set()
    validated: list[dict] = []

    for m in matches:
        cls = m.get("classification", "")
        if cls not in valid_classifications:
            cls = "changed"
        id_a = m.get("id_a")
        id_b = m.get("id_b")
        confidence = float(m.get("confidence", 1.0))
        confidence = max(0.0, min(1.0, confidence))  # clamp to [0, 1]
        if id_a is not None:
            seen_a.add(id_a)
        if id_b is not None:
            seen_b.add(id_b)
        validated.append({
            "id_a": id_a,
            "id_b": id_b,
            "classification": cls,
            "confidence": confidence,
            "impact_summary": m.get("impact_summary") if cls == "changed" else None,
        })

    # Recover any chunks Claude silently dropped
    for missing_a in set(ids_a) - seen_a:
        validated.append({
            "id_a": missing_a, "id_b": None,
            "classification": "deleted", "confidence": 0.5, "impact_summary": None,
        })
    for missing_b in set(ids_b) - seen_b:
        validated.append({
            "id_a": None, "id_b": missing_b,
            "classification": "added", "confidence": 0.5, "impact_summary": None,
        })

    return validated
