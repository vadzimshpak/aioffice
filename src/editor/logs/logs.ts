// Логи агентов: рассуждения и действия, по блоку на каждый запуск.
//
// Где лежат: `.aioffice/logs/<id агента>.jsonl` в корне проекта, одна строка — один запуск
// (JSON Lines: агенту достаточно дописать строку в конец файла). Пример строки:
// {"id":"r1","agentId":"a1","startedAt":"2026-10-19T10:00:00Z","board":"Спринт.kanban",
//  "cardId":"k1","cardTitle":"Сверстать макет","entries":[{"time":"…","kind":"thought","text":"…"}]}

export const LOGS_DIR = ".aioffice/logs";

export type EntryKind = "thought" | "action" | "result" | "error";

export interface LogEntry {
  /** Время записи в ISO 8601. */
  time: string;
  kind: EntryKind;
  text: string;
}

export interface Run {
  id: string;
  agentId: string;
  /** Начало запуска в ISO 8601. */
  startedAt: string;
  /** Путь доски от корня проекта и карточка, над которой работал агент. */
  board?: string;
  cardId?: string;
  /** Название карточки на момент запуска — чтобы лог читался и после её переименования. */
  cardTitle?: string;
  entries: LogEntry[];
}

export function agentLogPath(agentId: string): string {
  return `${LOGS_DIR}/${agentId}.jsonl`;
}

/** Разбирает файл логов. Битые строки пропускаются, чтобы одна ошибка не прятала весь лог. */
export function parseRuns(text: string): Run[] {
  return text
    .split("\n")
    .filter((line) => line.trim())
    .flatMap((line) => {
      try {
        const run = JSON.parse(line);
        return run && typeof run.startedAt === "string" && Array.isArray(run.entries) ? [run as Run] : [];
      } catch {
        return [];
      }
    });
}

/** Запуски по карточке `cardId` доски `board`. */
export function runsForCard(runs: Run[], board: string, cardId: string): Run[] {
  return runs.filter((run) => run.board === board && run.cardId === cardId);
}

/** Сначала свежие запуски. */
export function newestFirst(runs: Run[]): Run[] {
  return [...runs].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}
