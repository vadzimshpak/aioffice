import { describe, expect, test } from "bun:test";

import { barHeight } from "./VoiceWave";

describe("высота столбика волны", () => {
  test("тишина плоская, обычная речь заметна, громкий звук упирается в потолок", () => {
    expect(barHeight(0)).toBe(0);
    expect(barHeight(0.04)).toBeCloseTo(0.5);
    expect(barHeight(0.5)).toBe(1);
    expect(barHeight(-1)).toBe(0);
  });
});
