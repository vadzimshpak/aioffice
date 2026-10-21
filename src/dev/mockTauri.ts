// Подделка Rust-части для просмотра интерфейса в браузере (только при разработке).
// Хранит маленький проект в памяти и отвечает на те же команды, что и приложение.

import { emit } from "@tauri-apps/api/event";
import { mockIPC } from "@tauri-apps/api/mocks";

import type { Entry } from "../api";
import { childPath as join, isInside, movedPath, parentOf } from "../paths";

const project = "/Users/demo/Проекты/aioffice";
const recent = [project, "/Users/demo/Документы/Отчёт за квартал"];

// Папка -> имена внутри; у папок в конце «/».
const tree: Record<string, string[]> = {
  "": ["docs/", "src/", "README.md", "Заметки.txt", "Команда.group", "Спринт.kanban"],
  docs: ["plan.md"],
  src: ["main.rs", "ui/"],
  "src/ui": ["window.rs"],
};

let settings = { language: "ru", openrouterApiKey: "", voiceHotkey: "Ctrl+D", whisperModel: "tiny" };

let levelTimer: ReturnType<typeof setInterval> | undefined;

const voiceModels = [
  { id: "tiny", title: "Tiny — быстрая, для простых фраз", sizeMb: 75, downloaded: true },
  { id: "base", title: "Base — быстрая, точнее Tiny", sizeMb: 142, downloaded: false },
  { id: "small", title: "Small — заметно точнее, медленнее", sizeMb: 466, downloaded: false },
  { id: "medium", title: "Medium — высокая точность, медленная", sizeMb: 1500, downloaded: false },
  { id: "large-v3-turbo", title: "Large v3 Turbo — самая точная", sizeMb: 1600, downloaded: false },
];

// Путь файла -> его текст.
let contents: Record<string, string> = {
  "README.md": [
    "# AIOffice",
    "",
    "Приложение для **документов** и _канбан-досок_.",
    "",
    "## Задачи",
    "",
    "- [x] Explorer",
    "- [ ] Канбан",
    "",
    "| Режим | Что видно |",
    "| --- | --- |",
    "| Код | только текст |",
    "| Просмотр | только результат |",
    "",
    "```rust",
    'fn main() { println!("hello"); }',
    "```",
  ].join("\n"),
  "docs/plan.md": "# План\n\n1. Редактор Markdown\n2. Канбан\n",
  "Заметки.txt": "Купить молоко.\nПозвонить дизайнеру.\n",
"Спринт.kanban": JSON.stringify({
    version: 1,
    group: "Команда.group",
    orchestrator: "a1",
    budget: 5,
    columns: [
      { id: "c1", title: "TODO", role: "todo", cards: [{ id: "k2", title: "Написать тексты", description: "", comments: [] }] },
      { id: "c2", title: "В прогрессе", cards: [{ id: "k1", title: "Сверстать макет", description: "", comments: [], assignee: "a1" }] },
      { id: "c3", title: "Готово", role: "done", cards: [{ id: "k3", title: "Собрать бриф", description: "", comments: [] }] },
    ],
  }),
  ".aioffice/logs/a1.jsonl": [
    { id: "r1", startedAt: "2026-10-19T09:00:00Z", cardId: "k1", cardTitle: "Сверстать макет", entries: [
      { time: "2026-10-19T09:00:01Z", kind: "thought", text: "Нужно понять, какие блоки есть в макете." },
      { time: "2026-10-19T09:00:05Z", kind: "action", text: "Открыл docs/plan.md" },
      { time: "2026-10-19T09:01:10Z", kind: "result", text: "Свёрстана шапка и подвал." },
    ] },
    { id: "r2", startedAt: "2026-10-19T11:30:00Z", cardId: "k2", cardTitle: "Написать тексты", entries: [
      { time: "2026-10-19T11:30:02Z", kind: "thought", text: "Тексты для главной страницы." },
      { time: "2026-10-19T11:31:00Z", kind: "error", text: "Не найден файл с брифом." },
    ] },
  ].map((run) => JSON.stringify({ agentId: "a1", board: "Спринт.kanban", ...run })).join("\n"),
    "Команда.group": JSON.stringify({ version: 1, agents: [{ id: "a1", icon: "code", name: "Разработчик", model: "claude-sonnet-5-5" }] }),
};

const baseName = (path: string) => path.split("/").pop()!;

function list(dir: string): Entry[] {
  if (!(dir in tree)) throw "папка не найдена";
  return tree[dir]
    .map((raw) => {
      const is_dir = raw.endsWith("/");
      const name = is_dir ? raw.slice(0, -1) : raw;
      return { name, path: join(dir, name), is_dir };
    })
    .sort((a, b) => Number(b.is_dir) - Number(a.is_dir) || a.name.localeCompare(b.name));
}

