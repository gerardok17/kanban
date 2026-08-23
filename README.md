# Kanban — AI-Powered Project Management App

A full-stack Kanban project-management web app: a board with drag-and-drop
cards, inline editing, and an AI assistant sidebar that can create, edit, and
move cards on your behalf. Runs locally in a single Docker container.

## Features

- Kanban board with fixed, renameable columns
- Create, edit, and drag-and-drop cards between columns
- AI chat sidebar that can create / edit / move one or more cards
- Single-user sign-in (MVP), with a database schema ready for multiple users

## Tech stack

- **Frontend:** Next.js (TypeScript)
- **Backend:** Python + FastAPI (also serves the static Next.js build at `/`)
- **Database:** SQLite (created automatically on first run)
- **AI:** OpenRouter
- **Packaging:** Docker, with `uv` as the Python package manager

## Running locally

Requires Docker. Create a `.env` file in the project root with your OpenRouter
key:

```
OPENROUTER_API_KEY=your_key_here
```

Then start the app with the script for your OS (from `scripts/`):

```bash
sh scripts/start-mac.sh      # macOS
sh scripts/start-linux.sh    # Linux
```

The app runs at http://127.0.0.1:8000/. Stop it with the matching `stop-*`
script.

## Credits

This project was built as a hands-on exercise while following **Ed Donner's
"AI Coder: Complete Claude Code & Coding Agents Course"**. It builds on the
course starter repository at
[ed-donner/pm](https://github.com/ed-donner/pm); the work here is my own
step-by-step implementation on top of that base. All credit for the original
course material and starting point goes to Ed Donner and Ligency.

## License

The upstream course repository is published without a license. This repository
is shared for learning and portfolio purposes; please refer to the original
course and author for any reuse of the underlying material.
