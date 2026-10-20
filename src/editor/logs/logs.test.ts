import { describe, expect, test } from "bun:test";

import { newestFirst, parseRuns, runsForCard, type Run } from "./logs";

const run = (id: string, startedAt: string, board?: string, cardId?: string): Run => ({
  id,
  agentId: "a1",
  startedAt,
  board,
  cardId,
  entries: [{ time: startedAt, kind: "thought", text: id }],
});

describe("логи агента", () => {
  test("файл — по запуску на строку, битые строки пропускаются", () => {
    const text = [JSON.stringify(run("r1", "2026-10-19T10:00:00Z")), "{ битая", "", JSON.stringify({ id: "x" })].join("\n");
    expect(parseRuns(text).map((r) => r.id)).toEqual(["r1"]);
  });

  test("логи карточки — только её запуски на её доске", () => {
    const runs = [
      run("r1", "2026-10-19T10:00:00Z", "b.kanban", "k1"),
      run("r2", "2026-10-19T11:00:00Z", "b.kanban", "k2"),
      run("r3", "2026-10-19T12:00:00Z", "other.kanban", "k1"),
    ];
    expect(runsForCard(runs, "b.kanban", "k1").map((r) => r.id)).toEqual(["r1"]);
  });

  test("свежие запуски сверху", () => {
    const runs = [run("old", "2026-10-18T10:00:00Z"), run("new", "2026-10-19T10:00:00Z")];
    expect(newestFirst(runs).map((r) => r.id)).toEqual(["new", "old"]);
  });
});
