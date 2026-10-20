import { cx } from "../../cx";
import type { Agent } from "../group/group";
import type { LogsTarget } from "../navigation";
import { OverlayFrame } from "../OverlayFrame";
import { LOGS_DIR, newestFirst, runsForCard, type EntryKind, type Run } from "./logs";
import { useAgentRuns } from "./useAgentRuns";

const KIND: Record<EntryKind, { label: string; className: string }> = {
  thought: { label: "мысль", className: "text-muted" },
  action: { label: "действие", className: "text-accent" },
  result: { label: "результат", className: "text-emerald-600 dark:text-emerald-400" },
  error: { label: "ошибка", className: "text-danger" },
};

const formatTime = (iso: string, withDate: boolean) =>
  new Date(iso).toLocaleString("ru-RU", withDate ? { dateStyle: "short", timeStyle: "short" } : { timeStyle: "medium" });

/** Логи агента (все его запуски) или карточки (запуски всех агентов группы по ней), блоком на запуск. */
export function LogsView({ target, onBack }: { target: LogsTarget; onBack: () => void }) {
  const agents = target.kind === "agent" ? [target.agent] : target.agents;
  const all = useAgentRuns(agents.map((a) => a.id));
  const runs = newestFirst(target.kind === "agent" ? all : runsForCard(all, target.board, target.card.id));
  const title =
    target.kind === "agent" ? `Логи агента «${target.agent.name}»` : `Логи карточки «${target.card.title || "Без названия"}»`;

  return (
    <OverlayFrame title={title} onBack={onBack}>
      <div className="min-h-0 flex-1 overflow-auto p-4">
        {runs.length === 0 ? (
          <p className="mt-10 text-center text-muted">
            Логов пока нет. Они появятся, когда агент начнёт работать: запуски пишутся в {LOGS_DIR}.
          </p>
        ) : (
          <ol className="flex flex-col gap-3">
            {runs.map((run) => (
              <RunBlock key={`${run.agentId}-${run.id}`} run={run} target={target} agents={agents} />
            ))}
          </ol>
        )}
      </div>
    </OverlayFrame>
  );
}

/** Один запуск: сверху слева дата и карточка (в логах карточки — агент), ниже записи. */
function RunBlock({ run, target, agents }: { run: Run; target: LogsTarget; agents: Agent[] }) {
  const subject =
    target.kind === "agent"
      ? (run.cardTitle ?? "Без карточки")
      : (agents.find((a) => a.id === run.agentId)?.name ?? "Неизвестный агент");

  return (
    <li className="rounded-lg border border-border bg-panel">
      <header className="flex items-baseline gap-2 border-b border-border px-3 py-2 text-[13px]">
        <time dateTime={run.startedAt} className="font-semibold">
          {formatTime(run.startedAt, true)}
        </time>
        <span className="truncate text-muted">{subject}</span>
      </header>
      <ul className="flex flex-col gap-1 px-3 py-2 font-mono text-xs leading-relaxed select-text">
        {run.entries.map((entry, index) => (
          <li key={index} className="flex gap-2">
            <time className="shrink-0 text-muted">{formatTime(entry.time, false)}</time>
            <span className={cx("w-20 shrink-0", KIND[entry.kind]?.className ?? "text-muted")}>
              {KIND[entry.kind]?.label ?? entry.kind}
            </span>
            <span className="break-words whitespace-pre-wrap">{entry.text}</span>
          </li>
        ))}
      </ul>
    </li>
  );
}
