import { createDefaultSong, createDefaultMeasure, createDefaultTrack, createId, midiToPianoKey, type Song, type NoteDuration } from './song';

export interface LessonNote { midi: number; beats: number; finger: number; }
export interface Lesson { id: string; title: string; icon: string; description: string; tempo: number; phrases: LessonNote[][]; chords: ('C' | 'F' | 'G')[]; }
const fingers: Record<number, number> = { 60: 1, 62: 2, 64: 3, 65: 4, 67: 5, 69: 4 };
const phrase = (notes: (number | [number, number])[]): LessonNote[] => notes.map((entry) => {
  const [midi, beats] = Array.isArray(entry) ? entry : [entry, 1];
  return { midi, beats, finger: fingers[midi] ?? 5 };
});
export const LESSONS: Lesson[] = [
  { id: 'twinkle', title: 'Twinkle, Twinkle, Little Star', icon: '★', description: 'Six little phrases. One big star song.', tempo: 76,
    phrases: [phrase([60, 60, 67, 67, 69, 69, [67, 2]]), phrase([65, 65, 64, 64, 62, 62, [60, 2]]),
      phrase([67, 67, 65, 65, 64, 64, [62, 2]]), phrase([67, 67, 65, 65, 64, 64, [62, 2]]),
      phrase([60, 60, 67, 67, 69, 69, [67, 2]]), phrase([65, 65, 64, 64, 62, 62, [60, 2]])],
    chords: ['C', 'F', 'C', 'G', 'C', 'F', 'C', 'G', 'C', 'F', 'G', 'C'] },
  { id: 'mary', title: 'Mary Had a Little Lamb', icon: '☁', description: 'Start with just C, D and E.', tempo: 80,
    phrases: [phrase([64, 62, 60, 62, 64, 64, [64, 2]]), phrase([62, 62, [62, 2], 64, 67, [67, 2]]),
      phrase([64, 62, 60, 62, 64, 64, 64, 64]), phrase([62, 62, 64, 62, [60, 4]])],
    chords: ['C', 'C', 'G', 'C', 'C', 'C', 'G', 'C'] },
  { id: 'ode', title: 'Ode to Joy', icon: '♫', description: 'Five fingers make a joyful tune.', tempo: 84,
    phrases: [phrase([64, 64, 65, 67, 67, 65, 64, 62]), phrase([60, 60, 62, 64, [64, 1.5], [62, 0.5], [62, 2]]),
      phrase([64, 64, 65, 67, 67, 65, 64, 62]), phrase([60, 60, 62, 64, [62, 1.5], [60, 0.5], [60, 2]])],
    chords: ['C', 'G', 'C', 'G', 'C', 'G', 'G', 'C'] },
];
export const SESSION_PLAN = [
  { id: 'explore', title: 'Find the keys', minutes: 5, prompt: 'Find middle C. Try the glowing key, then explore all the sounds.' },
  { id: 'listen', title: 'Listen & clap', minutes: 5, prompt: 'Listen to your song. Clap with the beat and hum along.' },
  { id: 'learn', title: 'Little phrases', minutes: 15, prompt: 'Read the glowing note on the staff. We wait for you — take your time.' },
  { id: 'band', title: 'Play with the band', minutes: 10, prompt: 'Four clicks, then your turn! Follow the notes and keep the beat.' },
  { id: 'break', title: 'Wiggle break', minutes: 5, prompt: 'Stand up, stretch your fingers, and have a drink of water.' },
  { id: 'replay', title: 'Star performance', minutes: 10, prompt: 'Play the whole song again. Try a little faster when you feel ready.' },
  { id: 'create', title: 'Make your own music', minutes: 10, prompt: 'Make up a tune! The band will play along in C major.' },
] as const;
export type SessionActivity = typeof SESSION_PLAN[number]['id'];
export function lessonNotes(lesson: Lesson): LessonNote[] { return lesson.phrases.flat(); }
export function noteTimeline(notes: LessonNote[]) {
  let beat = 0;
  return notes.map((note, index) => { const startBeat = beat; beat += note.beats; return { ...note, index, startBeat }; });
}
export function assessBandNote(notes: LessonNote[], elapsedBeats: number, midi: number, scored: Set<number>, tolerance = 0.4): number | null {
  let best: number | null = null;
  let distance = tolerance;
  for (const note of noteTimeline(notes)) {
    const delta = Math.abs(note.startBeat - elapsedBeats);
    if (note.midi === midi && !scored.has(note.index) && delta <= distance) { best = note.index; distance = delta; }
  }
  return best;
}
export function performanceStars(correct: number, total: number): number {
  if (!total || !correct) return 0;
  const accuracy = correct / total;
  return accuracy >= 0.85 ? 3 : accuracy >= 0.6 ? 2 : 1;
}
export const CHORD_PITCHES = { C: [48, 52, 55], F: [41, 45, 48], G: [43, 47, 50] };

