import { useEffect, useRef, useState, type KeyboardEvent } from "react";

import { cx } from "../../cx";
import { FIELD } from "../../fieldStyle";
import { fetchModels, filterModels, formatPrice, type Model } from "../../openrouter";

interface Props {
  value: string;
  onChange: (model: string) => void;
}

/**
 * Поле модели: ввод фильтрует список моделей OpenRouter, выбор подставляет id.
 * Можно вписать и любой id вручную, например если список не загрузился.
 */
export function ModelPicker({ value, onChange }: Props) {
  const [models, setModels] = useState<Model[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);
  const shown = filterModels(models, value);

  // Поле создаётся заново при каждом открытии окна агента, так что список всегда свежий.
  useEffect(() => {
    fetchModels().then(setModels, (e) => setError(`Список моделей не загрузился: ${e instanceof Error ? e.message : e}`));
  }, []);

  useEffect(() => {
    listRef.current?.children[active]?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const pick = (model: Model) => {
    onChange(model.id);
    setOpen(false);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    const step = { ArrowDown: 1, ArrowUp: -1 }[event.key];
    if (step) {
      event.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(Math.max(i + step, 0), shown.length - 1));
    } else if (event.key === "Enter" && open && shown[active]) {
      event.preventDefault();
      pick(shown[active]);
    } else if (event.key === "Escape" && open) {
      // Закрываем только список: без preventDefault браузер закроет и всё окно.
      event.preventDefault();
      setOpen(false);
    }
  };

  return (
    <div className="relative flex flex-col gap-1">
      <input
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
        placeholder={models.length ? "Начните вводить для поиска" : "Впишите id модели"}
        spellCheck={false}
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        className={cx(FIELD, "font-mono text-[13px]")}
      />
      {open && shown.length > 0 && (
        <div className="absolute top-full right-0 left-0 z-10 mt-1 rounded-md border border-border bg-panel shadow-lg">
          <p className="border-b border-border px-3 py-1 text-right text-[11px] text-muted">
            Примерная цена за 1 000 000 токенов: вход / выход
          </p>
          <ul ref={listRef} role="listbox" className="max-h-64 overflow-y-auto py-1">
            {shown.map((model, index) => (
              <li
                key={model.id}
                role="option"
                aria-selected={index === active}
                // mousedown, а не click: иначе поле теряет фокус и список закрывается раньше выбора.
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(model);
                }}
                onMouseEnter={() => setActive(index)}
                className={cx("cursor-pointer px-3 py-1.5", index === active && "bg-button-hover")}
              >
                <div className="flex items-baseline gap-2">
                  <span className="min-w-0 flex-1 truncate text-[13px] text-text">{model.name}</span>
                  <span className="shrink-0 text-[11px] text-muted">{formatPrice(model.price)}</span>
                </div>
                <div className="truncate font-mono text-[11px] text-muted">{model.id}</div>
              </li>
            ))}
          </ul>
        </div>
      )}
      {error && <span className="text-xs text-danger">{error}</span>}
    </div>
  );
}
