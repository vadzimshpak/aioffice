import { projectName } from "../../paths";
import { OverlayFrame } from "../OverlayFrame";

/** Визуализация текущей работы агентов: всего проекта или одной группы. Пока пустая. */
export function VisualizationView({ group, onBack }: { group?: string; onBack: () => void }) {
  const title = group ? `Визуализация · ${projectName(group).replace(/\.group$/i, "")}` : "Визуализация";
  return (
    <OverlayFrame title={title} onBack={onBack}>
      <div className="min-h-0 flex-1" />
    </OverlayFrame>
  );
}
