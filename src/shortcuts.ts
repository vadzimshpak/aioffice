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

interface HotkeyEvent {
  key: string;
  code: string;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
}

const MODIFIER_KEYS = ["Control", "Alt", "Shift", "Meta"];

/**
 * Сочетание клавиш из нажатия, например `Ctrl+Shift+D`; `null`, пока нажаты только модификаторы.
 * Буквы и цифры берутся по физической клавише, поэтому сочетание не зависит от раскладки.
 */
export function hotkeyFromEvent(event: HotkeyEvent): string | null {
  if (MODIFIER_KEYS.includes(event.key)) return null;
  const key = /^(Key|Digit)./.test(event.code) ? event.code.slice(-1) : event.key.length === 1 ? event.key.toUpperCase() : event.key;
  const modifiers = [event.ctrlKey && "Ctrl", event.altKey && "Alt", event.shiftKey && "Shift", event.metaKey && "Cmd"];
  return [...modifiers.filter(Boolean), key].join("+");
}

/** Пробел или Enter без модификаторов: заканчивают голосовую запись. */
export function isStopKey(event: HotkeyEvent): boolean {
  const plain = !event.ctrlKey && !event.altKey && !event.shiftKey && !event.metaKey;
  return plain && (event.key === " " || event.key === "Enter");
}
