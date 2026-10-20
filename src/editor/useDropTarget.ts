import { useState, type DragEvent } from "react";

/** Тип данных при перетаскивании элемента дерева; значение — его путь. */
export const DRAG_TYPE = "application/x-aioffice-path";

/** Делает элемент местом, куда можно бросить файл или папку из дерева. */
export function useDropTarget(targetDir: string, onMove: (from: string, toDir: string) => void) {
  const [active, setActive] = useState(false);

  const handlers = {
    onDragOver(event: DragEvent) {
      if (!event.dataTransfer.types.includes(DRAG_TYPE)) return;
      event.preventDefault();
      event.stopPropagation();
      event.dataTransfer.dropEffect = "move";
      setActive(true);
    },
    onDragLeave() {
      setActive(false);
    },
    onDrop(event: DragEvent) {
      event.preventDefault();
      event.stopPropagation();
      setActive(false);
      const from = event.dataTransfer.getData(DRAG_TYPE);
      if (from) onMove(from, targetDir);
    },
  };

  return { active, handlers };
}
