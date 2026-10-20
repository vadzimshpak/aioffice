import { describe, expect, test } from "bun:test";

import {
  addCard,
  addColumn,
  addComment,
  boardFormat,
  commentAuthorName,
  findCard,
  moveCard,
  moveColumn,
  removeCard,
  removeColumn,
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
  test("пустой файл — четыре столбца по умолчанию", () => {
    const parsed = boardFormat.parse("  \n");
    expect("value" in parsed && titles(parsed.value)).toEqual(["TODO", "Ожидание", "В прогрессе", "Готово"]);
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

  test("столбцы добавляются в конец и удаляются вместе с карточками", () => {
    let board = addColumn(boardWithCards(), "Архив");
    expect(titles(board).at(-1)).toBe("Архив");
    board = removeColumn(board, board.columns[0].id);
    expect(titles(board)).toEqual(["Ожидание", "В прогрессе", "Готово", "Архив"]);
    expect(board.columns.flatMap((c) => c.cards)).toEqual([]);
  });

  test("столбцы переставляются перед другим столбцом и в конец", () => {
    let board = boardWithCards();
    const [todo, waiting, , done] = board.columns.map((c) => c.id);
    board = moveColumn(board, done, waiting);
    expect(titles(board)).toEqual(["TODO", "Готово", "Ожидание", "В прогрессе"]);
    board = moveColumn(board, todo);
    expect(titles(board)).toEqual(["Готово", "Ожидание", "В прогрессе", "TODO"]);
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
