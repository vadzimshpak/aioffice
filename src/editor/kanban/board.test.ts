import { describe, expect, test } from "bun:test";

import {
  addCard,
  addColumn,
  addComment,
  boardFormat,
  commentAuthorName,
  columnOf,
  columnRole,
  spent,
  findCard,
  moveCard,
  moveColumn,
  removeCard,
  removeColumn,
  renameColumn,
  updateSettings,
  updateCard,
  type Board,
} from "./board";

const titles = (board: Board) => board.columns.map((c) => c.title);
const cardTitles = (board: Board, column: number) => board.columns[column].cards.map((c) => c.title);

function boardWithCards(): Board {
  const parsed = boardFormat.parse("");
  if (!("value" in parsed)) throw new Error(parsed.error);
  const todo = parsed.value.columns[0].id;
  return addCard(addCard(addCard(parsed.value, todo, "A"), todo, "B"), todo, "C");
}

describe("файл доски", () => {
  test("пустой файл — пять столбцов по умолчанию, с тестированием", () => {
    const parsed = boardFormat.parse("  \n");
    expect("value" in parsed && titles(parsed.value)).toEqual(["TODO", "Ожидание", "В прогрессе", "Тестирование", "Готово"]);
  });

  test("доска переживает сохранение и чтение", () => {
    const board = boardWithCards();
    expect(boardFormat.parse(boardFormat.serialize(board))).toEqual({ value: board });
  });

  test("битый файл — ошибка, а не пустая доска", () => {
    expect("error" in boardFormat.parse("{ нет")).toBe(true);
    expect("error" in boardFormat.parse('{"cards": []}')).toBe(true);
  });
});

