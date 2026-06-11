from __future__ import annotations

import json
from typing import Any

import requests


class LlamaClient:
    """Minimal wrapper around Ollama's Llama3 completion endpoint."""

    def __init__(self, model: str = "llama3:8b", base_url: str = "http://localhost:11434/api/generate") -> None:
        self.model = model
        self.url = base_url

    def classify_intent(self, query: str) -> str:
        prompt = (
            "You are an intent classifier that reads a user request about contracts. \n"
            "Return exactly one token: risk_review or semantic_search. \n"
            f"User: {query}\n"
            "Intent:" 
        )
        text = self._generate(prompt)
        intent = text.strip().lower()
        if "risk" in intent:
            return "risk_review"
        if "semantic" in intent:
            return "semantic_search"
        return "risk_review"

    def summarize(self, query: str, intent: str, tool_outputs: Any) -> str:
        serialized_tools = json.dumps(tool_outputs, ensure_ascii=False, indent=2)
        prompt = (
            "You are an assistant that produces structured contract intelligence.\n"
            f"Intent: {intent}\n"
            f"User request: {query}\n"
            "Tool outputs:\n"
            f"{serialized_tools}\n"
            "Provide a clear, single-paragraph summary of what the contract reviewer should know."
        )
        return self._generate(prompt)

    def _generate(self, prompt: str) -> str:
        response = requests.post(
            self.url,
            json={
                "model": self.model,
                "input": prompt,
                "parameters": {"max_tokens": 300, "temperature": 0.2},
            },
            timeout=60,
        )
        response.raise_for_status()
        payload = response.json()
        choices = payload.get("choices", [])
        if not choices:
            raise RuntimeError("LLM returned no choices")
        first = choices[0]
        message = first.get("message")
        if message is not None:
            content = message.get("content")
        else:
            content = first.get("content")
        if isinstance(content, list):
            text = "".join(content)
        else:
            text = content or ""
        return text.strip()
