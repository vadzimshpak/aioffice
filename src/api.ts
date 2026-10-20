// Единственное место, где интерфейс общается с Rust-частью приложения.

import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

/** Файл или папка проекта; путь идёт от корня проекта через «/». */
export interface Entry {
  name: string;
  path: string;
  is_dir: boolean;
}

/** Настройки приложения; ключ хранится в Связке ключей системы, не в файле. */
export interface Settings {
  language: string;
  /** Пустая строка — ключа нет. */
  openrouterApiKey: string;
}

export const api = {
  recentProjects: () => invoke<string[]>("recent_projects"),
  createProject: () => invoke<void>("create_project"),
  openProject: () => invoke<void>("open_project"),
  openRecent: (project: string) => invoke<void>("open_recent", { project }),
  currentProject: () => invoke<string | null>("current_project"),
  loadSettings: () => invoke<Settings>("load_settings"),
  saveSettings: (settings: Settings) => invoke<void>("save_settings", { settings }),

  listDir: (path: string) => invoke<Entry[]>("list_dir", { path }),
  createEntry: (parent: string, name: string, isDir: boolean, content = "") =>
    invoke<string>("create_entry", { parent, name, isDir, content }),
  moveEntry: (from: string, toDir: string) => invoke<string>("move_entry", { from, toDir }),
  /** Перемещает файл или папку в Корзину системы. */
  deleteEntry: (path: string) => invoke<void>("delete_entry", { path }),
  readFile: (path: string) => invoke<string>("read_file", { path }),
  writeFile: (path: string, content: string) => invoke<void>("write_file", { path, content }),

  /** Вызывает `callback`, когда в папке проекта что-то меняется на диске. */
  onFsChanged: (callback: () => void): Promise<UnlistenFn> => listen("fs-changed", callback),
};
