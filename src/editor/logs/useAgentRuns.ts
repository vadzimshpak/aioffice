import { useCallback, useState } from "react";

import { api } from "../../api";
import { useDiskData } from "../useFsChanged";
import { agentLogPath, parseRuns, type Run } from "./logs";

/** Все запуски агентов `agentIds` из их файлов логов. Следит за диском: новые записи видны сразу. */
export function useAgentRuns(agentIds: string[]): Run[] {
  const [runs, setRuns] = useState<Run[]>([]);
  const key = agentIds.join(",");

  const load = useCallback(async () => {
    const perAgent = await Promise.all(
      key.split(",").filter(Boolean).map((id) =>
        api.readFile(agentLogPath(id)).then(parseRuns, () => []), // нет файла — агент ещё не запускался
      ),
    );
    setRuns(perAgent.flat());
  }, [key]);

  useDiskData(load);

  return runs;
}
