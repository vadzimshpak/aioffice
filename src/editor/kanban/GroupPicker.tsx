import { FaPeopleGroup } from "react-icons/fa6";

import { useSiblingFiles } from "../useSiblingFiles";
import { SiblingPicker } from "./SiblingPicker";

interface Props {
  /** Путь доски: группы ищутся в её папке. */
  boardPath: string;
  group: string | undefined;
  onChange: (group: string | undefined) => void;
  className?: string;
}

/** Выбор группы агентов (.group из папки доски), которая работает над доской. */
export function GroupPicker({ boardPath, group, onChange, className }: Props) {
  return (
    <SiblingPicker
      icon={<FaPeopleGroup size={14} className="text-emerald-600 dark:text-emerald-400" />}
      title="Группа агентов, которая работает над доской"
      names={useSiblingFiles(boardPath, ".group")}
      value={group}
      onChange={onChange}
      noneLabel="Без группы"
      emptyLabel="Нет групп в этой папке"
      format={(name) => name.replace(/\.group$/i, "")}
      className={className}
    />
  );
}
