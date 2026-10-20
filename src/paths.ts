/** Корень проекта в путях Explorer. */
export const ROOT = "";

/** Имя проекта — последняя часть его пути. */
export function projectName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
}

/** Расширение с точкой в нижнем регистре; у «.gitignore» и имён без точки — пустое. */
export function extensionOf(path: string): string {
  const name = path.slice(path.lastIndexOf("/") + 1);
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot).toLowerCase() : "";
}

/** `path` — это `dir` или что-то внутри него. */
export function isInside(path: string, dir: string): boolean {
  return path === dir || path.startsWith(`${dir}/`);
}

/** Путь `path` после переезда `from` → `to`, если он лежал внутри `from`. */
export function movedPath(path: string, from: string, to: string): string {
  return isInside(path, from) ? to + path.slice(from.length) : path;
}

/** Путь элемента `name` внутри папки `dir` (корень — пустая строка). */
export function childPath(dir: string, name: string): string {
  return dir ? `${dir}/${name}` : name;
}

/** Папка, в которой лежит элемент с путём `path`. */
export function parentOf(path: string): string {
  const i = path.lastIndexOf("/");
  return i < 0 ? ROOT : path.slice(0, i);
}
