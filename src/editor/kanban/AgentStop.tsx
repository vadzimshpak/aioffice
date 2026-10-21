import { useState } from "react";
import { FaStop } from "react-icons/fa6";

import { api } from "../../api";
import { Button } from "../../Button";
import type { Card } from "./board";

interface Props {
  /** Путь доски от корня проекта. */
  boardPath: string;
  card: Card;
}

/**
 * Кнопка остановки работающего агента карточки. Запускает исполнителей только мастер,
 * поэтому, пока агент не работает, кнопки нет.
 */
export function AgentStop({ boardPath, card }: Props) {
  const [error, setError] = useState<string | null>(null);
  if (card.agentState !== "running") return null;

  const stop = () => {
    setError(null);
    api.stopAgent(boardPath, card.id).catch((e) => setError(String(e)));
  };

  return (
    <div className="flex min-w-0 items-center gap-2">
      {error && <span className="max-w-48 truncate text-xs text-danger" title={error}>{error}</span>}
      <Button className="flex h-9 shrink-0 items-center gap-2 px-3" title="Остановить агента карточки" onClick={stop}>
        <FaStop size={11} /> Остановить
      </Button>
    </div>
  );
}
