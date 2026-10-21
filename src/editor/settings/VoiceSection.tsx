import { useCallback, useEffect, useState, type KeyboardEvent } from "react";
import { FaCheck, FaDownload } from "react-icons/fa6";

import { api, type VoiceModel, type VoiceModelProgress } from "../../api";
import { Button } from "../../Button";
import { cx } from "../../cx";
import { FIELD } from "../../fieldStyle";
import { hotkeyFromEvent } from "../../shortcuts";
import type { SectionProps } from "./SettingsDialog";

/** Раздел «Голосовой ввод»: сочетание клавиш и модель Whisper. */
export function VoiceSection({ settings, onChange }: SectionProps) {
  return (
    <div className="flex flex-col gap-5 pb-4">
      <label className="flex max-w-xs flex-col gap-1.5">
        <span className="text-[13px] text-muted">Горячая клавиша</span>
        <HotkeyInput value={settings.voiceHotkey} onChange={(voiceHotkey) => onChange({ voiceHotkey })} />
        <span className="text-xs text-muted">
          Первое нажатие начинает запись. Закончить её можно этим же сочетанием, пробелом или Enter —
          текст вставится туда, где стоит курсор.
        </span>
      </label>

      <ModelList value={settings.whisperModel} onChange={(whisperModel) => onChange({ whisperModel })} />
    </div>
  );
}

/** Поле, которое запоминает нажатое сочетание клавиш вместо текста. */
function HotkeyInput({ value, onChange }: { value: string; onChange: (hotkey: string) => void }) {
  const record = (event: KeyboardEvent<HTMLInputElement>) => {
    // Tab переводит фокус, Esc закрывает окно настроек — их не записываем.
    if (event.key === "Tab" || event.key === "Escape") return;
    // Не даём сочетанию сработать (например, включить голосовой ввод), пока его записывают.
    event.preventDefault();
    event.stopPropagation();
    const hotkey = hotkeyFromEvent(event);
    if (hotkey) onChange(hotkey);
  };

  return (
    <input
      readOnly
      value={value}
      onKeyDown={record}
      placeholder="Нажмите сочетание клавиш"
      className={cx(FIELD, "cursor-pointer font-mono text-[13px]")}
    />
  );
}

/** Модели Whisper: выбор одной и скачивание заранее. */
function ModelList({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const [models, setModels] = useState<VoiceModel[]>([]);
  const [progress, setProgress] = useState<VoiceModelProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api.voiceModels().then(setModels, (e) => setError(String(e)));
  }, []);

  useEffect(() => {
    load();
    const unlisten = api.onVoiceModelProgress(setProgress);
    return () => void unlisten.then((stop) => stop());
  }, [load]);

  const download = async (id: string) => {
    setError(null);
    setProgress({ id, downloaded: 0, total: null });
    try {
      await api.downloadVoiceModel(id);
    } catch (e) {
      setError(String(e));
    }
    setProgress(null);
    load();
  };

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[13px] text-muted">Модель распознавания Whisper</span>
      <div role="radiogroup" className="flex flex-col gap-1">
        {models.map((model) => (
          <label
            key={model.id}
            className={cx(
              "flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2",
              model.id === value ? "border-accent" : "border-border hover:bg-button-hover",
            )}
          >
            <input type="radio" name="whisper-model" checked={model.id === value} onChange={() => onChange(model.id)} />
            <span className="min-w-0 flex-1 text-[13px]">{model.title}</span>
            <span className="text-xs text-muted">{formatSize(model.sizeMb)}</span>
            <ModelStatus model={model} progress={progress} onDownload={() => download(model.id)} />
          </label>
        ))}
      </div>
      {error && <span className="text-xs text-danger">{error}</span>}
      <span className="text-xs text-muted">
        Модель скачивается один раз, при первом голосовом вводе или кнопкой. Речь распознаётся на этом компьютере.
      </span>
    </div>
  );
}

function ModelStatus({ model, progress, onDownload }: { model: VoiceModel; progress: VoiceModelProgress | null; onDownload: () => void }) {
  if (model.downloaded) {
    return (
      <span className="flex w-24 items-center justify-end gap-1 text-xs text-muted">
        <FaCheck size={10} /> скачана
      </span>
    );
  }
  if (progress?.id === model.id) {
    const percent = progress.total ? Math.round((progress.downloaded / progress.total) * 100) : 0;
    return <span className="w-24 text-right text-xs text-muted">{percent}%</span>;
  }
  return (
    <Button
      className="flex h-7 w-24 items-center justify-center gap-1.5 text-xs disabled:cursor-default disabled:opacity-50"
      disabled={progress !== null}
      onClick={(e) => {
        // Кнопка внутри label: без этого клик заодно выбрал бы модель.
        e.preventDefault();
        onDownload();
      }}
    >
      <FaDownload size={10} /> Скачать
    </Button>
  );
}

function formatSize(mb: number): string {
  return mb >= 1000 ? `${(mb / 1000).toFixed(1)} ГБ` : `${mb} МБ`;
}
