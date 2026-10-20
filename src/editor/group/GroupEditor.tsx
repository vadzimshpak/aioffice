import { useState } from "react";
import { FaDiagramProject, FaPlus } from "react-icons/fa6";

import { Button } from "../../Button";

import { EditorFrame } from "../EditorFrame";
import { useJsonDocument } from "../jsonDocument";
import { useOpenOverlay } from "../navigation";
import { AgentDialog, type AgentDraft } from "./AgentDialog";
import { agentIcon } from "./agentIcons";
import { addAgent, groupFormat, updateAgent, type Agent, type NewAgent } from "./group";

const TILE = "flex h-36 flex-col items-center justify-center gap-2 rounded-xl border p-4";

/** Редактор группы агентов из файла .group: сетка карточек (клик — правка) и карточка «+» для нового агента. */
export function GroupEditor({ path }: { path: string }) {
  const { file, value: group, problem, change } = useJsonDocument(path, groupFormat);
  const [draft, setDraft] = useState<AgentDraft | null>(null);
  const openOverlay = useOpenOverlay();

  const save = (agent: NewAgent) => {
    if (draft?.kind === "edit") change((g) => updateAgent(g, draft.agent.id, agent));
    else change((g) => addAgent(g, agent));
    setDraft(null);
  };

  return (
    <EditorFrame
      path={path}
      file={file}
      problem={problem}
      actions={
        <Button
          className="flex h-6 items-center gap-1.5 rounded-md px-2"
          onClick={() => openOverlay({ kind: "visualization", group: path })}
        >
          <FaDiagramProject size={12} /> Визуализация
        </Button>
      }
    >
      <div className="min-w-0 flex-1 overflow-auto p-6">
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-4">
          {group?.agents.map((agent) => (
            <li key={agent.id}>
              <AgentTile agent={agent} onOpen={() => setDraft({ kind: "edit", agent })} />
            </li>
          ))}
          <li>
            <button
              type="button"
              title="Добавить агента"
              onClick={() => setDraft({ kind: "new" })}
              className={`${TILE} w-full cursor-pointer border-dashed border-border text-muted hover:border-accent hover:text-accent`}
            >
              <FaPlus size={24} />
              {group?.agents.length === 0 && <span className="text-[13px]">Добавить агента</span>}
            </button>
          </li>
        </ul>
      </div>

      <AgentDialog
        draft={draft}
        onSave={save}
        onOpenLogs={(agent) => {
          setDraft(null);
          openOverlay({ kind: "agent", agent });
        }}
        onClose={() => setDraft(null)}
      />
    </EditorFrame>
  );
}

function AgentTile({ agent, onOpen }: { agent: Agent; onOpen: () => void }) {
  const Icon = agentIcon(agent.icon);
  return (
    <button
      type="button"
      title="Изменить агента"
      onClick={onOpen}
      className={`${TILE} w-full cursor-pointer border-border bg-panel text-center hover:border-accent`}
    >
      <span className="grid size-12 place-items-center rounded-full bg-accent text-white">
        <Icon size={22} />
      </span>
      <h3 className="w-full truncate font-semibold">{agent.name}</h3>
      <p className="w-full truncate font-mono text-[11px] text-muted">{agent.model}</p>
    </button>
  );
}
