import { useState, type FormEvent } from "react";

import { Button } from "../../Button";
import { cx } from "../../cx";
import { FIELD } from "../../fieldStyle";
import { Modal } from "../../Modal";
import { LogsButton } from "../logs/LogsButton";
import { AGENT_ICONS, DEFAULT_AGENT_ICON } from "./agentIcons";
import { SUGGESTED_MODELS, type Agent, type NewAgent } from "./group";

/** Что открыто в окне: новый агент или существующий. */
export type AgentDraft = { kind: "new" } | { kind: "edit"; agent: Agent };

interface Props {
  /** null — окно закрыто. */
  draft: AgentDraft | null;
  onSave: (agent: NewAgent) => void;
  /** Перейти ко всем логам существующего агента. */
  onOpenLogs: (agent: Agent) => void;
  onClose: () => void;
}

/** Окно агента: иконка, название, модель и скилл. Для нового агента и для правки существующего. */
export function AgentDialog({ draft, onSave, onOpenLogs, onClose }: Props) {
  return (
    <Modal open={draft !== null} onClose={onClose} className="max-h-[90vh] w-[min(640px,90vw)] overflow-y-auto">
      {/* Форма внутри Modal создаётся заново при каждом открытии, поэтому поля всегда свежие. */}
      {draft && <AgentForm draft={draft} onSave={onSave} onOpenLogs={onOpenLogs} onCancel={onClose} />}
    </Modal>
  );
}

function AgentForm({ draft, onSave, onOpenLogs, onCancel }: Omit<Props, "draft" | "onClose"> & { draft: AgentDraft; onCancel: () => void }) {
  const initial = draft.kind === "edit" ? draft.agent : undefined;
  const [icon, setIcon] = useState(initial?.icon ?? DEFAULT_AGENT_ICON);
  const [name, setName] = useState(initial?.name ?? "");
  const [model, setModel] = useState(initial?.model ?? "");
  const [skill, setSkill] = useState(initial?.skill ?? "");
  const ready = name.trim() !== "" && model.trim() !== "";

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (ready) onSave({ icon, name: name.trim(), model: model.trim(), skill });
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <h2 className="text-base font-bold">{initial ? "Агент" : "Новый агент"}</h2>

      {/* Не fieldset: в WebKit (окно Tauri) fieldset с переносом иконок сначала считает лишнюю
          высоту и схлопывает её только при следующей перерисовке. */}
      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] text-muted">Иконка</span>
        <div role="radiogroup" aria-label="Иконка" className="grid grid-cols-[repeat(auto-fill,2.25rem)] gap-1.5">
          {Object.entries(AGENT_ICONS).map(([key, { icon: Icon, label }]) => (
            <button
              key={key}
              type="button"
              title={label}
              role="radio"
              aria-checked={icon === key}
              onClick={() => setIcon(key)}
              className={cx(
                "grid size-9 cursor-pointer place-items-center rounded-md border",
                icon === key ? "border-accent bg-accent text-white" : "border-border bg-button text-muted hover:text-text",
              )}
            >
              <Icon size={16} />
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] text-muted">Название</span>
          <input data-autofocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Например, Аналитик" className={FIELD} />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] text-muted">Модель</span>
          <input
            list="agent-models"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="Выберите или впишите"
            className={FIELD}
          />
          <datalist id="agent-models">
            {SUGGESTED_MODELS.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
        </label>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] text-muted">Скилл</span>
        <textarea
          rows={12}
          spellCheck={false}
          value={skill}
          onChange={(e) => setSkill(e.target.value)}
          placeholder="Вставьте текст скилла агента"
          className={`${FIELD} resize-y font-mono text-[13px] leading-relaxed`}
        />
      </label>

      <div className="flex justify-end gap-2">
        {initial && (
          <div className="mr-auto">
            <LogsButton onClick={() => onOpenLogs(initial)} />
          </div>
        )}
        <Button className="h-9 px-4" onClick={onCancel}>
          Отмена
        </Button>
        <Button type="submit" disabled={!ready} className="h-9 px-4 disabled:cursor-default disabled:opacity-50">
          {initial ? "Сохранить" : "Добавить"}
        </Button>
      </div>
    </form>
  );
}
