import { AgentAvatar } from "../group/AgentAvatar";
import { AgentSelect } from "../group/AgentSelect";
import type { Agent } from "../group/group";

interface Props {
  /** Агенты группы доски; null — группа не выбрана или не читается. */
  agents: Agent[] | null;
  assignee: string | undefined;
  onChange: (assignee: string | undefined) => void;
}

/** Выбор агента из группы доски, которому назначена задача. */
export function AssigneePicker({ agents, assignee, onChange }: Props) {
  return (
    <label className="flex items-center gap-2">
      <span className="shrink-0 text-[13px] text-muted">Исполнитель</span>
      <AgentAvatar agent={agents?.find((agent) => agent.id === assignee)} />
      <AgentSelect agents={agents} value={assignee} onChange={onChange} emptyLabel="Не назначен" className="h-8 flex-1" />
    </label>
  );
}
