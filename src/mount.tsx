import { StrictMode, type ReactNode } from "react";
import { createRoot } from "react-dom/client";

import { ConfirmProvider } from "./confirm";

import "./styles/app.css";

/**
 * Отрисовывает окно в #root. В обычном браузере во время разработки
 * подключает подделку Tauri, чтобы интерфейс можно было смотреть без приложения.
 */
export async function mount(app: ReactNode) {
  if (import.meta.env.DEV && !("__TAURI_INTERNALS__" in window)) {
    await import("./dev/mockTauri");
  }
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <ConfirmProvider>{app}</ConfirmProvider>
    </StrictMode>,
  );
}
