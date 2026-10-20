// Состояние дерева Explorer и действия над ним. Дерево — отражение диска:
// после любого действия и любого внешнего изменения папки перечитываются.

import { useCallback, useEffect, useRef, useState } from "react";

import { api, type Entry } from "../api";
import { isInside, parentOf, ROOT } from "../paths";
import { useDiskData } from "./useFsChanged";
import { withExtension, type FileTemplate } from "./templates";

export interface Selection {
  path: string;
  isDir: boolean;
}

/** Строка ввода имени нового элемента. */
export interface Creating {
  parent: string;
  isDir: boolean;
  extension: string;
  /** Начальный текст нового файла. */
  content: string;
}

const ERROR_TIMEOUT_MS = 4000;

interface Options {
  /** Элемент переехал: `from` — старый путь, `to` — новый. */
  onMoved?: (from: string, to: string) => void;
  /** Элемент удалён (вместе со всем, что было внутри). */
  onDeleted?: (path: string) => void;
}

export function useFileTree({ onMoved, onDeleted }: Options = {}) {
  const [children, setChildren] = useState<ReadonlyMap<string, Entry[]>>(new Map());
  // Раскрытые папки нужны и при отрисовке, и в асинхронных действиях, поэтому ещё и в ref.
  const expandedRef = useRef(new Set([ROOT]));
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(expandedRef.current);
  const [selected, setSelected] = useState<Selection | null>(null);
  const [creating, setCreating] = useState<Creating | null>(null);
  const [error, setError] = useState<string | null>(null);

  const report = useCallback((e: unknown) => setError(String(e)), []);

  const updateExpanded = useCallback((change: (dirs: Set<string>) => void) => {
    const next = new Set(expandedRef.current);
    change(next);
    expandedRef.current = next;
    setExpanded(next);
  }, []);

  // Перечитывает с диска все раскрытые папки; пропавшие сворачивает.
  const refresh = useCallback(async () => {
    const next = new Map<string, Entry[]>();
    const gone: string[] = [];
    for (const dir of expandedRef.current) {
      try {
        next.set(dir, await api.listDir(dir));
      } catch {
        gone.push(dir);
      }
    }
    if (gone.length) updateExpanded((dirs) => gone.forEach((dir) => dirs.delete(dir)));
    setChildren(next);
  }, [updateExpanded]);

  const expand = useCallback(async (dir: string) => {
    if (expandedRef.current.has(dir)) return;
    const entries = await api.listDir(dir);
    setChildren((current) => new Map(current).set(dir, entries));
    updateExpanded((dirs) => dirs.add(dir));
  }, [updateExpanded]);

  const toggle = async (dir: string) => {
    if (expandedRef.current.has(dir)) updateExpanded((dirs) => dirs.delete(dir));
    else await expand(dir).catch(report);
  };

  // Новый элемент появляется в выбранной папке, рядом с выбранным файлом или в корне.
  const startCreating = async (isDir: boolean, template?: FileTemplate) => {
    const parent = !selected ? ROOT : selected.isDir ? selected.path : parentOf(selected.path);
    try {
      await expand(parent);
      setCreating({ parent, isDir, extension: template?.extension ?? "", content: template?.content?.() ?? "" });
    } catch (e) {
      report(e);
    }
  };

  /** Завершает ввод имени; `null` или пустое имя — отмена. */
  const finishCreating = async (name: string | null) => {
    const target = creating;
    setCreating(null);
    const trimmed = name?.trim();
    if (target && trimmed) {
      try {
        const path = await api.createEntry(target.parent, withExtension(trimmed, target.extension), target.isDir, target.content);
        setSelected({ path, isDir: target.isDir });
      } catch (e) {
        report(e);
      }
    }
    await refresh();
  };

  /** Переносит `from` в папку `toDir`. */
  const move = async (from: string, toDir: string) => {
    if (from === toDir || parentOf(from) === toDir) return;
    try {
      const path = await api.moveEntry(from, toDir);
      if (selected?.path === from) setSelected({ ...selected, path });
      onMoved?.(from, path);
      await expand(toDir);
    } catch (e) {
      report(e);
    }
    await refresh();
  };

  /** Перемещает элемент в Корзину. Спросить пользователя — забота вызывающего. */
  const remove = async (path: string) => {
    try {
      await api.deleteEntry(path);
      if (selected && isInside(selected.path, path)) setSelected(null);
      onDeleted?.(path);
    } catch (e) {
      report(e);
    }
    await refresh();
  };

  useDiskData(refresh);

  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(null), ERROR_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [error]);

  return {
    children,
    expanded,
    selected,
    setSelected,
    creating,
    error,
    toggle,
    startCreating,
    finishCreating,
    remove,
    move,
  };
}

export type FileTree = ReturnType<typeof useFileTree>;
