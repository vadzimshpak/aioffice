import { useEffect, useState, type ComponentType } from "react";
import type { IconType } from "react-icons";
import { FaEye, FaEyeSlash, FaPlug, FaSliders } from "react-icons/fa6";

import { api, type Settings } from "../../api";
import { Button } from "../../Button";
import { cx } from "../../cx";
import { FIELD } from "../../fieldStyle";
import { Modal } from "../../Modal";

interface SectionProps {
  settings: Settings;
  onChange: (change: Partial<Settings>) => void;
}

/** Разделы настроек в боковом меню. Новый раздел — одна строка. */
const SECTIONS: { id: string; title: string; icon: IconType; component: ComponentType<SectionProps> }[] = [
  { id: "general", title: "Основные", icon: FaSliders, component: GeneralSection },
  { id: "connections", title: "Подключения", icon: FaPlug, component: ConnectionsSection },
];

/** Окно настроек приложения: меню разделов слева, настройки раздела справа. */
export function SettingsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} padded={false} className="h-[min(460px,85vh)] w-[min(720px,90vw)]">
      {/* Форма внутри Modal создаётся заново при каждом открытии и читает сохранённые настройки. */}
      <SettingsForm onClose={onClose} />
    </Modal>
  );
}

function SettingsForm({ onClose }: { onClose: () => void }) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [sectionId, setSectionId] = useState(SECTIONS[0].id);
  const [error, setError] = useState<string | null>(null);
  const section = SECTIONS.find((s) => s.id === sectionId) ?? SECTIONS[0];

  useEffect(() => {
    api.loadSettings().then(setSettings, (e) => setError(String(e)));
  }, []);

  const save = async () => {
    if (!settings) return;
    try {
      await api.saveSettings(settings);
      onClose();
    } catch (e) {
      setError(String(e));
    }
  };

  return (
    <div className="grid h-full grid-cols-[190px_1fr]">
      <nav className="flex flex-col gap-0.5 border-r border-border bg-panel p-2">
        <h2 className="px-2 pt-1 pb-2 text-[13px] font-semibold text-muted">Настройки</h2>
        {SECTIONS.map(({ id, title, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setSectionId(id)}
            className={cx(
              "flex h-8 cursor-pointer items-center gap-2 rounded-md px-2 text-left text-[13px]",
              id === sectionId ? "bg-accent text-white" : "text-text hover:bg-button-hover",
            )}
          >
            <Icon size={13} /> {title}
          </button>
        ))}
      </nav>

      <section className="flex min-h-0 flex-col">
        <h3 className="px-5 pt-5 pb-3 text-base font-bold">{section.title}</h3>
        <div className="min-h-0 flex-1 overflow-y-auto px-5">
          {settings && <section.component settings={settings} onChange={(change) => setSettings({ ...settings, ...change })} />}
        </div>
        <footer className="flex items-center justify-end gap-2 p-4">
          {error && <span className="mr-auto truncate text-[13px] text-danger">{error}</span>}
          <Button className="h-9 px-4" onClick={onClose}>
            Отмена
          </Button>
          <Button className="h-9 px-4" disabled={!settings} onClick={save}>
            Сохранить
          </Button>
        </footer>
      </section>
    </div>
  );
}

function GeneralSection({ settings, onChange }: SectionProps) {
  return (
    <label className="flex max-w-xs flex-col gap-1.5">
      <span className="text-[13px] text-muted">Язык</span>
      {/* Пока один язык: локализации ещё нет. */}
      <select value={settings.language} onChange={(e) => onChange({ language: e.target.value })} className={FIELD}>
        <option value="ru">Русский</option>
      </select>
    </label>
  );
}

function ConnectionsSection({ settings, onChange }: SectionProps) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[13px] font-semibold">OpenRouter</span>
      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] text-muted">API-ключ</span>
        <div className="flex gap-2">
          <input
            type={visible ? "text" : "password"}
            value={settings.openrouterApiKey}
            onChange={(e) => onChange({ openrouterApiKey: e.target.value })}
            placeholder="sk-or-…"
            spellCheck={false}
            autoComplete="off"
            className={cx(FIELD, "min-w-0 flex-1 font-mono text-[13px]")}
          />
          <Button
            className="grid w-9 shrink-0 place-items-center"
            title={visible ? "Скрыть ключ" : "Показать ключ"}
            onClick={() => setVisible(!visible)}
          >
            {visible ? <FaEyeSlash /> : <FaEye />}
          </Button>
        </div>
      </label>
      <p className="text-xs text-muted">
        Ключ создаётся на openrouter.ai в разделе Keys. Он хранится в Связке ключей системы, а не в файлах проекта.
        Чтобы удалить ключ, очистите поле и сохраните.
      </p>
    </div>
  );
}
