import os
import json
from collections.abc import Iterator
from typing import Any

import httpx

from .structured_ai import StructuredAiResponse


OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
MODEL = "openai/gpt-oss-120b"


class OpenRouterError(Exception):
    pass


def ask_openrouter(question: str) -> str:
    api_key = os.getenv("OPENROUTER_API_KEY")
    if not api_key:
        raise OpenRouterError("OPENROUTER_API_KEY is not configured")

    try:
        response = httpx.post(
            OPENROUTER_URL,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": MODEL,
                "messages": [{"role": "user", "content": question}],
            },
            timeout=30.0,
        )
        response.raise_for_status()
        payload: Any = response.json()
        answer = payload["choices"][0]["message"]["content"]
    except (httpx.HTTPError, KeyError, IndexError, TypeError, ValueError) as error:
        raise OpenRouterError("OpenRouter returned an invalid response") from error

    if not isinstance(answer, str) or not answer.strip():
        raise OpenRouterError("OpenRouter returned an empty response")
    return answer.strip()


SYSTEM_PROMPT = """You are a project management assistant. Return only JSON matching the supplied schema.
The response must contain version 1, a concise response, and zero or more valid board operations.
Never invent IDs. Use only IDs present in the board context for edits, moves, and deletes.
"""


def stream_structured_response(
    board: dict[str, Any], question: str, history: list[dict[str, str]]
) -> Iterator[str]:
    api_key = os.getenv("OPENROUTER_API_KEY")
    if not api_key:
        raise OpenRouterError("OPENROUTER_API_KEY is not configured")

    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": json.dumps({"board": board, "question": question, "history": history})},
    ]
    try:
        with httpx.stream(
            "POST",
            OPENROUTER_URL,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": MODEL,
                "messages": messages,
                "stream": True,
                "response_format": {
                    "type": "json_schema",
                    "json_schema": {
                        "name": "kanban_assistant_response",
                        "strict": True,
                        "schema": structured_response_schema(),
                    },
                },
            },
            timeout=60.0,
        ) as response:
            response.raise_for_status()
            for line in response.iter_lines():
                if not line.startswith("data: "):
                    continue
                data = line.removeprefix("data: ")
                if data == "[DONE]":
                    break
                payload: Any = json.loads(data)
                delta = payload["choices"][0]["delta"].get("content", "")
                if delta:
                    yield delta
    except (httpx.HTTPError, json.JSONDecodeError, KeyError, IndexError, TypeError, ValueError) as error:
        raise OpenRouterError("OpenRouter returned an invalid stream") from error


def structured_response_schema() -> dict[str, Any]:
    return StructuredAiResponse.model_json_schema()
