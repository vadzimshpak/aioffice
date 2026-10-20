import { useState } from "react";

import { Panel, PanelLayout } from "../Panel";
import { isInside, movedPath } from "../paths";
import { Explorer } from "./Explorer";
import { LogsView } from "./logs/LogsView";
import { OverlayContext, type Overlay } from "./navigation";
import { VisualizationView } from "./visualization/VisualizationView";
import { Workspace } from "./Workspace";

export function Editor() {
  const [openFile, setOpenFile] = useState<string | null>(null);
  // Логи и визуализация открываются вместо файла; «Назад» возвращает к нему.
  const [overlay, setOverlay] = useState<Overlay | null>(null);
  const back = () => setOverlay(null);

  const openFileFromExplorer = (path: string) => {
    setOverlay(null);
    setOpenFile(path);
  };
  const followMove = (from: string, to: string) =>
    setOpenFile((path) => path && movedPath(path, from, to));
  const closeIfDeleted = (deleted: string) =>
    setOpenFile((path) => (path && isInside(path, deleted) ? null : path));

  return (
    <PanelLayout>
      <Panel className="w-65 shrink-0">
        <Explorer onOpenFile={openFileFromExplorer} onMoved={followMove} onDeleted={closeIfDeleted} />
      </Panel>
      <Panel className="min-w-0 flex-1 bg-bg">
        <OverlayContext.Provider value={setOverlay}>
          {!overlay ? (
            <Workspace path={openFile} />
          ) : overlay.kind === "visualization" ? (
            <VisualizationView group={overlay.group} onBack={back} />
          ) : (
            <LogsView target={overlay} onBack={back} />
          )}
        </OverlayContext.Provider>
      </Panel>
    </PanelLayout>
  );
}