/** Make an ordinary editable multitrack score, preserving the existing editor format. */
export function createLessonSong(lesson: Lesson): Song {
  const song = createDefaultSong();
  song.title = lesson.title; song.tempo = lesson.tempo;
  const melody = createDefaultTrack('Your melody');
  melody.staffLayout = 'treble-only'; melody.instrumentSound = 'electric-keys';
  const backing = createDefaultTrack('Backing chords');
  backing.instrumentSound = 'warm-pad';
  const measures = Array.from({ length: lesson.chords.length }, () => createDefaultMeasure());
  for (const note of noteTimeline(lessonNotes(lesson))) {
    const durations: Record<number, NoteDuration> = { 0.5: '8', 1: 'q', 1.5: 'q', 2: 'h', 4: 'w' };
    measures[Math.floor(note.startBeat / 4)].treble.push({ id: createId(), keys: [midiToPianoKey(note.midi)],
      duration: durations[note.beats], dotted: note.beats === 1.5 || undefined });
  }
  melody.measures = measures;
  backing.measures = lesson.chords.map((chord) => ({ ...createDefaultMeasure(), chordSymbol: chord,
    bass: [{ id: createId(), keys: CHORD_PITCHES[chord].map(midiToPianoKey), duration: 'w' as const }] }));
  song.tracks = [melody, backing];
  return song;
}

export interface LessonProgress { phrases: number[]; bestStars: number; bestAccuracy: number; performances: number; }
export interface PracticeProgress { version: 1; seconds: number; lessons: Record<string, LessonProgress>; }
export const EMPTY_PROGRESS: PracticeProgress = { version: 1, seconds: 0, lessons: {} };
export const PRACTICE_STORAGE_KEY = 'piano_sheet_practice_v1';
export function parsePracticeProgress(raw: string | null): PracticeProgress {
  if (!raw) return { ...EMPTY_PROGRESS, lessons: {} };
  try {
    const data = JSON.parse(raw);
    if (data.version !== 1 || !Number.isFinite(data.seconds) || data.seconds < 0 || typeof data.lessons !== 'object' || !data.lessons) return { ...EMPTY_PROGRESS, lessons: {} };
    const lessons: Record<string, LessonProgress> = {};
    for (const lesson of LESSONS) {
      const item = data.lessons[lesson.id];
      if (!item || !Array.isArray(item.phrases)) continue;
      lessons[lesson.id] = {
        phrases: [...new Set<number>(item.phrases.filter((value: unknown) => typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < lesson.phrases.length))],
        bestStars: Number.isInteger(item.bestStars) ? Math.max(0, Math.min(3, item.bestStars)) : 0,
        bestAccuracy: Number.isFinite(item.bestAccuracy) ? Math.max(0, Math.min(1, item.bestAccuracy)) : 0,
        performances: Number.isInteger(item.performances) ? Math.max(0, item.performances) : 0,
      };
    }
    return { version: 1, seconds: data.seconds, lessons };
  } catch { return { ...EMPTY_PROGRESS, lessons: {} }; }
}
