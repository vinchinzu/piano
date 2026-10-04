import { createId, getMeasureNoteIds, getKeySignatureAccidental, notationPitchToPianoKey, type NoteEntry, type Measure, type StaffClef, type Accidental } from './song';

export const PITCH_NAMES = ['c', 'd', 'e', 'f', 'g', 'a', 'b'];

export function copyNoteData(note: NoteEntry): NoteEntry {
  return {
    ...note,
    keys: [...note.keys],
    drumMidi: note.drumMidi ? [...note.drumMidi] : undefined,
    accidentals: note.accidentals ? [...note.accidentals] : undefined,
    articulations: note.articulations ? [...note.articulations] : undefined,
    guitarPositions: note.guitarPositions?.map((position) => position ? { ...position } : null),
  };
}

export function cloneNoteForPaste(note: NoteEntry): NoteEntry {
  return {
    ...copyNoteData(note),
    id: createId(),
    tieToNext: undefined,
    slurToNoteId: undefined,
    slurPlacement: undefined,
    slurStart: undefined,
    slurEnd: undefined,
  };
}

export function cloneMeasureForPaste(measure: Measure): Measure {
  const oldIds = getMeasureNoteIds(measure);
  const idMap = new Map(oldIds.map((id) => [id, createId()]));
  const cloneVoice = (voice: NoteEntry[]) => voice.map((note, index) => ({
    ...copyNoteData(note),
    id: idMap.get(note.id) ?? createId(),
    tieToNext: note.tieToNext && index < voice.length - 1 ? true : undefined,
    slurToNoteId: note.slurToNoteId ? idMap.get(note.slurToNoteId) : undefined,
    slurPlacement: note.slurToNoteId && idMap.has(note.slurToNoteId)
      ? note.slurPlacement
      : undefined,
  }));
  return {
    ...measure,
    treble: cloneVoice(measure.treble),
    bass: cloneVoice(measure.bass),
    additionalTrebleVoices: measure.additionalTrebleVoices?.map(cloneVoice),
    additionalBassVoices: measure.additionalBassVoices?.map(cloneVoice),
  };
}

export function transposeNoteBySteps(note: NoteEntry, steps: number): NoteEntry {
  if (note.drumMidi) return note;
  if (note.isRest) {
    const restOffset = Math.max(-6, Math.min(6, (note.restOffset ?? 0) + steps * 0.5));
    return { ...note, restOffset: restOffset || undefined };
  }
  return {
    ...note,
    keys: note.keys.map((key) => {
      const [name, octaveText] = key.split('/');
      const pitchIndex = PITCH_NAMES.indexOf(name[0]?.toLowerCase());
      if (pitchIndex < 0) return key;
      const absolutePitch = Number(octaveText) * PITCH_NAMES.length + pitchIndex + steps;
      const octave = Math.floor(absolutePitch / PITCH_NAMES.length);
      const normalizedPitchIndex = ((absolutePitch % PITCH_NAMES.length) + PITCH_NAMES.length)
        % PITCH_NAMES.length;
      return `${PITCH_NAMES[normalizedPitchIndex]}${name.slice(1)}/${octave}`;
    }),
  };
}

export function staffYToKey(y: number, staffTopY: number, displayClef: StaffClef): string {
  const topLinePitch = displayClef === 'treble'
    ? 5 * PITCH_NAMES.length + PITCH_NAMES.indexOf('f')
    : 3 * PITCH_NAMES.length + PITCH_NAMES.indexOf('a');
  const diatonicStepsDown = Math.round((y - staffTopY) / 5);
  const absolutePitch = topLinePitch - diatonicStepsDown;
  const octave = Math.floor(absolutePitch / PITCH_NAMES.length);
  const pitchIndex = ((absolutePitch % PITCH_NAMES.length) + PITCH_NAMES.length)
    % PITCH_NAMES.length;
  return `${PITCH_NAMES[pitchIndex]}/${octave}`;
}

export function normalizePianoKeys(keys: string[], keySignature: string): {
  keys: string[];
  accidentals?: (Accidental | null)[];
} {
  const normalizedKeys = keys.map((key) => {
    const [name, octave] = key.split('/');
    return `${name[0]}/${octave}`;
  });
  const accidentals = keys.map((key): Accidental | null => {
    const name = key.split('/')[0];
    const accidental = name.slice(1);
    if (accidental.includes('#')) return '#';
    if (accidental.includes('b')) return 'b';
    if (getKeySignatureAccidental(keySignature, name)) return 'n';
    return null;
  });
  return {
    keys: normalizedKeys,
    accidentals: accidentals.some(Boolean) ? accidentals : undefined,
  };
}

export function normalizeEditedPianoKeys(
  pianoKeys: string[],
  keySignature: string,
  originalNote: NoteEntry,
): { keys: string[]; accidentals?: (Accidental | null)[] } {
  const originalSpellings = new Map<string, { key: string; accidental: Accidental | null }>();
  originalNote.keys.forEach((key, index) => {
    const accidental = originalNote.accidentals?.[index] ?? null;
    const pianoKey = notationPitchToPianoKey(key, accidental, keySignature);
    if (!originalSpellings.has(pianoKey)) originalSpellings.set(pianoKey, { key, accidental });
  });

  const normalized = normalizePianoKeys(pianoKeys, keySignature);
  const entries = pianoKeys.map((pianoKey, index) => (
    originalSpellings.get(pianoKey) ?? {
      key: normalized.keys[index],
      accidental: normalized.accidentals?.[index] ?? null,
    }
  ));
  const accidentals = entries.map((entry) => entry.accidental);
  return {
    keys: entries.map((entry) => entry.key),
    accidentals: accidentals.some(Boolean) ? accidentals : undefined,
  };
}

export function formatPitchLabel(key: string, accidental?: Accidental | null): string {
  const [name, octave] = key.split('/');
  const writtenAccidental = name.slice(1);
  const effectiveAccidental = accidental === 'n'
    ? 'n'
    : accidental ?? (writtenAccidental.includes('#') ? '#' : writtenAccidental.includes('b') ? 'b' : null);
  const accidentalSymbol = effectiveAccidental === '#'
    ? '♯'
    : effectiveAccidental === 'b'
      ? '♭'
      : effectiveAccidental === 'n' ? '♮' : '';
  return `${name[0]?.toUpperCase() ?? ''}${accidentalSymbol}${octave}`;
}
