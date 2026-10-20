import type { KeyboardEvent, ReactNode } from "react";

import { projectName } from "../paths";
import type { useFileContent } from "./useFileContent";

interface Props {
  path: string;
  file: ReturnType<typeof useFileContent>;
  /** Кнопки справа в шапке. */
  actions?: ReactNode;
  /** Файл открыть не получилось: вместо редактора показывается этот текст. */
  problem?: string;
  children: ReactNode;
}

/** Общая рамка редакторов файлов: шапка с именем и состоянием сохранения, Cmd+S. */
export function EditorFrame({ path, file, actions, problem, children }: Props) {
  // Cmd+S / Ctrl+S сохраняет сразу, не дожидаясь автосохранения.
  const onKeyDown = (event: KeyboardEvent) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      file.save();
    }
  };

  return (
    <main className="flex min-w-0 flex-1 flex-col" onKeyDown={onKeyDown}>
      <header className="flex h-9 shrink-0 items-center gap-2 border-b border-border px-3 text-[13px]">
        <span className="truncate" title={path}>
          {projectName(path)}
        </span>
        {file.dirty && <span className="size-2 shrink-0 rounded-full bg-muted" title="Есть несохранённые правки" />}
        {file.error && <span className="truncate text-danger">{file.error}</span>}
        <div className="ml-auto flex shrink-0 items-center gap-1">{actions}</div>
      </header>
      {problem ? (
        <p className="m-auto max-w-md text-center text-muted">{problem}</p>
      ) : (
        file.content !== null && <div className="flex min-h-0 flex-1">{children}</div>
      )}
    </main>
  );
}
