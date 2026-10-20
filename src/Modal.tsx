import { useEffect, useRef, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";

import { cx } from "./cx";

interface Props {
  open: boolean;
  /** Окно закрыли без действия: Esc или клик по затемнённому фону. */
  onClose: () => void;
  className?: string;
  /** Внутренний отступ окна. Без него содержимое (например, цветное меню) прилегает к рамке. */
  padded?: boolean;
  /** Клавиши внутри окна, включая само окно, когда фокус на нём. */
  onKeyDown?: (event: KeyboardEvent) => void;
  children: ReactNode;
}

/** Модальное окно поверх всего приложения. */
export function Modal({ open, onClose, className, padded = true, onKeyDown, children }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (!open) return element.close();
    element.showModal();
    // Браузер сам ставит фокус на первую кнопку и рисует вокруг неё рамку фокуса.
    // Вместо этого фокус получает поле с data-autofocus, а без него — само окно.
    (element.querySelector<HTMLElement>("[data-autofocus]") ?? element).focus();
  }, [open]);

  const closeOnBackdrop = (event: MouseEvent<HTMLDialogElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const outside =
      event.clientX < box.left || event.clientX > box.right ||
      event.clientY < box.top || event.clientY > box.bottom;
    if (event.target === event.currentTarget && outside) onClose();
  };

  return (
    <dialog
      ref={dialog}
      tabIndex={-1}
      className={cx(
        "m-auto rounded-xl border border-border bg-bg text-text outline-none",
        // Без отступа содержимое обрезается по скруглённым углам рамки.
        padded ? "p-5" : "overflow-hidden",
        className,
      )}
      // Esc закрывает окно сам браузер; сообщаем об этом, если окно ещё считается открытым.
      onClose={() => open && onClose()}
      onClick={closeOnBackdrop}
      onKeyDown={onKeyDown}
    >
      {open && children}
    </dialog>
  );
}
