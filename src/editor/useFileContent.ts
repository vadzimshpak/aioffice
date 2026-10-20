// Текст открытого файла: загрузка, автосохранение и подхват правок, сделанных вне редактора.

import { useCallback, useEffect, useRef, useState } from "react";

import { api } from "../api";
import { useDiskData } from "./useFsChanged";

const SAVE_DELAY_MS = 400;

export function useFileContent(path: string) {
  const [content, setContent] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Для асинхронных колбэков: последняя версия текста и номер правки.
  const latest = useRef({ text: "", version: 0, dirty: false });

  const markSaved = (version: number) => {
    if (latest.current.version !== version) return; // пока писали, текст снова изменили
    latest.current.dirty = false;
    setDirty(false);
  };

  const save = useCallback(async () => {
    const { text, version, dirty } = latest.current;
    if (!dirty) return;
    try {
      await api.writeFile(path, text);
      markSaved(version);
      setError(null);
    } catch (e) {
      setError(String(e));
    }
  }, [path]);

  // Перечитывает файл с диска, если в редакторе нет несохранённых правок.
  const load = useCallback(async () => {
    try {
      const text = await api.readFile(path);
      if (latest.current.dirty) return;
      latest.current.text = text;
      setContent(text);
      setError(null);
    } catch (e) {
      setError(String(e));
    }
  }, [path]);

  const edit = (text: string) => {
    latest.current = { text, version: latest.current.version + 1, dirty: true };
    setContent(text);
    setDirty(true);
  };


  // Автосохранение после паузы в наборе; при закрытии файла — сразу.
  useEffect(() => {
    if (!dirty) return;
    const timer = setTimeout(save, SAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [content, dirty, save]);
  useEffect(() => () => void save(), [save]);

  useDiskData(load);

  return { content, dirty, error, edit, save };
}
