import { useState, type KeyboardEvent } from "react";
import { FaPlus } from "react-icons/fa6";

import { useConfirm } from "../../confirm";
import { InlineInput } from "../../InlineInput";
import { isDeleteShortcut } from "../../shortcuts";
import { EditorFrame } from "../EditorFrame";
import { useGroupAgents } from "../group/useGroupAgents";
import { useJsonDocument } from "../jsonDocument";
import { useOpenOverlay } from "../navigation";
import * as boards from "./board";
import { CardDialog } from "./CardDialog";
import { GroupPicker } from "./GroupPicker";
import { MasterControls } from "./MasterControls";
import { WorkdirPicker } from "./WorkdirPicker";
import { KanbanColumn } from "./KanbanColumn";

/** Редактор канбан-доски из файла .kanban. */
export function KanbanEditor({ path }: { path: string }) {
  const { file, value: board, problem, change } = useJsonDocument(path, boards.boardFormat);
  const [openCardId, setOpenCardId] = useState<string | null>(null);
  const agents = useGroupAgents(path, board?.group);
  const openCard = board && openCardId ? boards.findCard(board, openCardId) : undefined;
  const confirm = useConfirm();
  const openOverlay = useOpenOverlay();

  const deleteCard = async (card: boards.Card) => {
    const ok = await confirm({
      title: `Удалить карточку «${card.title || "Без названия"}»?`,
      detail: "Карточка и её комментарии будут удалены, вернуть их нельзя.",
      action: "Удалить",
    });
    if (!ok) return;
    change((b) => boards.removeCard(b, card.id));
    if (openCardId === card.id) setOpenCardId(null);
  };

  const deleteColumn = async (column: boards.Column) => {
    // Обязательные столбцы («начало» и «готово») не удаляются.
    if (!board || boards.columnRole(board, column.id)) return;
    const ok = await confirm({
      title: `Удалить столбец «${column.title}»?`,
      detail: column.cards.length
        ? `Карточек в столбце: ${column.cards.length}. Они удалятся вместе с ним, вернуть их нельзя.`
        : "Столбец пустой.",
      action: "Удалить",
    });
    if (ok) change((b) => boards.removeColumn(b, column.id));
  };

  // Cmd+Backspace / Delete удаляет карточку или столбец, на котором фокус.
  const deleteFocused = (event: KeyboardEvent) => {
    if (!board || !isDeleteShortcut(event)) return;
    const target = (event.target as HTMLElement).closest<HTMLElement>("[data-card-id], [data-column-id]");
    const card = target?.dataset.cardId && boards.findCard(board, target.dataset.cardId);
    const column = board.columns.find((c) => c.id === target?.dataset.columnId);
    if (!card && !column) return;
    event.preventDefault();
    if (card) deleteCard(card);
    else if (column) deleteColumn(column);
  };

  return (
    <EditorFrame
      path={path}
      file={file}
      problem={problem}
      actions={
        board && (
          <>
            <WorkdirPicker
              boardPath={path}
              workdir={board.workdir}
              onChange={(workdir) => change((b) => boards.updateSettings(b, { workdir }))}
            />
            <GroupPicker
              className="ml-2"
              boardPath={path}
              group={board.group}
              onChange={(group) => change((b) => boards.updateSettings(b, { group }))}
            />
            <MasterControls
              boardPath={path}
              board={board}
              agents={agents}
              onChange={(settings) => change((b) => boards.updateSettings(b, settings))}
            />
          </>
        )
      }
    >
      <div className="flex min-w-0 flex-1 items-start gap-3 overflow-auto p-4" onKeyDown={deleteFocused}>
        {board?.columns.map((column, index) => (
          <KanbanColumn
            key={column.id}
            column={column}
            role={boards.columnRole(board, column.id)}
            agents={agents}
            onAddCard={(title) => change((b) => boards.addCard(b, column.id, title))}
            onRemove={() => deleteColumn(column)}
            onRename={(title) => change((b) => boards.renameColumn(b, column.id, title))}
            onOpenCard={setOpenCardId}
            onMoveCard={(cardId, beforeId) => change((b) => boards.moveCard(b, cardId, column.id, beforeId))}
            onDropColumn={(columnId, side) => {
              const beforeId = side === "before" ? column.id : board.columns[index + 1]?.id;
              change((b) => boards.moveColumn(b, columnId, beforeId));
            }}
          />
        ))}
        <AddColumn onAdd={(title) => change((b) => boards.addColumn(b, title))} />
      </div>

      <CardDialog
        card={openCard}
        boardPath={path}
        stage={openCard && board ? boards.columnOf(board, openCard.id)?.title : undefined}
        agents={agents}
        onChange={(update) => openCard && change((b) => boards.updateCard(b, openCard.id, update))}
        onComment={(text) => openCard && change((b) => boards.addComment(b, openCard.id, text))}
        onDelete={() => openCard && deleteCard(openCard)}
        onOpenLogs={() => {
          if (!openCard) return;
          setOpenCardId(null);
          openOverlay({ kind: "card", board: path, card: { id: openCard.id, title: openCard.title }, agents: agents ?? [] });
        }}
        onClose={() => setOpenCardId(null)}
      />
    </EditorFrame>
  );
}

function AddColumn({ onAdd }: { onAdd: (title: string) => void }) {
  const [adding, setAdding] = useState(false);

  if (adding) {
    return (
      <div className="w-72 shrink-0 rounded-lg bg-panel p-2">
        <InlineInput
          placeholder="Название столбца"
          className="h-8 w-full"
          onDone={(title) => {
            setAdding(false);
            if (title?.trim()) onAdd(title.trim());
          }}
        />
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setAdding(true)}
      className="flex h-10 w-72 shrink-0 cursor-pointer items-center gap-2 rounded-lg px-3 text-muted hover:bg-panel hover:text-text"
    >
      <FaPlus size={12} /> Добавить столбец
    </button>
  );
}
