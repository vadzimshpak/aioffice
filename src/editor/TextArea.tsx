import { cx } from "../cx";

interface Props {
  value: string;
  onChange: (text: string) => void;
  className?: string;
}

/** Поле для правки текста файла во всю ширину редактора: Markdown в режиме кода, .txt. */
export function TextArea({ value, onChange, className }: Props) {
  return (
    // Без autoFocus: после клика по файлу фокус остаётся в Explorer, как в VS Code.
    <textarea
      spellCheck={false}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className={cx(
        "min-w-0 flex-1 resize-none bg-bg p-4 text-[13px] leading-relaxed text-text outline-none select-text",
        className,
      )}
    />
  );
}
