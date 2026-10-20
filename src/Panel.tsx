import type { ReactNode } from "react";

import { cx } from "./cx";

/** Фон окна, на котором лежат блоки-панели с отступами. */
export function PanelLayout({ children }: { children: ReactNode }) {
  return <div className="flex min-w-0 flex-1 gap-2 bg-window p-2">{children}</div>;
}

/** Блок поверх фона окна со скруглёнными углами; размеры и цвет задаёт `className`. */
export function Panel({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cx("flex overflow-hidden rounded-xl border border-border shadow-sm", className)}>{children}</div>;
}
