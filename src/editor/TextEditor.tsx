import { EditorFrame } from "./EditorFrame";
import { TextArea } from "./TextArea";
import { useFileContent } from "./useFileContent";

/** Редактор обычного текста (.txt): без разметки и режимов просмотра. */
export function TextEditor({ path }: { path: string }) {
  const file = useFileContent(path);

  return (
    <EditorFrame path={path} file={file}>
      <TextArea value={file.content ?? ""} onChange={file.edit} className="font-mono" />
    </EditorFrame>
  );
}
