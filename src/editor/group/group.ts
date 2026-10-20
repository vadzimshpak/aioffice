// Группа агентов: формат файла .group (JSON) и изменения группы.

import { jsonFormat } from "../jsonDocument";

export interface Agent {
  id: string;
  /** Ключ иконки из AGENT_ICONS. */
  icon: string;
  name: string;
  model: string;
  /** Текст скилла агента; в файлах, созданных до появления поля, его нет. */
  skill?: string;
}

export interface Group {
  version: 1;
  agents: Agent[];
}

export type NewAgent = Omit<Agent, "id">;

/** Модели, которые предлагаются при вводе; можно вписать и любую другую. */
export const SUGGESTED_MODELS = ["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5", "claude-fable-5-1"];

export function emptyGroup(): Group {
  return { version: 1, agents: [] };
}

/** Формат файла .group; пустой файл — пустая группа. */
export const groupFormat = jsonFormat<Group>(emptyGroup, (data) =>
  Array.isArray(data?.agents) || "в файле нет списка агентов",
);

export function addAgent(group: Group, agent: NewAgent): Group {
  return { ...group, agents: [...group.agents, { id: crypto.randomUUID(), ...agent }] };
}

export function updateAgent(group: Group, id: string, agent: NewAgent): Group {
  return { ...group, agents: group.agents.map((a) => (a.id === id ? { id, ...agent } : a)) };
}
