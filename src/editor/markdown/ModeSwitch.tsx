import type { IconType } from "react-icons";
import { FaBookOpen, FaCode, FaRegEye } from "react-icons/fa6";

import { cx } from "../../cx";

export type ViewMode = "edit" | "split" | "preview";

const MODES: { mode: ViewMode; title: string; icon: IconType }[] = [
  { mode: "edit", title: "Только код", icon: FaCode },
  { mode: "split", title: "Код и просмотр рядом", icon: FaBookOpen },
  { mode: "preview", title: "Только просмотр", icon: FaRegEye },
];

const STORAGE_KEY = "markdown-view-mode";
const DEFAULT_MODE: ViewMode = "split";

/** Последний выбранный режим, чтобы следующий файл открывался так же. */
export function loadMode(): ViewMode {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return MODES.some((m) => m.mode === saved) ? (saved as ViewMode) : DEFAULT_MODE;
  } catch {
    return DEFAULT_MODE;
  }
}

export function saveMode(mode: ViewMode) {
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // Без сохранения режима редактор всё равно работает.
  }
}

export function ModeSwitch({ mode, onChange }: { mode: ViewMode; onChange: (mode: ViewMode) => void }) {
  return (
    <div className="flex gap-0.5 rounded-md border border-border p-0.5">
      {MODES.map(({ mode: value, title, icon: Icon }) => (
        <button
          key={value}
          type="button"
          title={title}
          aria-pressed={mode === value}
          onClick={() => onChange(value)}
          className={cx(
            "grid h-6 w-7 cursor-pointer place-items-center rounded",
            mode === value ? "bg-accent text-white" : "text-muted hover:bg-button-hover hover:text-text",
          )}
        >
          <Icon size={13} />
        </button>
      ))}
    </div>
  );
}