describe("изменения доски", () => {
  test("группа и мастер-агент назначаются и снимаются независимо", () => {
    let board = updateSettings(boardWithCards(), { group: "team.group", orchestrator: "a1" });
    expect([board.group, board.orchestrator]).toEqual(["team.group", "a1"]);
    board = updateSettings(board, { orchestrator: undefined });
    expect("orchestrator" in board).toBe(false);
    expect(board.group).toBe("team.group");
  });

  test("рабочая папка назначается и снимается, не трогая группу", () => {
    let board = updateSettings(boardWithCards(), { group: "team.group", workdir: "site" });
    expect(board.workdir).toBe("site");
    board = updateSettings(board, { workdir: undefined });
    expect("workdir" in board).toBe(false);
    expect(board.group).toBe("team.group");
  });

  test("новый столбец встаёт перед «Готово», обычный удаляется вместе с карточками", () => {
    let board = addColumn(boardWithCards(), "Архив");
    expect(titles(board).slice(-2)).toEqual(["Архив", "Готово"]);
    board = moveCard(board, board.columns[0].cards[0].id, board.columns[1].id);
    board = removeColumn(board, board.columns[1].id);
    expect(titles(board)).toEqual(["TODO", "В прогрессе", "Тестирование", "Архив", "Готово"]);
    expect(board.columns.flatMap((c) => c.cards)).toHaveLength(2);
  });

  test("обязательные столбцы нельзя удалить, даже переименованные", () => {
    const board = boardWithCards();
    const [todo, done] = [board.columns[0], board.columns.at(-1)!];
    expect([todo.role, done.role]).toEqual(["todo", "done"]);
    const renamed = { ...board, columns: board.columns.map((c) => (c.id === done.id ? { ...c, title: "Ready" } : c)) };
    expect(removeColumn(renamed, done.id)).toBe(renamed);
    expect(removeColumn(renamed, todo.id)).toBe(renamed);
  });

  test("у старой доски без ролей обязательны первый и последний столбцы, и они не съезжают", () => {
    const legacy: Board = {
      version: 1,
      columns: ["Backlog", "Работа", "Ready"].map((title, i) => ({ id: `c${i}`, title, cards: [] })),
    };
    expect([columnRole(legacy, "c0"), columnRole(legacy, "c1"), columnRole(legacy, "c2")]).toEqual(["todo", undefined, "done"]);
    const added = addColumn(legacy, "Новый");
    expect(titles(added)).toEqual(["Backlog", "Работа", "Новый", "Ready"]);
    expect(columnRole(added, "c2")).toBe("done");
  });

  test("столбцы переставляются перед другим столбцом и в конец", () => {
    let board = boardWithCards();
    const [todo, waiting, , , done] = board.columns.map((c) => c.id);
    board = moveColumn(board, done, waiting);
    expect(titles(board)).toEqual(["TODO", "Готово", "Ожидание", "В прогрессе", "Тестирование"]);
    board = moveColumn(board, todo);
    expect(titles(board)).toEqual(["Готово", "Ожидание", "В прогрессе", "Тестирование", "TODO"]);
    expect(board.columns.at(-1)?.cards.length).toBe(3);
  });

  test("карточку можно изменить и удалить", () => {
    let board = boardWithCards();
    const b = board.columns[0].cards[1].id;
    board = updateCard(board, b, { title: "B2", description: "текст" });
    expect(findCard(board, b)).toMatchObject({ title: "B2", description: "текст" });
    board = updateCard(board, b, { assignee: "agent-1" });
    expect(findCard(board, b)?.assignee).toBe("agent-1");
    board = updateCard(board, b, { assignee: undefined });
    expect(JSON.parse(boardFormat.serialize(board)).columns[0].cards[1]).not.toHaveProperty("assignee");
    board = removeCard(board, b);
    expect(cardTitles(board, 0)).toEqual(["A", "C"]);
  });

  test("карточка переносится в другой столбец и на место в своём", () => {
    let board = boardWithCards();
    const [a, , c] = board.columns[0].cards.map((card) => card.id);
    board = moveCard(board, a, board.columns[2].id);
    expect(cardTitles(board, 0)).toEqual(["B", "C"]);
    expect(cardTitles(board, 2)).toEqual(["A"]);
    board = moveCard(board, c, board.columns[0].id, board.columns[0].cards[0].id);
    expect(cardTitles(board, 0)).toEqual(["C", "B"]);
  });

  test("комментарии копятся с датой", () => {
    let board = boardWithCards();
    const a = board.columns[0].cards[0].id;
    board = addComment(board, a, "первый", new Date("2026-10-19T10:00:00Z"));
    board = addComment(board, a, "второй");
    expect(findCard(board, a)?.comments.map((c) => c.text)).toEqual(["первый", "второй"]);
    expect(findCard(board, a)?.comments[0].createdAt).toBe("2026-10-19T10:00:00.000Z");
  });

  test("автор комментария: админ, агент группы или бот по имени", () => {
    const agents = [{ id: "a1", icon: "code", name: "Разработчик", model: "m" }];
    const at = "2026-10-19T10:00:00.000Z";
    expect(commentAuthorName({ id: "1", text: "", createdAt: at }, agents)).toBe("Админ");
    expect(commentAuthorName({ id: "2", text: "", createdAt: at, author: "a1" }, agents)).toBe("Разработчик");
    expect(commentAuthorName({ id: "3", text: "", createdAt: at, author: "CI-бот" }, null)).toBe("CI-бот");
  });
});

describe("этап карточки", () => {
  test("этап — столбец, в котором лежит карточка", () => {
    const board = boardWithCards();
    const card = board.columns[0].cards[1];
    expect(columnOf(board, card.id)?.title).toBe("TODO");
    expect(columnOf(board, "нет")).toBeUndefined();
  });
});

describe("расход доски", () => {
  test("складывается из карточек и мастера", () => {
    const board = boardWithCards();
    board.columns[0].cards[0].agentUsage = { tokens: 1, cost: 0.5 };
    board.columns[0].cards[2].agentUsage = { tokens: 1, cost: 0.25 };
    expect(spent(board)).toBe(0.75);
    expect(spent({ ...board, masterUsage: { tokens: 1, cost: 0.25 } })).toBe(1);
  });
});

describe("переименование столбца", () => {
  test("меняет название, но не роль; пустое название не принимается", () => {
    const board = boardWithCards();
    const done = board.columns.at(-1)!;
    const renamed = renameColumn(board, done.id, "  Ready  ");
    expect(renamed.columns.at(-1)).toMatchObject({ title: "Ready", role: "done" });
    expect(renameColumn(board, done.id, "   ")).toBe(board);
  });
});
