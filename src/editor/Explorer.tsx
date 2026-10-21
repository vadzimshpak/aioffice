import { useEffect, useState, type HTMLAttributes, type KeyboardEvent, type ReactNode } from "react";
import type { IconType } from "react-icons";
import {
  FaChevronDown,
  FaChevronRight,
  FaFileCirclePlus,
  FaFolder,
  FaFolderOpen,
  FaFolderPlus,
  FaDiagramProject,
  FaGear,
} from "react-icons/fa6";

import { api, type Entry } from "../api";
import { useConfirm } from "../confirm";
import { cx } from "../cx";
import { InlineInput } from "../InlineInput";
import { parentOf, projectName, ROOT } from "../paths";
import { isDeleteShortcut } from "../shortcuts";
import { iconForExtension, iconForFile, type FileIcon } from "./fileIcons";
import { SettingsDialog } from "./settings/SettingsDialog";
import { TemplateDialog } from "./TemplateDialog";
import type { FileTemplate } from "./templates";
import { useFileTree, type Creating, type FileTree } from "./useFileTree";
import { DRAG_TYPE, useDropTarget } from "./useDropTarget";

const DROP_TARGET = "bg-accent/15 outline outline-accent -outline-offset-1";

interface ExplorerProps {
  /** Пользователь открыл файл кликом. */
  onOpenFile: (path: string) => void;
  /** Файл или папка переехали — открытый путь мог измениться. */
  onMoved: (from: string, to: string) => void;
  /** Файл или папка удалены — открытый файл мог пропасть. */
  onDeleted: (path: string) => void;
  /** Открыть визуализацию офиса. */
  onOpenVisualization: () => void;
}

/** Панель Explorer: файлы и папки проекта. */
export function Explorer({ onOpenFile, onMoved, onDeleted, onOpenVisualization }: ExplorerProps) {
  const tree = useFileTree({ onMoved, onDeleted });
  const confirm = useConfirm();
  const [project, setProject] = useState("Проект");
  const [choosingTemplate, setChoosingTemplate] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const rootDrop = useDropTarget(ROOT, tree.move);

  useEffect(() => {
    api.currentProject().then((path) => path && setProject(projectName(path)));
  }, []);

  // Cmd+Backspace / Delete удаляет выбранный файл или папку после подтверждения.
  const deleteSelected = async (event: KeyboardEvent) => {
    if (!tree.selected || !isDeleteShortcut(event)) return;
    event.preventDefault();
    const { path, isDir } = tree.selected;
    const ok = await confirm({
      title: isDir ? `Удалить папку «${projectName(path)}» со всем содержимым?` : `Удалить файл «${projectName(path)}»?`,
      detail: `${isDir ? "Папка будет перемещена" : "Файл будет перемещён"} в Корзину, оттуда его можно вернуть.`,
      action: "Удалить",
    });
    if (ok) tree.remove(path);
  };

  const pickTemplate = (template: FileTemplate | null) => {
    setChoosingTemplate(false);
    if (template) tree.startCreating(false, template);
  };

  return (
    <aside className="flex min-w-0 flex-1 flex-col bg-panel text-[13px]">
      <header className="flex items-center gap-0.5 pt-2 pr-1.5 pb-1.5 pl-3">
        <span className="flex-1 truncate text-[11px] font-semibold tracking-wide text-muted uppercase">
          {project}
        </span>
        <IconButton icon={FaFileCirclePlus} title="Новый файл" onClick={() => setChoosingTemplate(true)} />
        <IconButton icon={FaFolderPlus} title="Новая папка" onClick={() => tree.startCreating(true)} />
        <IconButton icon={FaDiagramProject} title="Визуализация" onClick={onOpenVisualization} />
        <IconButton icon={FaGear} title="Настройки" onClick={() => setSettingsOpen(true)} />
      </header>

      {/* Пустое место под деревом — корень проекта: клик снимает выделение, сюда можно бросить. */}
      {/* Дерево ловит клавиши, поэтому клик по строке ставит фокус на него (кроме поля имени). */}
      <div
        tabIndex={0}
        className={cx("flex-1 overflow-auto pb-6 outline-none", rootDrop.active && "bg-accent/10")}
        onClick={(event) => {
          if (!(event.target instanceof HTMLInputElement)) event.currentTarget.focus();
          if (event.target === event.currentTarget) tree.setSelected(null);
        }}
        onKeyDown={deleteSelected}
        {...rootDrop.handlers}
      >
        <DirContents tree={tree} dir={ROOT} depth={0} onOpenFile={onOpenFile} />
      </div>

      {tree.error && <div className="m-2 rounded-md bg-danger px-2 py-1.5 text-white">{tree.error}</div>}

      <TemplateDialog open={choosingTemplate} onPick={pickTemplate} />
      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </aside>
  );
}

