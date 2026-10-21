import { useState } from "react";

import { Button } from "../../Button";
import { cx } from "../../cx";
import { FIELD } from "../../fieldStyle";
import { Modal } from "../../Modal";
import type { BoardSettings } from "./board";

/** Таймаут по умолчанию; тот же, что в Rust-части. */
const DEFAULT_TIMEOUT = 120;

interface Props {
  open: boolean;
  commands: string[] | undefined;
  timeout: number | undefined;
  onSave: (settings: Pick<BoardSettings, "allowedCommands" | "commandTimeout">) => void;
  onClose: () => void;
}

/** Окно со списком команд, которые мастер может запускать для проверки работы, и их таймаутом. */
export function MasterCommandsDialog({ open, commands, timeout, onSave, onClose }: Props) {
  return (
    <Modal open={open} onClose={onClose} className="w-[min(560px,90vw)]">
      {/* Форма создаётся заново при каждом открытии и берёт значения с доски. */}
      <CommandsForm commands={commands} timeout={timeout} onSave={onSave} onClose={onClose} />
    </Modal>
  );
}

/** Строки текста -> команды: без пустых строк и пробелов по краям. */
export function parseCommands(text: string): string[] {
  return text.split("\n").map((line) => line.trim()).filter(Boolean);
}

function CommandsForm({ commands, timeout, onSave, onClose }: Omit<Props, "open">) {
  const [text, setText] = useState((commands ?? []).join("\n"));
  const [seconds, setSeconds] = useState(String(timeout ?? DEFAULT_TIMEOUT));
  const parsedSeconds = Number(seconds);
  const valid = Number.isInteger(parsedSeconds) && parsedSeconds > 0;

  const save = () => {
    const list = parseCommands(text);
    onSave({
      allowedCommands: list.length ? list : undefined,
      commandTimeout: parsedSeconds === DEFAULT_TIMEOUT ? undefined : parsedSeconds,
    });
    onClose();
  };

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-base font-bold">Команды мастера</h2>
      <p className="text-[13px] text-muted">
        Мастер сможет запускать эти команды в рабочей папке, чтобы проверить работу: собрать проект, прогнать тесты,
        запустить программу. Запускается только строка целиком, по одной команде на строку.
      </p>
      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] text-muted">Разрешённые команды</span>
        <textarea
          data-autofocus
          rows={6}
          spellCheck={false}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={"npm test\ncargo build\npython main.py"}
          className={cx(FIELD, "resize-y font-mono text-[13px]")}
        />
      </label>
      <label className="flex items-center gap-2">
        <span className="text-[13px] text-muted">Таймаут одной команды, секунд</span>
        <input
          type="number"
          min={1}
          value={seconds}
          onChange={(e) => setSeconds(e.target.value)}
          className={cx(FIELD, "w-24 py-1", !valid && "border-danger")}
        />
      </label>
      <p className="text-xs text-muted">
        Запущенная программа работает с вашими правами и видит весь компьютер, а не только рабочую папку. Добавляйте
        только команды, которым доверяете.
      </p>
      <div className="flex justify-end gap-2">
        <Button className="h-9 px-4" onClick={onClose}>
          Отмена
        </Button>
        <Button className="h-9 px-4 disabled:cursor-default disabled:opacity-50" disabled={!valid} onClick={save}>
          Сохранить
        </Button>
      </div>
    </div>
  );
}
