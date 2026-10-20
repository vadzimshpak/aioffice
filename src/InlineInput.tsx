import { useState, type InputHTMLAttributes, type KeyboardEvent } from "react";

import { cx } from "./cx";

interface Props extends Omit<InputHTMLAttributes<HTMLInputElement>, "onKeyDown" | "onBlur"> {
  /** Введённый текст (Enter или уход фокуса) или null (Esc). Вызывается один раз. */
  onDone: (value: string | null) => void;
}

/** Поле для быстрого ввода имени прямо на месте: появляется с фокусом и сразу ждёт текст. */
export function InlineInput({ onDone, className, ...rest }: Props) {
  const [finished, setFinished] = useState(false);
  const finish = (value: string | null) => {
    if (finished) return;
    setFinished(true);
    onDone(value);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") finish(event.currentTarget.value);
    if (event.key === "Escape") finish(null);
  };

  return (
    <input
      autoFocus
      spellCheck={false}
      onKeyDown={onKeyDown}
      onBlur={(event) => finish(event.currentTarget.value)}
      className={cx("min-w-0 rounded-sm border border-accent bg-bg px-1 text-text outline-none select-text", className)}
      {...rest}
    />
  );
}
