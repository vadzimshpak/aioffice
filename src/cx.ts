/** Склеивает классы, пропуская пустые и ложные значения. */
export function cx(...names: (string | false | null | undefined)[]): string {
  return names.filter(Boolean).join(" ");
}
