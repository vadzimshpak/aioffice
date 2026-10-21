// Единственное место, где интерфейс общается с Rust-частью приложения.

import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";

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
  /** Сочетание клавиш голосового ввода, например `Ctrl+D`. */
  voiceHotkey: string;
  /** id модели Whisper из `voiceModels()`. */
  whisperModel: string;
}

/** Модель Whisper для голосового ввода. */
export interface VoiceModel {
  id: string;
  title: string;
  sizeMb: number;
  downloaded: boolean;
}

/** Ход скачивания модели Whisper; `total` нет, если сервер не сообщил размер. */
export interface VoiceModelProgress {
  id: string;
  downloaded: number;
  total: number | null;
}

export const api = {
  recentProjects: () => invoke<string[]>("recent_projects"),
  createProject: () => invoke<void>("create_project"),
  openProject: () => invoke<void>("open_project"),
  openRecent: (project: string) => invoke<void>("open_recent", { project }),
  currentProject: () => invoke<string | null>("current_project"),
  loadSettings: () => invoke<Settings>("load_settings"),
  saveSettings: (settings: Settings) => invoke<void>("save_settings", { settings }),
  /** Открывает адрес в браузере системы. */
  openUrl: (url: string) => openUrl(url),
  /** Вызывает `callback`, когда в любом окне сохранили настройки. */
  onSettingsChanged: (callback: () => void): Promise<UnlistenFn> => listen("settings-changed", callback),

  voiceModels: () => invoke<VoiceModel[]>("voice_models"),
  downloadVoiceModel: (id: string) => invoke<void>("download_voice_model", { id }),
  onVoiceModelProgress: (callback: (progress: VoiceModelProgress) => void): Promise<UnlistenFn> =>
    listen<VoiceModelProgress>("voice-model-progress", (event) => callback(event.payload)),
  startRecording: () => invoke<void>("start_recording"),
  /** Громкость микрофона от 0 до 1, пока идёт запись; примерно 30 раз в секунду. */
  onVoiceLevel: (callback: (level: number) => void): Promise<UnlistenFn> =>
    listen<number>("voice-level", (event) => callback(event.payload)),
  /** Останавливает запись и возвращает распознанный текст; модель скачивается, если её ещё нет. */
  stopRecording: () => invoke<string>("stop_recording"),

  listDir: (path: string) => invoke<Entry[]>("list_dir", { path }),
  createEntry: (parent: string, name: string, isDir: boolean, content = "") =>
    invoke<string>("create_entry", { parent, name, isDir, content }),
  moveEntry: (from: string, toDir: string) => invoke<string>("move_entry", { from, toDir }),
  /** Перемещает файл или папку в Корзину системы. */
  deleteEntry: (path: string) => invoke<void>("delete_entry", { path }),
  readFile: (path: string) => invoke<string>("read_file", { path }),
  writeFile: (path: string, content: string) => invoke<void>("write_file", { path, content }),

  /** Останавливает агента после текущего шага; если он не работает — снимает зависший статус. */
  stopAgent: (board: string, cardId: string) => invoke<void>("stop_agent", { board, cardId }),
  /** Запускает один обход доски мастер-агентом; если обход уже идёт, ничего не делает. */
  runMaster: (board: string) => invoke<void>("run_master", { board }),
  /** Останавливает обход мастера; если он не идёт — снимает зависший статус. */
  stopMaster: (board: string) => invoke<void>("stop_master", { board }),

  /** Вызывает `callback`, когда в папке проекта что-то меняется на диске. */
  onFsChanged: (callback: () => void): Promise<UnlistenFn> => listen("fs-changed", callback),
};
