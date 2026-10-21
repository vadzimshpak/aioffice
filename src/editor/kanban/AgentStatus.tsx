import { FaCircleCheck, FaCircleExclamation, FaSpinner } from "react-icons/fa6";

import { cx } from "../../cx";
import type { AgentState } from "./board";

const STATES: Record<AgentState, { label: string; icon: typeof FaSpinner; className: string }> = {
  running: { label: "Агент работает", icon: FaSpinner, className: "text-accent" },
  done: { label: "Агент закончил", icon: FaCircleCheck, className: "text-emerald-600 dark:text-emerald-400" },
  error: { label: "Ошибка агента", icon: FaCircleExclamation, className: "text-danger" },
};

/** Значок работы агента над карточкой: на доске и в окне карточки. */
export function AgentStatus({ state, className }: { state: AgentState | undefined; className?: string }) {
  if (!state) return null;
  const { label, icon: Icon, className: color } = STATES[state];
  return (
    <span className={cx("flex items-center gap-1.5 text-xs", color, className)}>
      <Icon size={11} className={cx(state === "running" && "animate-spin")} />
      {label}
    </span>
  );
}
