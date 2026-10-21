import { describe, expect, test } from "bun:test";

import { parseCommands } from "./MasterCommandsDialog";

describe("список команд мастера", () => {
  test("по команде на строку, без пустых строк и пробелов по краям", () => {
    expect(parseCommands("  npm test \n\n cargo build\r\n   ")).toEqual(["npm test", "cargo build"]);
    expect(parseCommands("")).toEqual([]);
  });
});
