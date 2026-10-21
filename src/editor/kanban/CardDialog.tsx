import { useState, type KeyboardEvent } from "react";
import { FaRegTrashCan, FaXmark } from "react-icons/fa6";

import { Button } from "../../Button";
import { FIELD } from "../../fieldStyle";
import { Modal } from "../../Modal";
import { isDeleteShortcut } from "../../shortcuts";
import type { Agent } from "../group/group";
import { LogsButton } from "../logs/LogsButton";
import { AgentStop } from "./AgentStop";
import { AgentStatus } from "./AgentStatus";
import { AgentUsageLabel } from "./AgentUsage";
import { AssigneePicker } from "./AssigneePicker";
import { commentAuthorName, type Card, type CardChange } from "./board";

interface Props {
  /** Открытая карточка; без неё окно закрыто. */
  card: Card | undefined;
  /** Путь доски от корня проекта: для запуска агента. */
  boardPath: string;
  /** Столбец, в котором сейчас карточка. */
  stage: string | undefined;
  /** Агенты группы доски, из которых выбирают исполнителя. */
  agents: Agent[] | null;
  onChange: (change: CardChange) => void;
  onComment: (text: string) => void;
  onDelete: () => void;
  /** Перейти к логам агентов по этой карточке. */
  onOpenLogs: () => void;
  onClose: () => void;
}

/** Окно карточки: слева название и описание, справа комментарии. */
export function CardDialog({ card, boardPath, stage, agents, onChange, onComment, onDelete, onOpenLogs, onClose }: Props) {
  return (
    <Modal
      open={!!card}
      onClose={onClose}
      padded={false}
      className="h-[min(600px,88vh)] w-[min(1040px,94vw)]"
      // Cmd+Backspace / Delete вне полей ввода удаляет открытую карточку.
      onKeyDown={(event) => isDeleteShortcut(event) && onDelete()}
    >
      {card && (
        <div className="grid h-full grid-cols-[1fr_1fr]">
          <section className="flex min-h-0 flex-col gap-3 p-5">
            <input
              value={card.title}
              placeholder="Название"
              onChange={(event) => onChange({ title: event.target.value })}
              className={`${FIELD} text-lg font-semibold`}
            />
            <AssigneePicker agents={agents} assignee={card.assignee} onChange={(assignee) => onChange({ assignee })} />
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <span className="flex shrink-0 items-center gap-1.5 text-[13px] text-muted">
                Этап:
                <span className="rounded-full border border-border bg-button px-2 py-0.5 text-xs text-text">{stage ?? "—"}</span>
              </span>
              <AgentStatus state={card.agentState} className="shrink-0" />
              <AgentUsageLabel usage={card.agentUsage} className="shrink-0" />
            </div>
            <textarea
              value={card.description}
              placeholder="Описание"
              onChange={(event) => onChange({ description: event.target.value })}
              className={`${FIELD} flex-1 resize-none leading-relaxed`}
            />
            <div className="flex justify-between">
              <Button className="h-9 px-3" onClick={onDelete}>
                <span className="flex items-center gap-2 text-danger">
                  <FaRegTrashCan /> Удалить карточку
                </span>
              </Button>
              <div className="flex min-w-0 gap-2">
                <LogsButton onClick={onOpenLogs} />
                <AgentStop boardPath={boardPath} card={card} />
                <Button className="h-9 px-4" onClick={onClose}>
                  Готово
                </Button>
              </div>
            </div>
          </section>

          <Comments card={card} agents={agents} onComment={onComment} onClose={onClose} />
        </div>
      )}
    </Modal>
  );
}

interface CommentsProps {
  card: Card;
  agents: Agent[] | null;
  onComment: (text: string) => void;
  onClose: () => void;
}

function Comments({ card, agents, onComment, onClose }: CommentsProps) {
  const [draft, setDraft] = useState("");

  const send = () => {
    if (!draft.trim()) return;
    onComment(draft.trim());
    setDraft("");
  };

  // Cmd+Enter / Ctrl+Enter отправляет комментарий.
  const onKeyDown = (event: KeyboardEvent) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") send();
  };

  return (
    <section className="my-3 mr-3 flex min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-panel">
      <header className="flex items-center justify-between px-4 pt-4 pb-2">
        <h3 className="font-semibold">Комментарии</h3>
        <button type="button" title="Закрыть" onClick={onClose} className="cursor-pointer text-muted hover:text-text">
          <FaXmark size={16} />
        </button>
      </header>

      <ul className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-4">
        {card.comments.length === 0 && <li className="text-muted">Пока нет комментариев</li>}
        {card.comments.map((comment) => (
          <li key={comment.id} className="rounded-md bg-button px-3 py-2">
            <div className="flex items-baseline gap-2 text-[11px] text-muted">
              <span className="truncate font-semibold text-text">{commentAuthorName(comment, agents)}</span>
              <time dateTime={comment.createdAt}>
                {new Date(comment.createdAt).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" })}
              </time>
            </div>
            <p className="break-words whitespace-pre-wrap select-text">{comment.text}</p>
          </li>
        ))}
      </ul>

      <div className="flex flex-col gap-2 p-4">
        <textarea
          rows={3}
          value={draft}
          placeholder="Написать комментарий…"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onKeyDown}
          className={`${FIELD} resize-none`}
        />
        <Button className="h-9 self-end px-4" disabled={!draft.trim()} onClick={send}>
          Комментировать
        </Button>
      </div>
    </section>
  );
}
