import { useCallback, useState } from "react";

import { api, type Entry } from "../api";
import { extensionOf, parentOf } from "../paths";
import { useDiskData } from "./useFsChanged";

/**
 * Имена записей из папки, где лежит `path`, которые подходят под `match`. Следит за диском.
 * `match` должен быть стабильным (из модуля или `useCallback`), иначе папка будет читаться заново.
 */
function useSiblings(path: string, match: (entry: Entry) => boolean): string[] {
  const [names, setNames] = useState<string[]>([]);

  const load = useCallback(async () => {
    try {
      const entries = await api.listDir(parentOf(path));
      setNames(entries.filter(match).map((e) => e.name));
    } catch {
      setNames([]);
    }
  }, [path, match]);

  useDiskData(load);

  return names;
}

/** Имена файлов с расширением `extension` из папки, где лежит `path`. */
export function useSiblingFiles(path: string, extension: string): string[] {
  const match = useCallback((e: Entry) => !e.is_dir && extensionOf(e.name) === extension, [extension]);
  return useSiblings(path, match);
}

const isDir = (e: Entry) => e.is_dir;

/** Имена папок, лежащих рядом с `path`. */
export function useSiblingFolders(path: string): string[] {
  return useSiblings(path, isDir);
}
