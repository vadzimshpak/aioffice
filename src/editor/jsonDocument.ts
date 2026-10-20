// Документы, которые хранятся в файле как JSON (.kanban, .group): чтение, запись и правка.

import { useMemo } from "react";

import { useFileContent } from "./useFileContent";

export interface JsonFormat<T> {
  /** Текст файла -> документ. Пустой файл даёт новый документ по умолчанию. */
  parse(text: string): { value: T } | { error: string };
  serialize(value: T): string;
}

/**
 * Описывает формат JSON-документа: `empty` — новый документ, `check` — проверка
 * разобранных данных (true или текст ошибки).
 */
export function jsonFormat<T>(empty: () => T, check: (data: any) => true | string): JsonFormat<T> {
  return {
    parse(text) {
      if (!text.trim()) return { value: empty() };
      let data: unknown;
      try {
        data = JSON.parse(text);
      } catch (e) {
        return { error: `файл не похож на JSON: ${String(e)}` };
      }
      const result = check(data);
      return result === true ? { value: data as T } : { error: result };
    },
    serialize: (value) => `${JSON.stringify(value, null, 2)}\n`,
  };
}

/** Открытый JSON-документ: файл, разобранное значение или ошибка, и функция правки. */
export function useJsonDocument<T>(path: string, format: JsonFormat<T>) {
  const file = useFileContent(path);
  // Разбираем только при смене текста, иначе пустой файл давал бы новые id на каждой отрисовке.
  const parsed = useMemo(() => (file.content === null ? null : format.parse(file.content)), [file.content, format]);

  const value = parsed && "value" in parsed ? parsed.value : null;
  const problem = parsed && "error" in parsed ? `Не удалось прочитать файл: ${parsed.error}. Файл не изменён.` : undefined;
  const change = (update: (value: T) => T) => {
    if (value !== null) file.edit(format.serialize(update(value)));
  };

  return { file, value, problem, change };
}
