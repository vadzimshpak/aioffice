// Шаблоны новых файлов. Новый шаблон — одна строка в списке;
// иконка берётся по расширению из fileIcons.ts.

import { emptyGroup, groupFormat } from "./group/group";
import { boardFormat, defaultBoard } from "./kanban/board";

export interface FileTemplate {
  title: string;
  description: string;
  /** Расширение с точкой; пустое — имя остаётся как ввели. */
  extension: string;
  /** Начальный текст файла; без него файл создаётся пустым. */
  content?: () => string;
}

export const FILE_TEMPLATES: FileTemplate[] = [
  { title: "Пустой файл", description: "Любое имя и расширение", extension: "" },
  { title: "Markdown", description: "Текстовый документ, .md", extension: ".md" },
  {
    title: "Kanban",
    description: "Канбан-доска, .kanban",
    extension: ".kanban",
    content: () => boardFormat.serialize(defaultBoard()),
  },
  {
    title: "Группа агентов",
    description: "Сетка агентов, .group",
    extension: ".group",
    content: () => groupFormat.serialize(emptyGroup()),
  },
];

/** Добавляет расширение шаблона, если пользователь не написал его сам. */
export function withExtension(name: string, extension: string): string {
  return !extension || name.toLowerCase().endsWith(extension) ? name : name + extension;
}
