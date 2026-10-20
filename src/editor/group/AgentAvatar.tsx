import { cx } from "../../cx";
import { agentIcon } from "./agentIcons";
import type { Agent } from "./group";

/** Круглая иконка агента; без агента — пустой серый кружок. */
export function AgentAvatar({ agent, size = 28 }: { agent: Agent | undefined; size?: number }) {
  const Icon = agent ? agentIcon(agent.icon) : null;
  return (
    <span
      className={cx("grid shrink-0 place-items-center rounded-full text-white", agent ? "bg-accent" : "bg-button")}
      style={{ width: size, height: size }}
    >
      {Icon && <Icon size={Math.round(size * 0.46)} />}
    </span>
  );
}
