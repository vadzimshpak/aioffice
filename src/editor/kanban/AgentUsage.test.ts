import { describe, expect, test } from "bun:test";

import { formatUsage } from "./AgentUsage";

describe("расход агента", () => {
  test("токены склоняются, а мелкие суммы не округляются до нуля", () => {
    expect(formatUsage({ tokens: 1, cost: 0 })).toBe("1 токен · $0");
    expect(formatUsage({ tokens: 3, cost: 0.004213 })).toBe("3 токена · $0.0042");
    expect(formatUsage({ tokens: 12345, cost: 1.5 }).replace(/\s/g, " ")).toBe("12 345 токенов · $1.50");
  });
});
