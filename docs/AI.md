# Structured AI contract

## Request

`POST /api/ai/chat` requires the authenticated `session` cookie and accepts:

```json
{
  "question": "Move the roadmap card to Done",
  "history": [
    {"role": "user", "content": "What should we finish next?"},
    {"role": "assistant", "content": "The roadmap card is a good candidate."}
  ]
}
```

The backend sends the complete current board JSON, the question, and history to
OpenRouter on every request. The API key stays backend-only.

## Structured response

The model must return JSON with `version: 1`, a user-facing `response`, and an
optional `operations` array. Supported operations are `rename_column`,
`create_card`, `edit_card`, `delete_card`, and `move_card`. Existing IDs must
be used for edits, moves, deletes, and renames. The server generates IDs for
new cards and applies all operations in one transaction.

## Stream

The endpoint returns `text/event-stream` events in order:

- `event: text` contains each provider text chunk as a JSON string.
- `event: complete` contains the final assistant response and the updated board
  after the structured response has been validated and committed.
- `event: error` contains a JSON error string when the provider, parser, or
  board validation fails. No partial board update is committed.

The frontend sidebar in Part 10 will consume this stream and refresh its board
from the `complete` event.
