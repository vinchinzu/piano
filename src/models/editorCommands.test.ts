import { describe, expect, it } from 'vitest';
import { cloneMeasureForPaste, cloneNoteForPaste, normalizeEditedPianoKeys, transposeNoteBySteps } from './editorCommands';
import { createDefaultMeasure, type NoteEntry } from './song';

describe('shared editor commands', () => {
  it('copies internal slurs and ties to new IDs without retaining links outside the copied bar', () => {
    const measure = { ...createDefaultMeasure(), treble: [
      { id: 'first', keys: ['c/4'], duration: 'q' as const, tieToNext: true, slurToNoteId: 'second', slurPlacement: 'above' as const },
      { id: 'second', keys: ['c/4'], duration: 'q' as const, tieToNext: true, slurToNoteId: 'outside', slurPlacement: 'below' as const },
    ] };
    const copy = cloneMeasureForPaste(measure);
    expect(copy.treble[0].id).not.toBe('first');
    expect(copy.treble[0].slurToNoteId).toBe(copy.treble[1].id);
    expect(copy.treble[0].tieToNext).toBe(true);
    expect(copy.treble[1].slurToNoteId).toBeUndefined();
    expect(copy.treble[1].tieToNext).toBeUndefined();
    copy.treble[0].keys[0] = 'e/4';
    expect(measure.treble[0].keys).toEqual(['c/4']);
  });
  it('copies independent notes and guitar overrides without shared mutable arrays', () => {
    const note: NoteEntry = { id: 'original', keys: ['c/4'], duration: 'q', tieToNext: true,
      guitarPositions: [{ string: 5, fret: 3, finger: 3 }] };
    const copy = cloneNoteForPaste(note);
    expect(copy.tieToNext).toBeUndefined();
    copy.guitarPositions![0]!.finger = 1;
    expect(note.guitarPositions![0]!.finger).toBe(3);
  });
  it('preserves an unchanged enharmonic spelling while adding a natural against the key signature', () => {
    const original: NoteEntry = { id: 'flat', keys: ['b/4'], duration: 'q', accidentals: ['b'] };
    expect(normalizeEditedPianoKeys(['a#/4', 'f/4'], 'G', original)).toEqual({ keys: ['b/4', 'f/4'], accidentals: ['b', 'n'] });
  });
  it('transposes chords across octave boundaries and treats drum notes as unpitched', () => {
    expect(transposeNoteBySteps({ id: 'chord', keys: ['b/3', 'd/4'], duration: 'q' }, 1).keys).toEqual(['c/4', 'e/4']);
    const drum: NoteEntry = { id: 'kick', keys: ['f/4'], duration: 'q', drumMidi: [36] };
    expect(transposeNoteBySteps(drum, 2)).toBe(drum);
  });
});
