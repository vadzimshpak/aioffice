import { FaCoins } from "react-icons/fa6";

import { cx } from "../../cx";
import type { AgentUsage } from "./board";

const TOKEN_FORMS: Record<string, string> = { one: "токен", few: "токена", many: "токенов", other: "токена" };
const plural = new Intl.PluralRules("ru-RU");

/** «12 345 токенов · $0.042»: мелкие суммы с двумя значащими цифрами, чтобы не превращались в $0.00. */
export function formatUsage({ tokens, cost }: AgentUsage): string {
  const count = `${tokens.toLocaleString("ru-RU")} ${TOKEN_FORMS[plural.select(tokens)]}`;
  const dollars = cost === 0 ? "$0" : cost < 0.01 ? `$${Number(cost.toPrecision(2))}` : `$${cost.toFixed(2)}`;
  return `${count} · ${dollars}`;
}

/** Сколько агенты потратили на карточку; пока агент не запускался, ничего не показывает. */
export function AgentUsageLabel({ usage, className }: { usage: AgentUsage | undefined; className?: string }) {
  if (!usage) return null;
  return (
    <span className={cx("flex items-center gap-1.5 text-xs text-muted", className)} title="Расход агентов на эту карточку за все запуски">
      <FaCoins size={11} />
      {formatUsage(usage)}
    </span>
  );
}
