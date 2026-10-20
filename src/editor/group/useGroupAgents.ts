import { useCallback, useState } from "react";

import { api } from "../../api";
import { childPath, parentOf } from "../../paths";
import { useDiskData } from "../useFsChanged";
import { groupFormat, type Agent } from "./group";

/**
 * Агенты группы `groupName` (.group из папки файла `besidePath`) только для чтения.
 * null — группа не выбрана или её файл не читается. Следит за правками на диске.
 */
export function useGroupAgents(besidePath: string, groupName: string | undefined): Agent[] | null {
  const [agents, setAgents] = useState<Agent[] | null>(null);

  const load = useCallback(async () => {
    if (!groupName) return setAgents(null);
    try {
      const parsed = groupFormat.parse(await api.readFile(childPath(parentOf(besidePath), groupName)));
      setAgents("value" in parsed ? parsed.value.agents : null);
    } catch {
      setAgents(null);
    }
  }, [besidePath, groupName]);

  useDiskData(load);

  return agents;
}