function create(parent: string, name: string, isDir: boolean, content: string): string {
  const path = join(parent, name);
  if (list(parent).some((e) => e.name === name)) throw `«${name}» уже существует`;
  tree[parent].push(isDir ? `${name}/` : name);
  if (isDir) tree[path] = [];
  else contents[path] = content;
  return path;
}

function move(from: string, toDir: string): string {
  if (toDir === from || toDir.startsWith(`${from}/`)) throw "нельзя переместить папку внутрь неё самой";
  const name = baseName(from);
  const parent = parentOf(from);
  const index = tree[parent].findIndex((raw) => raw.replace(/\/$/, "") === name);
  const [raw] = tree[parent].splice(index, 1);
  tree[toDir].push(raw);
  const target = join(toDir, name);
  for (const key of Object.keys(tree)) {
    if (key === from || key.startsWith(`${from}/`)) {
      tree[target + key.slice(from.length)] = tree[key];
      delete tree[key];
    }
  }
  contents = Object.fromEntries(Object.entries(contents).map(([path, text]) => [movedPath(path, from, target), text]));
  return target;
}

function remove(path: string) {
  const parent = parentOf(path);
  tree[parent] = tree[parent].filter((raw) => raw.replace(/\/$/, "") !== baseName(path));
  for (const key of Object.keys(tree)) if (isInside(key, path)) delete tree[key];
  for (const key of Object.keys(contents)) if (isInside(key, path)) delete contents[key];
}

/** Меняет статус агента на карточке доски и, если нужно, переносит её в последний столбец. */
function setAgent(board: string, cardId: string, state: string, finish = false) {
  const data = JSON.parse(contents[board]);
  const columns: { cards: { id: string; agentState?: string }[] }[] = data.columns;
  const from = columns.find((c) => c.cards.some((card) => card.id === cardId));
  const card = from?.cards.find((c) => c.id === cardId);
  if (!from || !card) return;
  card.agentState = state;
  // Каждый шаг агента что-то стоит.
  const usage = (card as { agentUsage?: { tokens: number; cost: number } }).agentUsage ?? { tokens: 0, cost: 0 };
  (card as { agentUsage?: unknown }).agentUsage = { tokens: usage.tokens + 1842, cost: usage.cost + 0.0123 };
  if (finish) {
    from.cards = from.cards.filter((c) => c !== card);
    columns.at(-1)!.cards.push(card);
  }
  contents[board] = JSON.stringify(data, null, 2);
  void emit("fs-changed");
}

/** Статус обхода мастера на доске; каждый обход что-то стоит. */
function setMaster(board: string, state: string) {
  const data = JSON.parse(contents[board]);
  data.masterState = state;
  const usage = data.masterUsage ?? { tokens: 0, cost: 0 };
  data.masterUsage = { tokens: usage.tokens + 950, cost: usage.cost + 0.004 };
  contents[board] = JSON.stringify(data, null, 2);
  void emit("fs-changed");
}

mockIPC((cmd, args) => {
  const a = args as Record<string, string & boolean>;
  switch (cmd) {
    case "recent_projects":
      return recent;
    case "current_project":
      return project;
    case "list_dir":
      return list(a.path);
    case "create_entry":
      return create(a.parent, a.name, a.isDir, a.content);
    case "move_entry":
      return move(a.from, a.toDir);
    case "delete_entry":
      return remove(a.path);
    case "read_file":
      if (!(a.path in contents)) throw "файл не найден";
      return contents[a.path];
    case "write_file":
      if (!(a.path in contents)) throw `файла «${a.path}» больше нет`;
      contents[a.path] = a.content;
      return;
    case "load_settings":
      return settings;
    case "save_settings":
      settings = (args as { settings: typeof settings }).settings;
      void emit("settings-changed");
      return;
    case "voice_models":
      return voiceModels;
    case "download_voice_model":
      return new Promise<void>((done) =>
        setTimeout(() => {
          voiceModels.find((m) => m.id === a.id)!.downloaded = true;
          done();
        }, 1500),
      );
    case "start_recording":
      // Похоже на речь: громкость то растёт, то падает.
      levelTimer = setInterval(() => void emit("voice-level", Math.abs(Math.sin(Date.now() / 300)) * 0.15 * Math.random()), 33);
      return;
    case "stop_recording":
      clearInterval(levelTimer);
      return new Promise((done) => setTimeout(() => done("Пример распознанной речи."), 800));
    case "stop_agent":
      setAgent(a.board, a.cardId, "error");
      return;
    case "run_master":
      setMaster(a.board, "running");
      setTimeout(() => setMaster(a.board, "done"), 2500);
      return;
    case "stop_master":
      setMaster(a.board, "error");
      return;
    case "create_project":
    case "open_project":
    case "open_recent":
      console.info(`[mock] ${cmd}: здесь откроется окно редактора`, args);
      return;
    case "plugin:opener|open_url":
      window.open(a.url, "_blank", "noopener");
      return;
  }
}, { shouldMockEvents: true });
