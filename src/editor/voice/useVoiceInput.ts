import { useCallback, useEffect, useRef, useState } from "react";

import { api, type VoiceModelProgress } from "../../api";
import { hotkeyFromEvent, isStopKey } from "../../shortcuts";

export type VoiceState =
  | { kind: "idle" }
  | { kind: "recording"; hotkey: string }
  /** `progress` есть, пока скачивается модель Whisper. */
  | { kind: "transcribing"; progress?: VoiceModelProgress }
  | { kind: "error"; message: string };

const ERROR_SHOWN_MS = 5000;

/**
 * Голосовой ввод по сочетанию клавиш из настроек: первое нажатие начинает запись,
 * второе — останавливает и вставляет распознанный текст туда, где был курсор.
 */
export function useVoiceInput(): VoiceState {
  const [state, setState] = useState<VoiceState>({ kind: "idle" });
  const hotkey = useHotkey();
  // Поле, в котором стоял курсор, когда начали говорить.
  const target = useRef<Element | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  const toggle = useCallback(async () => {
    const current = stateRef.current;
    if (current.kind === "transcribing") return;
    try {
      if (current.kind === "recording") {
        setState({ kind: "transcribing" });
        insertText(target.current, await api.stopRecording());
        setState({ kind: "idle" });
      } else {
        target.current = document.activeElement;
        await api.startRecording();
        setState({ kind: "recording", hotkey: hotkey ?? "" });
      }
    } catch (e) {
      setState({ kind: "error", message: String(e) });
    }
  }, [hotkey]);

  useEffect(() => {
    if (!hotkey) return;
    // Фаза всплытия: поле записи сочетания в настройках успевает остановить событие.
    const onKeyDown = (event: KeyboardEvent) => {
      if (hotkeyFromEvent(event) !== hotkey) return;
      event.preventDefault();
      void toggle();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [hotkey, toggle]);

  // Во время записи её можно закончить и пробелом или Enter. Перехватываем их раньше всех,
  // чтобы они не напечатали пробел или перенос строки в поле и не нажали кнопку.
  useEffect(() => {
    if (state.kind !== "recording") return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (!isStopKey(event)) return;
      event.preventDefault();
      event.stopPropagation();
      void toggle();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [state.kind, toggle]);

  useEffect(() => {
    const unlisten = api.onVoiceModelProgress((progress) =>
      setState((s) => (s.kind === "transcribing" ? { kind: "transcribing", progress } : s)),
    );
    return () => void unlisten.then((stop) => stop());
  }, []);

  useEffect(() => {
    if (state.kind !== "error") return;
    const timer = setTimeout(() => setState({ kind: "idle" }), ERROR_SHOWN_MS);
    return () => clearTimeout(timer);
  }, [state]);

  return state;
}

/** Сочетание клавиш из настроек; перечитывается, когда настройки сохраняют. */
function useHotkey(): string | null {
  const [hotkey, setHotkey] = useState<string | null>(null);

  useEffect(() => {
    const load = () => api.loadSettings().then((s) => setHotkey(s.voiceHotkey), () => setHotkey(null));
    load();
    const unlisten = api.onSettingsChanged(load);
    return () => void unlisten.then((stop) => stop());
  }, []);

  return hotkey;
}

/**
 * Вставляет текст в поле ввода так, будто его напечатали: срабатывает onChange
 * и работает отмена. Если поля нет, текст не теряется — он попадает в буфер обмена.
 */
function insertText(target: Element | null, text: string) {
  if (!text) return;
  if (target instanceof HTMLElement && isEditable(target)) {
    target.focus();
    document.execCommand("insertText", false, text);
  } else {
    void navigator.clipboard.writeText(text);
  }
}

function isEditable(element: HTMLElement): boolean {
  if (element instanceof HTMLTextAreaElement) return !element.readOnly;
  if (element instanceof HTMLInputElement) return !element.readOnly && ["text", "search", ""].includes(element.type);
  return element.isContentEditable;
}
