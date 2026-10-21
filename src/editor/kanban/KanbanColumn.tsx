import { useState, type DragEvent } from "react";
import { FaPlus, FaRegTrashCan } from "react-icons/fa6";

import { cx } from "../../cx";
import { InlineInput } from "../../InlineInput";
import { AgentAvatar } from "../group/AgentAvatar";
import type { Agent } from "../group/group";
import { AgentStatus } from "./AgentStatus";
import { AgentUsageLabel } from "./AgentUsage";
import type { Column, ColumnRole } from "./board";

/** Лёгкая зелёная подсветка столбца «готово»: заметна в шапке и сходит на нет ниже. */
const DONE_GLOW = "linear-gradient(to bottom, rgb(16 185 129 / 0.16), transparent 140px)";

/** Типы данных при перетаскивании; значение — id карточки или столбца. */
const CARD_DRAG_TYPE = "application/x-aioffice-card";
const COLUMN_DRAG_TYPE = "application/x-aioffice-column";

/** С какой стороны от этого столбца встанет перетаскиваемый столбец. */
export type ColumnSide = "before" | "after";

interface Props {
  column: Column;
  /** Обязательный столбец: его нельзя удалить, а «готово» ещё и подсвечен. */
  role: ColumnRole | undefined;
  /** Агенты группы доски: по ним на карточках показывается исполнитель. */
  agents: Agent[] | null;
  onAddCard: (title: string) => void;
  onRemove: () => void;
  onRename: (title: string) => void;
  onOpenCard: (cardId: string) => void;
  /** Карточку бросили в этот столбец: в конец или перед карточкой `beforeId`. */
  onMoveCard: (cardId: string, beforeId?: string) => void;
  /** Сюда бросили столбец `columnId`: поставить его перед этим столбцом или после. */
  onDropColumn: (columnId: string, side: ColumnSide) => void;
}

