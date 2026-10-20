import type { ReactNode } from "react";
import { FaArrowLeft } from "react-icons/fa6";

/** Рамка экрана поверх файла: «Назад» и заголовок сверху, содержимое ниже. */
export function OverlayFrame({ title, onBack, children }: { title: string; onBack: () => void; children: ReactNode }) {
  return (
    <main className="flex min-w-0 flex-1 flex-col">
      <header className="flex h-9 shrink-0 items-center gap-2 border-b border-border px-3 text-[13px]">
        <button type="button" onClick={onBack} className="flex cursor-pointer items-center gap-1.5 text-muted hover:text-text">
          <FaArrowLeft size={11} /> Назад
        </button>
        <span className="truncate font-semibold">{title}</span>
      </header>
      {children}
    </main>
  );
}
