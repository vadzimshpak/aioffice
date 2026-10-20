import { useEffect, useState } from "react";
import { FaBriefcase, FaFolderOpen, FaPlus } from "react-icons/fa6";

import { api } from "../api";
import { Button } from "../Button";
import { Panel, PanelLayout } from "../Panel";
import { projectName } from "../paths";

const ACTION = "flex h-9 items-center justify-center gap-2 px-6";

// После выбора проекта Rust открывает окно редактора и закрывает это окно.
export function Welcome() {
  const [recent, setRecent] = useState<string[]>([]);

  useEffect(() => {
    api.recentProjects().then(setRecent);
  }, []);

  return (
    <PanelLayout>
      <Panel className="min-w-0 flex-1 flex-col items-center justify-center bg-bg">
        {/* Заглушка иконки приложения, пока нет настоящей. */}
        <div className="grid size-32 place-items-center rounded-[28px] bg-accent text-white">
          <FaBriefcase size={60} />
        </div>
        <h1 className="mt-4 mb-1 text-[32px] font-bold">AIOffice</h1>
        <p className="mb-9 text-muted">Версия {__APP_VERSION__}</p>

        {/* Ширина по самой длинной кнопке, обе кнопки одной ширины. */}
        <div className="flex w-max flex-col gap-2">
          <Button className={ACTION} onClick={api.createProject}>
            <FaPlus /> Создать новый проект
          </Button>
          <Button className={ACTION} onClick={api.openProject}>
            <FaFolderOpen /> Открыть существующий проект
          </Button>
        </div>
      </Panel>

      {recent.length > 0 && (
        <Panel className="w-75 shrink-0 flex-col bg-panel px-2 py-3">
          <h2 className="mx-2 mb-2 text-[13px] font-medium text-muted">Последние проекты</h2>
          <ul className="min-h-0 overflow-y-auto">
            {recent.map((path) => (
              <li
                key={path}
                title={path}
                className="rounded-md px-2 py-1.5 hover:bg-button-hover"
                onClick={() => api.openRecent(path)}
              >
                <div className="truncate font-semibold">{projectName(path)}</div>
                <div className="truncate text-xs text-muted">{path}</div>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </PanelLayout>
  );
}
