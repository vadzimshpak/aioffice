// Иконки, из которых выбирают иконку агента. Ключ хранится в файле .group.

import type { IconType } from "react-icons";
import {
  FaBrain,
  FaBug,
  FaChartLine,
  FaCode,
  FaFlask,
  FaHeadset,
  FaLanguage,
  FaLightbulb,
  FaMagnifyingGlass,
  FaPalette,
  FaPenNib,
  FaRobot,
  FaShield,
  FaTerminal,
  FaUserAstronaut,
  FaUserTie,
} from "react-icons/fa6";

export const AGENT_ICONS: Record<string, { icon: IconType; label: string }> = {
  robot: { icon: FaRobot, label: "Робот" },
  brain: { icon: FaBrain, label: "Мозг" },
  astronaut: { icon: FaUserAstronaut, label: "Астронавт" },
  manager: { icon: FaUserTie, label: "Менеджер" },
  code: { icon: FaCode, label: "Код" },
  terminal: { icon: FaTerminal, label: "Терминал" },
  bug: { icon: FaBug, label: "Отладка" },
  research: { icon: FaMagnifyingGlass, label: "Поиск" },
  analytics: { icon: FaChartLine, label: "Аналитика" },
  science: { icon: FaFlask, label: "Наука" },
  writer: { icon: FaPenNib, label: "Автор" },
  design: { icon: FaPalette, label: "Дизайн" },
  translator: { icon: FaLanguage, label: "Переводчик" },
  ideas: { icon: FaLightbulb, label: "Идеи" },
  support: { icon: FaHeadset, label: "Поддержка" },
  security: { icon: FaShield, label: "Безопасность" },
};

export const DEFAULT_AGENT_ICON = "robot";

/** Иконка по ключу; незнакомый ключ (например, из чужого файла) — робот. */
export function agentIcon(key: string): IconType {
  return (AGENT_ICONS[key] ?? AGENT_ICONS[DEFAULT_AGENT_ICON]).icon;
}
