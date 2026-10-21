import { useEffect, useState } from "react";

import { api } from "../../api";

const BARS = 28;

/**
 * Высота столбика волны от 0 до 1 по громкости. Речь тихая (RMS обычно 0.01–0.2),
 * поэтому громкость растягивается корнем, а тишина остаётся почти плоской.
 */
export function barHeight(level: number): number {
  return Math.min(1, Math.sqrt(Math.max(0, level)) * 2.5);
}

/** Бегущая волна громкости микрофона: новые значения появляются справа. */
export function VoiceWave() {
  const [levels, setLevels] = useState<number[]>(() => Array(BARS).fill(0));

  useEffect(() => {
    const unlisten = api.onVoiceLevel((level) => setLevels((prev) => [...prev.slice(1), level]));
    return () => void unlisten.then((stop) => stop());
  }, []);

  return (
    <div className="flex h-5 items-center gap-[2px]" aria-hidden>
      {levels.map((level, index) => (
        <span
          key={index}
          className="w-[3px] rounded-full bg-danger transition-[height] duration-75"
          style={{ height: `${Math.max(12, barHeight(level) * 100)}%` }}
        />
      ))}
    </div>
  );
}
