import { useState } from "react";

import { EditorFrame } from "../EditorFrame";
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
      {/* Без autoFocus: после клика по файлу фокус остаётся в Explorer, как в VS Code. */}
      {mode !== "preview" && (
        <textarea
          spellCheck={false}
          value={file.content ?? ""}
          onChange={(event) => file.edit(event.target.value)}
          className="min-w-0 flex-1 resize-none bg-bg p-4 font-mono text-[13px] leading-relaxed text-text outline-none select-text"
        />
      )}
      {mode === "split" && <div className="w-px shrink-0 bg-border" />}
      {mode !== "edit" && <MarkdownPreview source={file.content ?? ""} />}
    </EditorFrame>
  );
}
