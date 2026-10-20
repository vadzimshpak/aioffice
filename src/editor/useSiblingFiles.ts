import { useCallback, useState } from "react";

import { api } from "../api";
import { extensionOf, parentOf } from "../paths";
import { useDiskData } from "./useFsChanged";

/** Имена файлов с расширением `extension` из папки, где лежит `path`. Следит за диском. */
export function useSiblingFiles(path: string, extension: string): string[] {
  const [names, setNames] = useState<string[]>([]);

  const load = useCallback(async () => {
    try {
      const entries = await api.listDir(parentOf(path));
      setNames(entries.filter((e) => !e.is_dir && extensionOf(e.name) === extension).map((e) => e.name));
    } catch {
      setNames([]);
    }
  }, [path, extension]);

  useDiskData(load);

  return names;
}