export function KanbanColumn({ column, role, agents, onAddCard, onRemove, onRename, onOpenCard, onMoveCard, onDropColumn }: Props) {
  const [adding, setAdding] = useState(false);
  // Новое поле после каждой добавленной карточки, чтобы можно было вводить подряд.
  const [inputKey, setInputKey] = useState(0);
  const [dropBefore, setDropBefore] = useState<string | null>(null); // id карточки или "end"
  const [columnSide, setColumnSide] = useState<ColumnSide | null>(null);
  const [dragging, setDragging] = useState(false);
  const [renaming, setRenaming] = useState(false);

  // Столбец над этим: встаёт слева или справа, смотря по какой половине курсор.
  const columnDragOver = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    const box = event.currentTarget.getBoundingClientRect();
    setColumnSide(event.clientX < box.left + box.width / 2 ? "before" : "after");
  };

  const resetDrop = () => {
    setDropBefore(null);
    setColumnSide(null);
  };

  const dragOver = (event: DragEvent, target: string) => {
    if (!event.dataTransfer.types.includes(CARD_DRAG_TYPE)) return;
    event.preventDefault();
    event.stopPropagation();
    setDropBefore(target);
  };

  const drop = (event: DragEvent) => {
    event.preventDefault();
    const cardId = event.dataTransfer.getData(CARD_DRAG_TYPE);
    const columnId = event.dataTransfer.getData(COLUMN_DRAG_TYPE);
    if (cardId) onMoveCard(cardId, dropBefore === "end" ? undefined : (dropBefore ?? undefined));
    if (columnId && columnSide) onDropColumn(columnId, columnSide);
    resetDrop();
  };

  return (
    <section
      className={cx("relative flex max-h-full w-72 shrink-0 flex-col rounded-lg bg-panel", dragging && "opacity-40")}
      style={role === "done" ? { backgroundImage: DONE_GLOW } : undefined}
      onDragOver={(event) =>
        event.dataTransfer.types.includes(COLUMN_DRAG_TYPE) ? columnDragOver(event) : dragOver(event, "end")
      }
      onDragLeave={(event) => !event.currentTarget.contains(event.relatedTarget as Node) && resetDrop()}
      onDrop={drop}
    >
      {columnSide && <ColumnMarker side={columnSide} />}
      {/* За шапку столбец перетаскивается на новое место, как в Trello. */}
      {/* Шапка в фокусе после клика: Cmd+Backspace / Delete удаляет столбец. */}
      <header
        tabIndex={0}
        data-column-id={column.id}
        onClick={(event) => event.currentTarget.focus()}
        // Пока название правят, шапку не тащим: иначе мышью не выделить текст.
        draggable={!renaming}
        title="Перетащите, чтобы переставить столбец; двойной клик или F2 — переименовать"
        onKeyDown={(event) => {
          if (event.key === "F2" && event.target === event.currentTarget) setRenaming(true);
        }}
        onDragStart={(event) => {
          event.dataTransfer.setData(COLUMN_DRAG_TYPE, column.id);
          event.dataTransfer.effectAllowed = "move";
          setDragging(true);
        }}
        onDragEnd={() => setDragging(false)}
        className="flex cursor-grab items-center gap-2 rounded-t-lg px-3 pt-2.5 pb-1.5 outline-none focus-visible:bg-accent/10 active:cursor-grabbing"
      >
        {renaming ? (
          <InlineInput
            defaultValue={column.title}
            aria-label="Название столбца"
            onFocus={(event) => event.currentTarget.select()}
            className="h-7 flex-1 font-semibold"
            onDone={(title) => {
              setRenaming(false);
              if (title !== null && title.trim() && title.trim() !== column.title) onRename(title);
            }}
          />
        ) : (
          <h3 className="truncate font-semibold" onDoubleClick={() => setRenaming(true)}>
            {column.title}
          </h3>
        )}
        <span className="text-xs text-muted">{column.cards.length}</span>
        {!role && <RemoveColumnButton onRemove={onRemove} />}
      </header>

      <ul className="flex min-h-2 flex-col gap-1.5 overflow-y-auto px-2 pb-1">
        {column.cards.map((card) => (
          <li key={card.id} onDragOver={(event) => dragOver(event, card.id)}>
            {dropBefore === card.id && <DropMarker />}
            <button
              type="button"
              draggable
              onDragStart={(event) => {
                event.dataTransfer.setData(CARD_DRAG_TYPE, card.id);
                event.dataTransfer.effectAllowed = "move";
              }}
              data-card-id={card.id}
              onClick={(event) => {
                // WebKit не ставит фокус на кнопку при клике; он нужен, чтобы шорткат удаления знал карточку.
                event.currentTarget.focus();
                onOpenCard(card.id);
              }}
              className="w-full cursor-pointer rounded-md border border-border bg-button px-3 py-2 text-left break-words shadow-xs hover:border-accent"
            >
              {card.title || <span className="text-muted">Без названия</span>}
              {card.assignee && <Assignee agent={agents?.find((agent) => agent.id === card.assignee)} />}
              <AgentStatus state={card.agentState} className="mt-1.5" />
              <AgentUsageLabel usage={card.agentUsage} className="mt-1" />
            </button>
          </li>
        ))}
        {dropBefore === "end" && <DropMarker />}
      </ul>

      <footer className="p-2 pt-1">
        {adding ? (
          <InlineInput
            key={inputKey}
            placeholder="Название карточки"
            className="h-8 w-full"
            onDone={(title) => {
              if (title?.trim()) {
                onAddCard(title.trim());
                setInputKey((key) => key + 1);
              } else {
                setAdding(false);
              }
            }}
          />
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-muted hover:bg-button-hover hover:text-text"
          >
            <FaPlus size={11} /> Добавить карточку
          </button>
        )}
      </footer>
    </section>
  );
}

/** Исполнитель на карточке: иконка и имя агента. */
function Assignee({ agent }: { agent: Agent | undefined }) {
  return (
    <span className="mt-2 flex items-center gap-1.5 text-xs text-muted">
      <AgentAvatar agent={agent} size={18} />
      <span className="truncate">{agent?.name ?? "Агент не найден"}</span>
    </span>
  );
}

/** Полоса между столбцами, куда встанет перетаскиваемый столбец. */
function ColumnMarker({ side }: { side: ColumnSide }) {
  return <div className={cx("absolute top-0 h-full w-1 rounded-full bg-accent", side === "before" ? "-left-2" : "-right-2")} />;
}

function DropMarker() {
  return <div className="mb-1.5 h-0.5 rounded-full bg-accent" />;
}

function RemoveColumnButton({ onRemove }: { onRemove: () => void }) {
  return (
    <button
      type="button"
      title="Удалить столбец"
      onClick={onRemove}
      className="ml-auto grid size-6 shrink-0 cursor-pointer place-items-center rounded text-muted hover:bg-button-hover hover:text-text"
    >
      <FaRegTrashCan size={11} />
    </button>
  );
}
