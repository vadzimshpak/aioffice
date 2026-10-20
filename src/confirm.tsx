import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

import { Button } from "./Button";
import { Modal } from "./Modal";

export interface ConfirmRequest {
  /** Вопрос, например «Удалить файл «a.md»?». */
  title: string;
  /** Что именно произойдёт. */
  detail?: string;
  /** Подпись кнопки действия. */
  action: string;
}

type Confirm = (request: ConfirmRequest) => Promise<boolean>;

const ConfirmContext = createContext<Confirm>(async () => false);

/** Спрашивает пользователя перед опасным действием; true — пользователь согласился. */
export function useConfirm(): Confirm {
  return useContext(ConfirmContext);
}

/** Одно окно подтверждения на всё окно приложения. */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<(ConfirmRequest & { resolve: (ok: boolean) => void }) | null>(null);

  const confirm = useCallback<Confirm>((request) => new Promise((resolve) => setPending({ ...request, resolve })), []);

  const finish = (ok: boolean) => {
    pending?.resolve(ok);
    setPending(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Modal open={pending !== null} onClose={() => finish(false)} className="w-100">
        {pending && (
          <div className="flex flex-col gap-3">
            <h2 className="text-base font-bold break-words">{pending.title}</h2>
            {pending.detail && <p className="text-[13px] text-muted">{pending.detail}</p>}
            <div className="mt-2 flex justify-end gap-2">
              {/* Фокус на «Отмене»: случайный Enter ничего не удалит. */}
              <Button data-autofocus className="h-9 px-4" onClick={() => finish(false)}>
                Отмена
              </Button>
              <Button variant="danger" className="h-9 px-4" onClick={() => finish(true)}>
                {pending.action}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </ConfirmContext.Provider>
  );
}
