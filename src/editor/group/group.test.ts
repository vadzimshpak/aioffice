import { describe, expect, test } from "bun:test";

import { addAgent, groupFormat, updateAgent } from "./group";

describe("файл группы", () => {
  test("пустой файл — группа без агентов", () => {
    expect(groupFormat.parse("")).toEqual({ value: { version: 1, agents: [] } });
  });

  test("агенты добавляются в конец и переживают сохранение", () => {
    const parsed = groupFormat.parse("");
    if (!("value" in parsed)) throw new Error(parsed.error);
    let group = addAgent(parsed.value, { icon: "robot", name: "Аналитик", model: "claude-opus-5-5" });
    group = addAgent(group, { icon: "code", name: "Разработчик", model: "claude-sonnet-5-5" });
    expect(group.agents.map((a) => a.name)).toEqual(["Аналитик", "Разработчик"]);
    expect(new Set(group.agents.map((a) => a.id)).size).toBe(2);
    expect(groupFormat.parse(groupFormat.serialize(group))).toEqual({ value: group });
  });

  test("агента можно изменить, остальные не трогаются", () => {
    const parsed = groupFormat.parse("");
    if (!("value" in parsed)) throw new Error(parsed.error);
    let group = addAgent(parsed.value, { icon: "robot", name: "A", model: "m1" });
    group = addAgent(group, { icon: "code", name: "B", model: "m2" });
    const [a, b] = group.agents;
    group = updateAgent(group, a.id, { icon: "brain", name: "A2", model: "m3", skill: "# Скилл" });
    expect(group.agents).toEqual([{ id: a.id, icon: "brain", name: "A2", model: "m3", skill: "# Скилл" }, b]);
  });

  test("файл без списка агентов — ошибка", () => {
    expect("error" in groupFormat.parse('{"version": 1}')).toBe(true);
  });
});
