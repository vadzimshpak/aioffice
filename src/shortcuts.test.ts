import { describe, expect, test } from "bun:test";

import { hotkeyFromEvent, isDeleteShortcut, isStopKey } from "./shortcuts";

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

const press = (key: string, code: string, mods: { ctrl?: boolean; alt?: boolean; shift?: boolean; meta?: boolean } = {}) => ({
  key,
  code,
  ctrlKey: !!mods.ctrl,
  altKey: !!mods.alt,
  shiftKey: !!mods.shift,
  metaKey: !!mods.meta,
});

describe("сочетание клавиш из нажатия", () => {
  test("не зависит от раскладки: Ctrl+в на русской — это Ctrl+D", () => {
    expect(hotkeyFromEvent(press("в", "KeyD", { ctrl: true }))).toBe("Ctrl+D");
    expect(hotkeyFromEvent(press("d", "KeyD", { ctrl: true }))).toBe("Ctrl+D");
  });

  test("модификаторы идут в постоянном порядке, а одни модификаторы — ещё не сочетание", () => {
    expect(hotkeyFromEvent(press("!", "Digit1", { shift: true, ctrl: true, alt: true, meta: true }))).toBe("Ctrl+Alt+Shift+Cmd+1");
    expect(hotkeyFromEvent(press("F2", "F2"))).toBe("F2");
    expect(hotkeyFromEvent(press("Control", "ControlLeft", { ctrl: true }))).toBeNull();
  });
});

describe("клавиши остановки записи", () => {
  test("пробел и Enter без модификаторов", () => {
    expect(isStopKey(press(" ", "Space"))).toBe(true);
    expect(isStopKey(press("Enter", "Enter"))).toBe(true);
    expect(isStopKey(press("Enter", "Enter", { ctrl: true }))).toBe(false);
    expect(isStopKey(press("d", "KeyD"))).toBe(false);
  });
});
