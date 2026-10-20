import { createContext, useContext } from "react";

import type { Agent } from "./group/group";

/** Логи агента или логи карточки. */
export type LogsTarget =
  | { kind: "agent"; agent: Agent }
  | {
      kind: "card";
      /** Путь доски от корня проекта. */
      board: string;
      card: { id: string; title: string };
      /** Агенты группы доски: их логи просматриваются в поисках этой карточки. */
      agents: Agent[];
    };

/** Экран, который открывается вместо файла: логи или визуализация офиса (группы агентов). */
export type Overlay = LogsTarget | { kind: "visualization"; group: string };

/** Переход из редактора файла к другому экрану; «Назад» возвращает к файлу. */
export const OverlayContext = createContext<(overlay: Overlay) => void>(() => {});

export function useOpenOverlay() {
  return useContext(OverlayContext);
}