function IconButton({ icon: Icon, title, onClick }: { icon: IconType; title: string; onClick: () => void }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className="grid size-6 cursor-pointer place-items-center rounded text-muted hover:bg-button-hover hover:text-text"
    >
      <Icon size={14} />
    </button>
  );
}

interface TreeProps {
  tree: FileTree;
  depth: number;
  onOpenFile: (path: string) => void;
}

function DirContents({ tree, dir, depth, onOpenFile }: TreeProps & { dir: string }) {
  return (
    <ul>
      {tree.creating?.parent === dir && (
        <li>
          <NameInput depth={depth} creating={tree.creating} onDone={tree.finishCreating} />
        </li>
      )}
      {(tree.children.get(dir) ?? []).map((entry) => (
        <TreeEntry key={entry.path} tree={tree} entry={entry} depth={depth} onOpenFile={onOpenFile} />
      ))}
    </ul>
  );
}

function TreeEntry({ tree, entry, depth, onOpenFile }: TreeProps & { entry: Entry }) {
  const isOpen = entry.is_dir && tree.expanded.has(entry.path);
  // Бросить на файл — значит положить рядом с ним, в ту же папку.
  const drop = useDropTarget(entry.is_dir ? entry.path : parentOf(entry.path), tree.move);

  const select = () => {
    tree.setSelected({ path: entry.path, isDir: entry.is_dir });
    if (entry.is_dir) tree.toggle(entry.path);
    else onOpenFile(entry.path);
  };

  return (
    <li>
      <Row
        depth={depth}
        isDir={entry.is_dir}
        isOpen={isOpen}
        fileIcon={iconForFile(entry.name)}
        className={cx(tree.selected?.path === entry.path && "bg-accent/20", drop.active && DROP_TARGET)}
        title={entry.path}
        draggable
        onDragStart={(event) => {
          event.dataTransfer.setData(DRAG_TYPE, entry.path);
          event.dataTransfer.effectAllowed = "move";
        }}
        onClick={select}
        {...drop.handlers}
      >
        <span className="truncate">{entry.name}</span>
      </Row>
      {isOpen && <DirContents tree={tree} dir={entry.path} depth={depth + 1} onOpenFile={onOpenFile} />}
    </li>
  );
}

/** Поле имени нового элемента: Enter или уход фокуса — создать, Esc — отменить. */
function NameInput({ depth, creating, onDone }: { depth: number; creating: Creating; onDone: (name: string | null) => void }) {
  return (
    <Row depth={depth} isDir={creating.isDir} fileIcon={iconForExtension(creating.extension)} showChevron={false}>
      <InlineInput
        placeholder={creating.isDir ? "Имя папки" : `Имя файла${creating.extension}`}
        onDone={onDone}
        className="h-5 flex-1"
      />
    </Row>
  );
}

interface RowProps extends HTMLAttributes<HTMLDivElement> {
  depth: number;
  isDir: boolean;
  isOpen?: boolean;
  /** Иконка, если это файл. */
  fileIcon: FileIcon;
  /** Показывать стрелку раскрытия у папки. */
  showChevron?: boolean;
  children: ReactNode;
}

/** Строка дерева: отступ, стрелка раскрытия и значок файла или папки. */
function Row({ depth, isDir, isOpen = false, fileIcon, showChevron = true, className, children, ...rest }: RowProps) {
  const Chevron = isOpen ? FaChevronDown : FaChevronRight;
  const kind: FileIcon = isDir ? { icon: isOpen ? FaFolderOpen : FaFolder, color: "text-accent" } : fileIcon;
  return (
    <div
      className={cx("flex h-6 items-center gap-1.5 pr-2 whitespace-nowrap hover:bg-button-hover", className)}
      style={{ paddingLeft: 8 + depth * 14 }}
      {...rest}
    >
      <span className="grid w-3 shrink-0 place-items-center text-muted">
        {isDir && showChevron && <Chevron size={9} />}
      </span>
      <kind.icon size={13} className={cx("shrink-0", kind.color)} />
      {children}
    </div>
  );
}
