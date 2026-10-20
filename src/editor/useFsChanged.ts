import { useEffect } from "react";

import { api } from "../api";

const DELAY_MS = 150;

/**
 * Вызывает `callback` после изменений в папке проекта. Изменения приходят пачками,
 * поэтому колбэк срабатывает один раз после короткого затишья.
 */
export function useFsChanged(callback: () => void) {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unlisten = api.onFsChanged(() => {
      clearTimeout(timer);
      timer = setTimeout(callback, DELAY_MS);
    });
    return () => {
      clearTimeout(timer);
      unlisten.then((stop) => stop());
    };
  }, [callback]);
}

/** Загружает данные с диска сразу и заново после каждого изменения в папке проекта. */
export function useDiskData(load: () => void) {
  useEffect(() => {
    load();
  }, [load]);
  useFsChanged(load);
}
