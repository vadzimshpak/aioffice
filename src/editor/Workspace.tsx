import type { ComponentType } from "react";

import { extensionOf } from "../paths";
import { GroupEditor } from "./group/GroupEditor";
import { KanbanEditor } from "./kanban/KanbanEditor";
import { MarkdownEditor } from "./markdown/MarkdownEditor";
import { TextEditor } from "./TextEditor";

/** Редактор для каждого расширения. Новый тип файла — одна строка. */
const EDITORS: Record<string, ComponentType<{ path: string }>> = {
  ".md": MarkdownEditor,
  ".txt": TextEditor,
  ".kanban": KanbanEditor,
  ".group": GroupEditor,
};

/** Основная часть окна: редактор открытого файла, подобранный по расширению. */
export function Workspace({ path }: { path: string | null }) {
  if (!path) return <Placeholder text="Выберите файл в Explorer" />;
  const FileEditor = EDITORS[extensionOf(path)];
  if (!FileEditor) return <Placeholder text="Этот тип файлов пока не открывается" />;
  // key: при смене файла редактор создаётся заново со своим состоянием.
  return <FileEditor key={path} path={path} />;
}

function Placeholder({ text }: { text: string }) {
  return <main className="grid flex-1 place-items-center text-muted">{text}</main>;
}
