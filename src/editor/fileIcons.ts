// Иконки файлов по расширению. Новый тип файла — одна строка в FILE_ICONS.

import type { IconType } from "react-icons";
import { FaMarkdown, FaPeopleGroup, FaRegFile, FaTableColumns } from "react-icons/fa6";

import { extensionOf } from "../paths";

export interface FileIcon {
  icon: IconType;
  /** Классы Tailwind для цвета иконки. */
  color: string;
}

const DEFAULT_ICON: FileIcon = { icon: FaRegFile, color: "text-muted" };

/** Ключ — расширение с точкой в нижнем регистре. */
const FILE_ICONS: Record<string, FileIcon> = {
  ".md": { icon: FaMarkdown, color: "text-sky-600 dark:text-sky-400" },
  ".kanban": { icon: FaTableColumns, color: "text-violet-600 dark:text-violet-400" },
  ".group": { icon: FaPeopleGroup, color: "text-emerald-600 dark:text-emerald-400" },
};

/** Иконка для расширения вида «.md»; пустое или незнакомое — обычный файл. */
export function iconForExtension(extension: string): FileIcon {
  return FILE_ICONS[extension.toLowerCase()] ?? DEFAULT_ICON;
}

/** Иконка для имени или пути файла. */
export function iconForFile(name: string): FileIcon {
  return iconForExtension(extensionOf(name));
}
