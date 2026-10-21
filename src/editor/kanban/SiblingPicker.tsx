import type { ReactNode } from "react";

import { cx } from "../../cx";

interface Props {
  icon: ReactNode;
  /** Подсказка при наведении. */
  title: string;
  /** Имена из папки доски, из которых выбирают. */
  names: string[];
  value: string | undefined;
  onChange: (value: string | undefined) => void;
  /** Пункт «ничего не выбрано», когда выбирать есть из чего и когда не из чего. */
  noneLabel: string;
  emptyLabel: string;
  /** Как показать имя в списке; по умолчанию как есть. */
  format?: (name: string) => string;
  className?: string;
}

/** Выбор одного имени из папки доски для шапки канбана; пропавшее с диска имя остаётся видно. */
export function SiblingPicker({ icon, title, names, value, onChange, noneLabel, emptyLabel, format = (n) => n, className }: Props) {
  const missing = value !== undefined && !names.includes(value);

  return (
    <label className={cx("flex items-center gap-1.5 text-muted", className)} title={title}>
      {icon}
      <select
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value || undefined)}
        className="h-6 max-w-56 cursor-pointer rounded border border-border bg-button px-1.5 text-text outline-none focus:border-accent"
      >
        <option value="">{names.length ? noneLabel : emptyLabel}</option>
        {names.map((name) => (
          <option key={name} value={name}>
            {format(name)}
          </option>
        ))}
        {missing && <option value={value}>{value} — не найдено</option>}
      </select>
    </label>
  );
}
