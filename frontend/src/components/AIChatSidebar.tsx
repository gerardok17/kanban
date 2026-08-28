"use client";

import { FormEvent, useState } from "react";
import { streamChat } from "@/lib/api";
import type { BoardData } from "@/lib/kanban";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

// The backend rejects history longer than 50 entries; keep well under that.
const MAX_HISTORY = 40;

type AIChatSidebarProps = {
  onBoardUpdate: (board: BoardData) => void;
  onUnauthorized: () => void;
};

export const AIChatSidebar = ({
  onBoardUpdate,
  onUnauthorized,
}: AIChatSidebarProps) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [question, setQuestion] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState("");
  const [controller, setController] = useState<AbortController | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedQuestion = question.trim();
    if (!trimmedQuestion || isSending) {
      return;
    }

    const history = messages.slice(-MAX_HISTORY);
    setQuestion("");
    setError("");
    setMessages((current) => [
      ...current,
      { role: "user", content: trimmedQuestion },
      { role: "assistant", content: "" },
    ]);
    setIsSending(true);
    const requestController = new AbortController();
    setController(requestController);

    try {
      const response = await streamChat(trimmedQuestion, history, requestController.signal);
      if (!response.body) {
        throw new Error("The AI stream was empty.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finished = false;

      const handleEvent = (eventBlock: string) => {
        const eventName = eventBlock.match(/^event: (.+)$/m)?.[1];
        const data = eventBlock.match(/^data: (.+)$/m)?.[1];
        if (!eventName || data === undefined) {
          return;
        }
        const parsed = JSON.parse(data);
        if (eventName === "text") {
          setMessages((current) => {
            const next = [...current];
            next[next.length - 1] = {
              role: "assistant",
              content: next[next.length - 1].content + parsed,
            };
            return next;
          });
        } else if (eventName === "complete") {
          finished = true;
          setMessages((current) => {
            const next = [...current];
            next[next.length - 1] = { role: "assistant", content: parsed.response };
            return next;
          });
          onBoardUpdate(parsed.board as BoardData);
        } else if (eventName === "error") {
          throw new Error(parsed);
        }
      };

      while (!finished) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";
        for (const eventBlock of events) {
          handleEvent(eventBlock);
        }
        if (done) {
          if (buffer.trim()) {
            handleEvent(buffer);
          }
          break;
        }
      }
    } catch (streamError) {
      if (streamError instanceof DOMException && streamError.name === "AbortError") {
        setMessages((current) => current.slice(0, -1));
        return;
      }
      if ((streamError as { status?: number }).status === 401) {
        onUnauthorized();
      } else {
        setError(streamError instanceof Error ? streamError.message : "The AI request failed.");
        setMessages((current) => current.filter((message, index) => index !== current.length - 1 || message.content));
      }
    } finally {
      setController(null);
      setIsSending(false);
    }
  };

  return (
    <aside className="flex min-h-[520px] flex-col rounded-3xl border border-[var(--navy-dark)] bg-[var(--navy-dark)] p-5 text-white shadow-[var(--shadow)] lg:sticky lg:top-6 lg:h-[calc(100vh-3rem)]">
      <div className="flex items-start justify-between gap-4 border-b border-white/15 pb-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[var(--accent-yellow)]">
            AI workspace
          </p>
          <h2 className="mt-2 font-display text-2xl font-semibold">Board assistant</h2>
          <p className="mt-2 text-sm leading-6 text-white/65">
            Ask for a change or a quick read of the board.
          </p>
        </div>
        <span className="rounded-full border border-white/20 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white/65">
          Live
        </span>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto py-5" aria-live="polite">
        {messages.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-white/20 p-4 text-sm leading-6 text-white/60">
            Try: “Move the analytics card to Done.”
          </p>
        ) : null}
        {messages.map((message, index) => (
          <div
            key={`${message.role}-${index}`}
            className={message.role === "user" ? "ml-6 rounded-2xl bg-[var(--primary-blue)] p-3 text-sm" : "mr-6 rounded-2xl bg-white/10 p-3 text-sm leading-6 text-white/85"}
          >
            {message.content || (isSending && index === messages.length - 1 ? "Thinking..." : "")}
          </div>
        ))}
      </div>

      {error ? <p role="alert" className="mb-3 text-sm font-semibold text-[var(--accent-yellow)]">{error}</p> : null}
      <form onSubmit={handleSubmit} className="border-t border-white/15 pt-4">
        <label htmlFor="ai-question" className="sr-only">Ask the board assistant</label>
        <textarea
          id="ai-question"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder="Ask the board assistant..."
          rows={3}
          disabled={isSending}
          className="w-full resize-none rounded-2xl border border-white/20 bg-white/10 px-3 py-3 text-sm text-white outline-none placeholder:text-white/45 focus:border-[var(--accent-yellow)]"
        />
        {isSending ? (
          <button
            type="button"
            onClick={() => controller?.abort()}
            className="mt-3 w-full rounded-full border border-white/25 px-4 py-3 text-sm font-semibold uppercase tracking-wide text-white/80 transition hover:border-white"
          >
            Stop response
          </button>
        ) : null}
        <button
          type="submit"
          disabled={isSending || !question.trim()}
          className="mt-3 w-full rounded-full bg-[var(--accent-yellow)] px-4 py-3 text-sm font-semibold uppercase tracking-wide text-[var(--navy-dark)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSending ? "Working..." : "Send request"}
        </button>
      </form>
    </aside>
  );
};
