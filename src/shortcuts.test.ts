import { describe, expect, test } from "bun:test";

import { isDeleteShortcut } from "./shortcuts";

const key = (key: string, metaKey = false, tagName = "DIV") => ({
  key,
  metaKey,
  target: { tagName, isContentEditable: false } as unknown as EventTarget,
});

describe("шорткат удаления", () => {
  test("на Mac — Cmd+Backspace", () => {
    expect(isDeleteShortcut(key("Backspace", true), true)).toBe(true);
    expect(isDeleteShortcut(key("Backspace"), true)).toBe(false);
    expect(isDeleteShortcut(key("Delete"), true)).toBe(false);
  });

  test("на Windows и Linux — Delete", () => {
    expect(isDeleteShortcut(key("Delete"), false)).toBe(true);
    expect(isDeleteShortcut(key("Backspace", true), false)).toBe(false);
  });

  test("в полях ввода не срабатывает", () => {
    expect(isDeleteShortcut(key("Backspace", true, "INPUT"), true)).toBe(false);
    expect(isDeleteShortcut(key("Delete", false, "TEXTAREA"), false)).toBe(false);
  });
});
