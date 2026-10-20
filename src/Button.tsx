import type { ButtonHTMLAttributes } from "react";

import { cx } from "./cx";

const VARIANTS = {
  plain: "border-border bg-button text-text hover:bg-button-hover",
  /** Опасное действие, например удаление. */
  danger: "border-danger bg-danger text-white hover:opacity-85",
};

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof VARIANTS;
}

/** Обычная кнопка приложения в рамке; размеры и раскладку задаёт `className`. */
export function Button({ className, variant = "plain", ...rest }: Props) {
  return (
    <button
      type="button"
      className={cx(
        "cursor-pointer rounded-lg border focus-visible:outline-2 focus-visible:outline-accent",
        VARIANTS[variant],
        className,
      )}
      {...rest}
    />
  );
}
