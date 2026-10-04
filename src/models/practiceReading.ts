import { noteTimeline, type LessonNote } from './lessons';

export type ReadingSupport = 'guided' | 'colors' | 'staff';
export interface ReadingSettings { support: ReadingSupport; bars: 1 | 2; fingers: boolean; keyboardGuide: boolean; }
export const READING_STORAGE_KEY = 'piano_sheet_reading_v1';
export const DEFAULT_READING_SETTINGS: ReadingSettings = { support: 'guided', bars: 1, fingers: true, keyboardGuide: true };
export const PITCH_COLORS = ['#b82e49', '#975019', '#6c7519', '#20785a', '#2466b9', '#7641b7', '#a33381'];
export const PITCH_LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
export function pitchColor(midi: number): string {
  const name = ['C', 'C', 'D', 'D', 'E', 'F', 'F', 'G', 'G', 'A', 'A', 'B'][midi % 12];
  return PITCH_COLORS[PITCH_LETTERS.indexOf(name)] ?? '#282538';
}
export function parseReadingSettings(raw: string | null): ReadingSettings {
  try {
    const data = JSON.parse(raw ?? 'null');
    if (!data || !['guided', 'colors', 'staff'].includes(data.support)) return { ...DEFAULT_READING_SETTINGS };
    return { support: data.support, bars: data.bars === 2 ? 2 : 1,
      fingers: typeof data.fingers === 'boolean' ? data.fingers : data.support === 'guided',
      keyboardGuide: typeof data.keyboardGuide === 'boolean' ? data.keyboardGuide : data.support === 'guided' };
  } catch { return { ...DEFAULT_READING_SETTINGS }; }
}
export function readingPreset(support: ReadingSupport, current: ReadingSettings): ReadingSettings {
  return { ...current, support, fingers: support === 'guided', keyboardGuide: support === 'guided' };
}
export function readingWindow(notes: LessonNote[], activeIndex: number, bars: 1 | 2) {
  const timeline = noteTimeline(notes);
  const beats = notes.reduce((sum, note) => sum + note.beats, 0);
  const totalBars = Math.max(1, Math.ceil(beats / 4));
  const active = timeline[Math.max(0, activeIndex)];
  const activeBar = Math.min(totalBars - 1, Math.floor((active?.startBeat ?? beats - 0.001) / 4));
  const visibleBars = Math.min(bars, totalBars);
  const startBar = Math.max(0, Math.min(activeBar, totalBars - visibleBars));
  return { startBar, visibleBars, totalBars, activeBar };
}
export function readingFinger(note: LessonNote, lessonId: string): number {
  return lessonId === 'twinkle' ? ({ 60: 1, 62: 2, 64: 3, 65: 1, 67: 2, 69: 3 } as Record<number, number>)[note.midi] ?? note.finger : note.finger;
}
