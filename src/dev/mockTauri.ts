// Подделка Rust-части для просмотра интерфейса в браузере (только при разработке).
// Хранит маленький проект в памяти и отвечает на те же команды, что и приложение.

import { mockIPC } from "@tauri-apps/api/mocks";

import type { Entry } from "../api";
import { childPath as join, isInside, movedPath, parentOf } from "../paths";

const project = "/Users/demo/Проекты/aioffice";
const recent = [project, "/Users/demo/Документы/Отчёт за квартал"];

// Папка -> имена внутри; у папок в конце «/».
const tree: Record<string, string[]> = {
  "": ["docs/", "src/", "README.md", "Команда.group", "Спринт.kanban"],
  docs: ["plan.md"],
  src: ["main.rs", "ui/"],
  "src/ui": ["window.rs"],
};

let settings = { language: "ru", openrouterApiKey: "" };

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
"Спринт.kanban": JSON.stringify({
    version: 1,
    group: "Команда.group",
    columns: [
      { id: "c1", title: "TODO", cards: [{ id: "k2", title: "Написать тексты", description: "", comments: [] }] },
      { id: "c2", title: "В прогрессе", cards: [{ id: "k1", title: "Сверстать макет", description: "", comments: [], assignee: "a1" }] },
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
      return;
    case "create_project":
    case "open_project":
    case "open_recent":
      console.info(`[mock] ${cmd}: здесь откроется окно редактора`, args);
      return;
  }
}, { shouldMockEvents: true });
