import { projectName } from "../../paths";
import { OverlayFrame } from "../OverlayFrame";

/** Визуализация текущей работы агентов офиса. Пока пустая. */
export function VisualizationView({ group, onBack }: { group: string; onBack: () => void }) {
  const office = projectName(group).replace(/\.group$/i, "");
  return (
    <OverlayFrame title={`Визуализация · ${office}`} onBack={onBack}>
      <div className="min-h-0 flex-1" />
    </OverlayFrame>
  );
}
