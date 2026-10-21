import { FaMicrophone } from "react-icons/fa6";

import { cx } from "../../cx";
import { useVoiceInput, type VoiceState } from "./useVoiceInput";
import { VoiceWave } from "./VoiceWave";

/** Плашка внизу окна: что сейчас делает голосовой ввод. Пока он не нужен, её нет. */
export function VoiceIndicator() {
  const state = useVoiceInput();
  if (state.kind === "idle") return null;

  return (
    <div
      role="status"
      className={cx(
        "fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full border bg-panel px-4 py-2 text-[13px] shadow-lg",
        state.kind === "error" ? "border-danger text-danger" : "border-border text-text",
      )}
    >
      <FaMicrophone className={cx(state.kind === "recording" && "text-danger")} />
      {/* Волна показывает, слышит ли микрофон речь прямо сейчас. */}
      {state.kind === "recording" && <VoiceWave />}
      {describe(state)}
    </div>
  );
}

function describe(state: Exclude<VoiceState, { kind: "idle" }>): string {
  switch (state.kind) {
    case "recording":
      return `${state.hotkey}, пробел или Enter — закончить`;
    case "transcribing": {
      const { progress } = state;
      if (!progress) return "Распознаю речь…";
      const mb = (bytes: number) => Math.round(bytes / 1_000_000);
      const total = progress.total ? ` из ${mb(progress.total)}` : "";
      return `Скачиваю модель Whisper: ${mb(progress.downloaded)}${total} МБ`;
    }
    case "error":
      return state.message;
  }
}
