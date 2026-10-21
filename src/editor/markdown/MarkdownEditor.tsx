import { useState } from "react";

import { EditorFrame } from "../EditorFrame";
import { TextArea } from "../TextArea";
import { useFileContent } from "../useFileContent";
import { MarkdownPreview } from "./MarkdownPreview";
import { ModeSwitch, loadMode, saveMode, type ViewMode } from "./ModeSwitch";

/** Редактор Markdown с тремя режимами, как в VS Code: код, просмотр и оба рядом. */
export function MarkdownEditor({ path }: { path: string }) {
  const file = useFileContent(path);
  const [mode, setMode] = useState<ViewMode>(loadMode);

  const changeMode = (next: ViewMode) => {
    setMode(next);
    saveMode(next);
  };

  return (
    <EditorFrame path={path} file={file} actions={<ModeSwitch mode={mode} onChange={changeMode} />}>
      {mode !== "preview" && <TextArea value={file.content ?? ""} onChange={file.edit} className="font-mono" />}
      {mode === "split" && <div className="w-px shrink-0 bg-border" />}
      {mode !== "edit" && <MarkdownPreview source={file.content ?? ""} />}
    </EditorFrame>
  );
}
