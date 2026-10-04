import { getNoteMidiPitches, type NoteEntry } from './song';

export interface GuitarPosition {
  string: number;
  fret: number;
  finger: number;
}

export type GuitarLayer = 'strings' | 'frets' | 'fingers' | 'beats';
export type GuitarProfile = 'first-position' | 'fifth-position';
export interface GuitarSettings {
  profile: GuitarProfile;
  layers: Record<GuitarLayer, boolean>;
}

/** String 1 is the thin high E. MIDI pitches here are written, one octave above sound. */
export const GUITAR_STRINGS = [
  { string: 1, name: 'E', writtenMidi: 76 },
  { string: 2, name: 'B', writtenMidi: 71 },
  { string: 3, name: 'G', writtenMidi: 67 },
  { string: 4, name: 'D', writtenMidi: 62 },
  { string: 5, name: 'A', writtenMidi: 57 },
  { string: 6, name: 'E', writtenMidi: 52 },
] as const;

/** Shared rules for every exercise. Extend these definitions to add positions or guidance. */
export const GUITAR_PROFILES = {
  'first-position': { label: 'First position', minFret: 0, maxFret: 4, fingerBase: 0 },
  'fifth-position': { label: 'Fifth position', minFret: 5, maxFret: 8, fingerBase: 4 },
} as const;

export const GUITAR_LAYERS: ReadonlyArray<{ id: GuitarLayer; label: string }> = [
  { id: 'strings', label: 'Circled strings' },
  { id: 'fingers', label: 'Fingering' },
  { id: 'frets', label: 'Frets' },
  { id: 'beats', label: 'Beat counts' },
];

export const GUITAR_STAGES: ReadonlyArray<{ label: string; layers: GuitarSettings['layers'] }> = [
  { label: 'Guided technique', layers: { strings: true, fingers: true, frets: true, beats: true } },
  { label: 'Read with hints', layers: { strings: true, fingers: true, frets: false, beats: false } },
  { label: 'Independent reading', layers: { strings: false, fingers: false, frets: false, beats: false } },
];

export function defaultGuitarSettings(): GuitarSettings {
  return { profile: 'first-position', layers: { ...GUITAR_STAGES[1].layers } };
}

export function guitarPositionMidi(position: Pick<GuitarPosition, 'string' | 'fret'>): number {
  return (GUITAR_STRINGS[position.string - 1]?.writtenMidi ?? NaN) + position.fret;
}

export function guitarCandidates(midi: number, profile: GuitarProfile): GuitarPosition[] {
  const rule = GUITAR_PROFILES[profile];
  return GUITAR_STRINGS.flatMap((string) => {
    const fret = midi - string.writtenMidi;
    return fret >= rule.minFret && fret <= rule.maxFret
      ? [{ string: string.string, fret, finger: fret === 0 ? 0 : fret - rule.fingerBase }]
      : [];
  }).sort((a, b) => a.fret - b.fret || a.string - b.string);
}

/** Honor valid overrides; chord tones must use different strings. Unavailable pitches get no hint. */
export function resolveGuitarPositions(
  note: NoteEntry, keySignature: string, settings = defaultGuitarSettings(),
): (GuitarPosition | null)[] {
  if (note.isRest || note.isSpacer || note.drumMidi) return note.keys.map(() => null);
  const pitches = getNoteMidiPitches(note, keySignature);
  const candidates = pitches.map((midi, index) => {
    const override = note.guitarPositions?.[index];
    return override && guitarPositionMidi(override) === midi
      ? [override]
      : guitarCandidates(midi, settings.profile);
  });
  let best: (GuitarPosition | null)[] = [];
  let bestCost = Infinity;
  const visited = new Map<string, number>();
  const search = (index: number, used: Set<number>, positions: (GuitarPosition | null)[], cost: number) => {
    const state = `${index}:${[...used].sort().join(',')}`;
    if (cost >= bestCost || cost >= (visited.get(state) ?? Infinity)) return;
    visited.set(state, cost);
    if (index === candidates.length) { best = positions; bestCost = cost; return; }
    for (const position of candidates[index]) {
      if (used.has(position.string)) continue;
      search(index + 1, new Set([...used, position.string]), [...positions, position], cost + position.fret);
    }
    search(index + 1, used, [...positions, null], cost + 100);
  };
  search(0, new Set(), [], 0);
  return best;
}

export function guitarBeatCounts(startBeat: number, duration: number, denominator: number): string {
  const unit = 4 / denominator;
  const counts: number[] = [];
  for (let beat = Math.ceil(startBeat / unit); beat * unit < startBeat + duration - 1e-9; beat++) {
    counts.push(beat + 1);
  }
  return counts.join(' · ');
}
