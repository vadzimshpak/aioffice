import { useEffect, useState } from "react";
import { FaCircleExclamation, FaCrown, FaPlay, FaSpinner, FaStop, FaTerminal } from "react-icons/fa6";

import { api } from "../../api";
import { AgentSelect } from "../group/AgentSelect";
import type { Agent } from "../group/group";
import { spent, type Board, type BoardSettings } from "./board";
import { MasterCommandsDialog } from "./MasterCommandsDialog";

/** Как часто мастер обходит доску; 0 — только по кнопке. */
const INTERVALS = [0, 1, 5, 15, 30, 60];

interface Props {
  boardPath: string;
  board: Board;
  agents: Agent[] | null;
  onChange: (settings: Partial<BoardSettings>) => void;
}

/** Мастер-агент в шапке доски: кто он, как часто обходит доску, обход по кнопке и бюджет доски. */
export function MasterControls({ boardPath, board, agents, onChange }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [commandsOpen, setCommandsOpen] = useState(false);
  const running = board.masterState === "running";
  const hasMaster = !!board.orchestrator;

  const sweep = () => {
    setError(null);
    api.runMaster(boardPath).catch((e) => setError(String(e)));
  };
  useSchedule(hasMaster ? (board.masterInterval ?? 0) : 0, sweep);

  return (
    <div className="ml-2 flex items-center gap-1.5">
      <label className="flex items-center gap-1.5" title="Мастер-агент: раздаёт задачи на доске и проверяет их выполнение">
        <FaCrown size={13} className="text-amber-500" />
        <AgentSelect
          agents={agents}
          value={board.orchestrator}
          onChange={(orchestrator) => onChange({ orchestrator })}
          emptyLabel="Без мастер-агента"
          className="h-6 max-w-44 px-1.5"
        />
      </label>

      {hasMaster && (
        <>
          <select
            value={board.masterInterval ?? 0}
            onChange={(e) => onChange({ masterInterval: Number(e.target.value) || undefined })}
            title="Как часто мастер обходит доску, пока она открыта"
            className="h-6 cursor-pointer rounded border border-border bg-button px-1 text-text outline-none focus:border-accent"
          >
            {INTERVALS.map((minutes) => (
              <option key={minutes} value={minutes}>
                {minutes ? `каждые ${minutes} мин` : "обход вручную"}
              </option>
            ))}
          </select>
          <button
            type="button"
            title={running ? "Остановить обход" : "Обход сейчас"}
            onClick={() => (running ? api.stopMaster(boardPath).catch((e) => setError(String(e))) : sweep())}
            className="grid size-6 cursor-pointer place-items-center rounded border border-border bg-button text-text hover:bg-button-hover"
          >
            {running ? <FaStop size={10} /> : <FaPlay size={10} />}
          </button>
          <button
            type="button"
            title={`Команды, которые мастер может запускать для проверки: ${board.allowedCommands?.length ?? 0}`}
            onClick={() => setCommandsOpen(true)}
            className="flex h-6 cursor-pointer items-center gap-1 rounded border border-border bg-button px-1.5 text-text hover:bg-button-hover"
          >
            <FaTerminal size={10} />
            <span className="text-xs">{board.allowedCommands?.length ?? 0}</span>
          </button>
          <MasterCommandsDialog
            open={commandsOpen}
            commands={board.allowedCommands}
            timeout={board.commandTimeout}
            onSave={onChange}
            onClose={() => setCommandsOpen(false)}
          />
          {running && <FaSpinner size={12} className="animate-spin text-accent" title="Мастер обходит доску" />}
          {(error || board.masterState === "error") && (
            <FaCircleExclamation
              size={13}
              className="text-danger"
              title={error ?? "Последний обход закончился ошибкой: подробности в логах мастера"}
            />
          )}
        </>
      )}

      <Budget board={board} onChange={(budget) => onChange({ budget })} />
    </div>
  );
}

/** Бюджет доски в долларах и сколько уже потрачено. */
function Budget({ board, onChange }: { board: Board; onChange: (budget: number | undefined) => void }) {
  const used = spent(board);
  const over = board.budget !== undefined && used >= board.budget;
  return (
    <label
      className="ml-1 flex items-center gap-1 text-xs text-muted"
      title="Бюджет доски: когда расход агентов его достигнет, новые запуски остановятся"
    >
      <span className={over ? "text-danger" : undefined}>${used.toFixed(2)} из $</span>
      <input
        type="number"
        min={0}
        step={0.5}
        value={board.budget ?? ""}
        placeholder="∞"
        onChange={(e) => onChange(e.target.value === "" ? undefined : Math.max(0, Number(e.target.value)))}
        className="h-6 w-14 rounded border border-border bg-button px-1 text-text outline-none focus:border-accent"
      />
    </label>
  );
}

/** Вызывает `action` раз в `minutes` минут, пока компонент на экране; 0 — не вызывает. */
function useSchedule(minutes: number, action: () => void) {
  const [latest] = useState(() => ({ action }));
  latest.action = action;
  useEffect(() => {
    if (!minutes) return;
    const timer = setInterval(() => latest.action(), minutes * 60_000);
    return () => clearInterval(timer);
  }, [minutes, latest]);
}
