import type { Card } from "@/lib/kanban";

type KanbanCardPreviewProps = {
  card: Card;
};

export const KanbanCardPreview = ({ card }: KanbanCardPreviewProps) => (
  <article className="rounded-2xl border border-[var(--card-border-light)] bg-[var(--card-dark)] px-4 py-4 shadow-[0_18px_32px_rgba(3,33,71,0.4)] backdrop-blur">
    <div className="flex items-start justify-between gap-3">
      <div>
        <h4 className="font-display text-base font-semibold text-[var(--accent-yellow)]">
          {card.title}
        </h4>
        <p className="mt-2 text-sm leading-6 text-white/70">
          {card.details}
        </p>
      </div>
    </div>
  </article>
);
