// Сочетания клавиш, общие для всего приложения.

interface KeyLike {
  key: string;
  metaKey: boolean;
  target: EventTarget | null;
}

const IS_MAC = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.userAgent);

/**
 * Удаление выбранного элемента: Cmd+Backspace на Mac, Delete на Windows и Linux.
 * В полях ввода не срабатывает: там эти клавиши стирают текст.
 */
export function isDeleteShortcut(event: KeyLike, mac = IS_MAC): boolean {
  if (isTyping(event.target)) return false;
  return mac ? event.metaKey && event.key === "Backspace" : event.key === "Delete";
}

/** Фокус в поле, где печатают текст. */
function isTyping(target: EventTarget | null): boolean {
  if (!target || typeof (target as HTMLElement).tagName !== "string") return false;
  const element = target as HTMLElement;
  return ["INPUT", "TEXTAREA", "SELECT"].includes(element.tagName) || element.isContentEditable;
}
