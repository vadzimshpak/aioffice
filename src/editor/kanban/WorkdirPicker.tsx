import { FaFolderOpen } from "react-icons/fa6";

import { useSiblingFolders } from "../useSiblingFiles";
import { SiblingPicker } from "./SiblingPicker";

interface Props {
  /** Путь доски: папки ищутся рядом с ней. */
  boardPath: string;
  workdir: string | undefined;
  onChange: (workdir: string | undefined) => void;
}

/** Выбор рабочей папки рядом с доской: к ней агенты получают доступ. */
export function WorkdirPicker({ boardPath, workdir, onChange }: Props) {
  return (
    <SiblingPicker
      icon={<FaFolderOpen size={14} className="text-sky-600 dark:text-sky-400" />}
      title="Рабочая папка: к ней у агентов есть доступ"
      names={useSiblingFolders(boardPath)}
      value={workdir}
      onChange={onChange}
      noneLabel="Без рабочей папки"
      emptyLabel="Нет папок рядом с доской"
    />
  );
}
