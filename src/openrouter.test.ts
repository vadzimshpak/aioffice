import { describe, expect, test } from "bun:test";

import { filterModels, formatPrice, toModel } from "./openrouter";

describe("цена модели", () => {
  test("цена за токен пересчитывается в доллары за миллион токенов", () => {
    const model = toModel({ id: "a/b", name: "B", pricing: { prompt: "0.000003", completion: "0.000015" } });
    expect(formatPrice(model.price)).toBe("$3 / $15");
  });

  test("бесплатные и модели без известной цены подписываются словами", () => {
    expect(formatPrice(toModel({ id: "a/free", name: "F", pricing: { prompt: "0", completion: "0" } }).price)).toBe("бесплатно");
    expect(toModel({ id: "a/auto", name: "A", pricing: { prompt: "-1", completion: "-1" } }).price).toBeUndefined();
    expect(toModel({ id: "a/none", name: "N" }).price).toBeUndefined();
    expect(formatPrice(undefined)).toBe("цена не известна");
  });
});

const models = [
  { id: "anthropic/claude-sonnet-5-5", name: "Anthropic: Claude Sonnet 5.5" },
  { id: "openai/gpt-6", name: "OpenAI: GPT-6" },
];

describe("фильтр моделей", () => {
  test("пустой запрос оставляет все модели", () => {
    expect(filterModels(models, "  ")).toEqual(models);
  });

  test("ищет по id и названию без учёта регистра, все слова сразу", () => {
    expect(filterModels(models, "CLAUDE")).toEqual([models[0]]);
    expect(filterModels(models, "openai gpt")).toEqual([models[1]]);
    expect(filterModels(models, "claude gpt")).toEqual([]);
  });
});
