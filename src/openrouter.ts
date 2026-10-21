// Каталог моделей OpenRouter. Список публичный: ключ для него не нужен.

const MODELS_URL = "https://openrouter.ai/api/v1/models";
const MILLION = 1_000_000;

export interface Model {
  /** Идентификатор для запросов, например `anthropic/claude-sonnet-5-5`. */
  id: string;
  /** Название для людей. */
  name: string;
  /** Цена в долларах за 1 000 000 токенов; нет поля — цена заранее не известна (например, у роутеров). */
  price?: { input: number; output: number };
}

/** Как модель приходит из API: цены в долларах за один токен, строками; «-1» — цена не известна. */
interface RawModel {
  id: string;
  name: string;
  pricing?: { prompt: string; completion: string };
}

/** Свежий список моделей OpenRouter: каталог меняется, поэтому каждый раз запрашивается заново. */
export async function fetchModels(): Promise<Model[]> {
  const response = await fetch(MODELS_URL);
  if (!response.ok) throw new Error(`OpenRouter ответил ${response.status}`);
  const { data } = (await response.json()) as { data: RawModel[] };
  return data.map(toModel).sort((a, b) => a.id.localeCompare(b.id));
}

export function toModel({ id, name, pricing }: RawModel): Model {
  const input = Number(pricing?.prompt) * MILLION;
  const output = Number(pricing?.completion) * MILLION;
  // NaN и отрицательная цена не проходят проверку.
  return input >= 0 && output >= 0 ? { id, name, price: { input, output } } : { id, name };
}

/** Подпись цены за 1 000 000 токенов: «$3 / $15», «бесплатно» или «цена не известна». */
export function formatPrice(price: Model["price"]): string {
  if (!price) return "цена не известна";
  if (price.input === 0 && price.output === 0) return "бесплатно";
  // Три значащие цифры убирают хвосты дробей вроде 3.0000000000000004.
  const usd = (n: number) => `$${Number(n.toPrecision(3))}`;
  return `${usd(price.input)} / ${usd(price.output)}`;
}

/** Модели, в id или названии которых есть все слова запроса, без учёта регистра. */
export function filterModels(models: Model[], query: string): Model[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return models.filter((model) => {
    const text = `${model.id} ${model.name}`.toLowerCase();
    return words.every((word) => text.includes(word));
  });
}
