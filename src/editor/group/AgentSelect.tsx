import { cx } from "../../cx";
import type { Agent } from "./group";

interface Props {
  /** Агенты группы; null — группа не выбрана или не читается, список неактивен. */
  agents: Agent[] | null;
  /** id выбранного агента. */
  value: string | undefined;
  onChange: (agentId: string | undefined) => void;
  /** Подпись пустого выбора, например «Не назначен». */
  emptyLabel: string;
  className?: string;
}

/** Выпадающий список агентов группы доски. */
export function AgentSelect({ agents, value, onChange, emptyLabel, className }: Props) {
  const missing = value !== undefined && !agents?.some((agent) => agent.id === value);

  return (
    <select
      value={value ?? ""}
      disabled={!agents}
      onChange={(event) => onChange(event.target.value || undefined)}
      className={cx(
        "min-w-0 cursor-pointer rounded-md border border-border bg-button px-2 text-text outline-none focus:border-accent disabled:cursor-default disabled:opacity-60",
        className,
      )}
    >
      {!agents ? (
        <option value="">Сначала выберите группу агентов</option>
      ) : (
        <>
          <option value="">{emptyLabel}</option>
          {agents.map((agent) => (
            <option key={agent.id} value={agent.id}>
              {agent.name} · {agent.model}
            </option>
          ))}
          {missing && <option value={value}>Агент не найден в группе</option>}
        </>
      )}
    </select>
  );
}
