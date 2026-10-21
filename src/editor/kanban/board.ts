// Канбан-доска: формат файла .kanban (JSON) и чистые функции изменения доски.
// Каждая функция возвращает новую доску и не трогает старую.

import type { Agent } from "../group/group";
import { jsonFormat } from "../jsonDocument";

export interface Comment {
  id: string;
  text: string;
  /** Время создания в ISO 8601. */
  createdAt: string;
  /**
   * Кто написал: id агента из группы доски или имя бота. Нет поля — написал
   * владелец компьютера из окна приложения («Админ»).
   */
  author?: string;
}

export const ADMIN_NAME = "Админ";

/** Подпись автора комментария: «Админ», имя агента из группы или имя бота как есть. */
export function commentAuthorName(comment: Comment, agents: Agent[] | null): string {
  if (!comment.author) return ADMIN_NAME;
  return agents?.find((agent) => agent.id === comment.author)?.name ?? comment.author;
}

export interface Card {
  id: string;
  title: string;
  description: string;
  comments: Comment[];
  /** id агента из группы доски, которому назначена задача. */
  assignee?: string;
  /** Как идёт работа агента над карточкой; поле пишет Rust-часть. Нет поля — агент не запускался. */
  agentState?: AgentState;
  /** Сколько всего потратили агенты на карточку за все запуски; пишет Rust-часть. */
  agentUsage?: AgentUsage;
}

export interface AgentUsage {
  tokens: number;
  /** В долларах, по цене OpenRouter. */
  cost: number;
}

export type AgentState = "running" | "done" | "error";

export interface Column {
  id: string;
  title: string;
  cards: Card[];
  /** Обязательный столбец: "туду" — новые задачи, «done» — закрытые. Такие столбцы нельзя удалить. */
  role?: ColumnRole;
}

export type ColumnRole = "todo" | "done";

export interface Board {
  version: 1;
  columns: Column[];
  /** Имя файла .group из той же папки: какая группа агентов работает над доской. */
  group?: string;
  /** id мастер-агента из этой группы: он раздаёт задачи на доске и проверяет их выполнение. */
  orchestrator?: string;
  /** Имя папки рядом с доской, в которой работают агенты и к которой у них есть доступ. */
  workdir?: string;
  /** Раз во сколько минут мастер обходит доску, пока она открыта; нет поля — только вручную. */
  masterInterval?: number;
  /** Сколько долларов можно потратить на доске; дальше агенты не запускаются. Нет поля — без ограничения. */
  budget?: number;
  /** Команды, которые мастер может запускать в рабочей папке для проверки работы; строка — команда целиком. */
  allowedCommands?: string[];
  /** Сколько секунд может работать одна команда; нет поля — 120. */
  commandTimeout?: number;
  /** Как идёт обход мастера и сколько он потратил; поля пишет Rust-часть. */
  masterState?: AgentState;
  masterUsage?: AgentUsage;
}

/** Всего потрачено на доске: исполнители по всем карточкам и мастер. */
export function spent(board: Board): number {
  const cards = board.columns.flatMap((c) => c.cards).reduce((sum, card) => sum + (card.agentUsage?.cost ?? 0), 0);
  return cards + (board.masterUsage?.cost ?? 0);
}

/** Настройки доски из шапки; `undefined` убирает настройку из файла. */
export type BoardSettings = Pick<Board, "group" | "orchestrator" | "workdir" | "masterInterval" | "budget" | "allowedCommands" | "commandTimeout">;

/** «Тестирование»: туда исполнители сдают работу, а мастер или админ проверяют её и переносят в «Готово». */
const DEFAULT_COLUMNS = ["TODO", "Ожидание", "В прогрессе", "Тестирование", "Готово"];

const newId = () => crypto.randomUUID();

export function defaultBoard(): Board {
  const last = DEFAULT_COLUMNS.length - 1;
  const role = (index: number): ColumnRole | undefined => (index === 0 ? "todo" : index === last ? "done" : undefined);
  const columns = DEFAULT_COLUMNS.map((title, index) => ({ id: newId(), title, cards: [], role: role(index) }));
  return { version: 1, columns: columns.map(({ role, ...column }) => (role ? { ...column, role } : column)) };
}

/**
 * Роль столбца. У старых досок ролей в файле нет: тогда обязательные — первый и последний столбцы,
 * так же считает и Rust-часть.
 */
export function columnRole(board: Board, columnId: string): ColumnRole | undefined {
  if (board.columns.some((c) => c.role)) return board.columns.find((c) => c.id === columnId)?.role;
  const index = board.columns.findIndex((c) => c.id === columnId);
  if (board.columns.length < 2 || index < 0) return undefined;
  return index === 0 ? "todo" : index === board.columns.length - 1 ? "done" : undefined;
}

