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
}

export interface Column {
  id: string;
  title: string;
  cards: Card[];
}

export interface Board {
  version: 1;
  columns: Column[];
  /** Имя файла .group из той же папки: какая группа агентов работает над доской. */
  group?: string;
  /** id мастер-агента из этой группы: он раздаёт задачи на доске и проверяет их выполнение. */
  orchestrator?: string;
}

/** Настройки доски из шапки; `undefined` убирает настройку из файла. */
export type BoardSettings = Pick<Board, "group" | "orchestrator">;

const DEFAULT_COLUMNS = ["TODO", "Ожидание", "В прогрессе", "Готово"];

const newId = () => crypto.randomUUID();

export function defaultBoard(): Board {
  return { version: 1, columns: DEFAULT_COLUMNS.map((title) => ({ id: newId(), title, cards: [] })) };
}

/** Формат файла .kanban; пустой файл — новая доска по умолчанию. */
export const boardFormat = jsonFormat<Board>(defaultBoard, (data) =>
  Array.isArray(data?.columns) || "в файле нет списка столбцов",
);

/** Меняет настройки доски: группу агентов и мастер-агента. */
export function updateSettings(board: Board, change: Partial<BoardSettings>): Board {
  const next: Board = { ...board, ...change };
  for (const key of Object.keys(change) as (keyof BoardSettings)[]) {
    if (next[key] === undefined) delete next[key];
  }
  return next;
}

// --- Столбцы ---

export function addColumn(board: Board, title: string): Board {
  return { ...board, columns: [...board.columns, { id: newId(), title, cards: [] }] };
}

export function removeColumn(board: Board, columnId: string): Board {
  return { ...board, columns: board.columns.filter((c) => c.id !== columnId) };
}

/** Ставит столбец перед столбцом `beforeId`, без него — в конец. */
export function moveColumn(board: Board, columnId: string, beforeId?: string): Board {
  const column = board.columns.find((c) => c.id === columnId);
  if (!column || columnId === beforeId) return board;
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
