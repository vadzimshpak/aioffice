import { FaPeopleGroup } from "react-icons/fa6";

import { useSiblingFiles } from "../useSiblingFiles";

interface Props {
  /** Путь доски: группы ищутся в её папке. */
  boardPath: string;
  group: string | undefined;
  onChange: (group: string | undefined) => void;
}

/** Выбор группы агентов (.group из папки доски), которая работает над доской. */
export function GroupPicker({ boardPath, group, onChange }: Props) {
  const groups = useSiblingFiles(boardPath, ".group");
  const missing = group !== undefined && !groups.includes(group);

  return (
    <label className="flex items-center gap-1.5 text-muted" title="Группа агентов, которая работает над доской">
      <FaPeopleGroup size={14} className="text-emerald-600 dark:text-emerald-400" />
      <select
        value={group ?? ""}
        onChange={(event) => onChange(event.target.value || undefined)}
        className="h-6 max-w-56 cursor-pointer rounded border border-border bg-button px-1.5 text-text outline-none focus:border-accent"
      >
        <option value="">{groups.length ? "Без группы" : "Нет групп в этой папке"}</option>
        {groups.map((name) => (
          <option key={name} value={name}>
            {name.replace(/\.group$/i, "")}
          </option>
        ))}
        {missing && <option value={group}>{group} — файл не найден</option>}
      </select>
    </label>
  );
}