/** Записывает выведенные роли в столбцы, чтобы они не съехали, когда столбцы переставят или добавят. */
function withRoles(board: Board): Board {
  if (board.columns.some((c) => c.role)) return board;
  return {
    ...board,
    columns: board.columns.map((column) => {
      const role = columnRole(board, column.id);
      return role ? { ...column, role } : column;
    }),
  };
}

/** Формат файла .kanban; пустой файл — новая доска по умолчанию. */
export const boardFormat = jsonFormat<Board>(defaultBoard, (data) =>
  Array.isArray(data?.columns) || "в файле нет списка столбцов",
);

/** Меняет настройки доски: рабочую папку, группу агентов и мастер-агента. */
export function updateSettings(board: Board, change: Partial<BoardSettings>): Board {
  const next: Board = { ...board, ...change };
  for (const key of Object.keys(change) as (keyof BoardSettings)[]) {
    if (next[key] === undefined) delete next[key];
  }
  return next;
}

// --- Столбцы ---

/** Добавляет столбец перед «готово», чтобы закрытые задачи оставались в конце. */
export function addColumn(board: Board, title: string): Board {
  const roled = withRoles(board);
  const column = { id: newId(), title, cards: [] };
  const done = roled.columns.findIndex((c) => c.role === "done");
  const columns = [...roled.columns];
  columns.splice(done < 0 ? columns.length : done, 0, column);
  return { ...roled, columns };
}

/** Переименовывает столбец; пустое название не принимается. Роль столбца остаётся прежней. */
export function renameColumn(board: Board, columnId: string, title: string): Board {
  const name = title.trim();
  if (!name) return board;
  const roled = withRoles(board);
  return { ...roled, columns: roled.columns.map((c) => (c.id === columnId ? { ...c, title: name } : c)) };
}

/** Удаляет столбец вместе с карточками; обязательные столбцы не удаляются. */
export function removeColumn(board: Board, columnId: string): Board {
  if (columnRole(board, columnId)) return board;
  const roled = withRoles(board);
  return { ...roled, columns: roled.columns.filter((c) => c.id !== columnId) };
}

/** Ставит столбец перед столбцом `beforeId`, без него — в конец. */
export function moveColumn(original: Board, columnId: string, beforeId?: string): Board {
  const board = withRoles(original);
  const column = board.columns.find((c) => c.id === columnId);
  if (!column || columnId === beforeId) return original;
  const rest = board.columns.filter((c) => c.id !== columnId);
  const index = beforeId ? rest.findIndex((c) => c.id === beforeId) : -1;
  const columns = index < 0 ? [...rest, column] : [...rest.slice(0, index), column, ...rest.slice(index)];
  return { ...board, columns };
}

// --- Карточки ---

function mapCards(board: Board, change: (cards: Card[], column: Column) => Card[]): Board {
  return { ...board, columns: board.columns.map((column) => ({ ...column, cards: change(column.cards, column) })) };
}

export function findCard(board: Board, cardId: string): Card | undefined {
  return board.columns.flatMap((c) => c.cards).find((card) => card.id === cardId);
}

/** Столбец (этап), в котором сейчас карточка. */
export function columnOf(board: Board, cardId: string): Column | undefined {
  return board.columns.find((column) => column.cards.some((card) => card.id === cardId));
}

export function addCard(board: Board, columnId: string, title: string): Board {
  const card: Card = { id: newId(), title, description: "", comments: [] };
  return mapCards(board, (cards, column) => (column.id === columnId ? [...cards, card] : cards));
}

export function removeCard(board: Board, cardId: string): Board {
  return mapCards(board, (cards) => cards.filter((card) => card.id !== cardId));
}

/** Поля карточки, которые меняются из окна карточки; `assignee: undefined` снимает назначение. */
export type CardChange = Partial<Pick<Card, "title" | "description" | "assignee">>;

export function updateCard(board: Board, cardId: string, change: CardChange): Board {
  return mapCards(board, (cards) => cards.map((card) => (card.id === cardId ? { ...card, ...change } : card)));
}

/** Переносит карточку в конец столбца `columnId` (или перед карточкой `beforeId`). */
export function moveCard(board: Board, cardId: string, columnId: string, beforeId?: string): Board {
  const card = findCard(board, cardId);
  if (!card || cardId === beforeId) return board;
  return mapCards(removeCard(board, cardId), (cards, column) => {
    if (column.id !== columnId) return cards;
    const index = beforeId ? cards.findIndex((c) => c.id === beforeId) : -1;
    return index < 0 ? [...cards, card] : [...cards.slice(0, index), card, ...cards.slice(index)];
  });
}

export function addComment(board: Board, cardId: string, text: string, now = new Date()): Board {
  const comment: Comment = { id: newId(), text, createdAt: now.toISOString() };
  return mapCards(board, (cards) =>
    cards.map((card) => (card.id === cardId ? { ...card, comments: [...card.comments, comment] } : card)),
  );
}
