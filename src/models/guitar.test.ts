import { describe, expect, it } from 'vitest';
import exercise from '../../songs/guitar-first-position-exercise-1.json';
import { defaultGuitarSettings, guitarBeatCounts, guitarPositionMidi, resolveGuitarPositions } from './guitar';
import { createDefaultSong, createEditableScore, getMeasureBeatCount, replaceSongTrackFromScore, type NoteEntry } from './song';
import { validateAndMigrateSong } from '../services/storage';

const note = (keys: string[]): NoteEntry => ({ id: 'note', keys, duration: 'h' });

describe('shared guitar guidance', () => {
  it('maps the photographed first-position scale to its strings, frets, and fingers', () => {
    const scale = ['c/4', 'd/4', 'e/4', 'f/4', 'g/4', 'a/4', 'b/4', 'c/5', 'b/3'];
    expect(scale.map((key) => resolveGuitarPositions(note([key]), 'C')[0])).toEqual([
      { string: 5, fret: 3, finger: 3 }, { string: 4, fret: 0, finger: 0 },
      { string: 4, fret: 2, finger: 2 }, { string: 4, fret: 3, finger: 3 },
      { string: 3, fret: 0, finger: 0 }, { string: 3, fret: 2, finger: 2 },
      { string: 2, fret: 0, finger: 0 }, { string: 2, fret: 1, finger: 1 },
      { string: 5, fret: 2, finger: 2 },
    ]);
  });

  it('honors altered pitches, alternate positions, and valid overrides without stale guidance', () => {
    expect(resolveGuitarPositions(note(['f/4']), 'G')[0]).toEqual({ string: 4, fret: 4, finger: 4 });
    expect(resolveGuitarPositions({ ...note(['f/4']), accidentals: ['n'] }, 'G')[0]?.fret).toBe(3);
    const settings = { ...defaultGuitarSettings(), profile: 'fifth-position' as const };
    expect(resolveGuitarPositions(note(['c/4']), 'C', settings)[0]).toEqual({ string: 6, fret: 8, finger: 4 });
    const alternate = { string: 6, fret: 8, finger: 4 };
    expect(resolveGuitarPositions({ ...note(['c/4']), guitarPositions: [alternate] }, 'C')[0]).toEqual(alternate);
    expect(resolveGuitarPositions({ ...note(['d/4']), guitarPositions: [alternate] }, 'C')[0]?.string).toBe(4);
    expect(resolveGuitarPositions(note(['c/7']), 'C')).toEqual([null]);
    expect(resolveGuitarPositions({ ...note(['c/4']), isRest: true }, 'C')).toEqual([null]);
  });

  it('assigns distinct strings to chords and reserves explicitly selected strings', () => {
    const chord = note(['b/4', 'd/5']);
    const positions = resolveGuitarPositions(chord, 'C');
    expect(positions).toEqual([{ string: 3, fret: 4, finger: 4 }, { string: 2, fret: 3, finger: 3 }]);
    expect(positions.map((position) => position && guitarPositionMidi(position))).toEqual([71, 74]);
    const fixed = resolveGuitarPositions({ ...chord, guitarPositions: [{ string: 2, fret: 0, finger: 0 }, null] }, 'C');
    expect(fixed).toEqual([{ string: 2, fret: 0, finger: 0 }, null]);
  });

  it('counts half and whole notes and follows the meter denominator', () => {
    expect(guitarBeatCounts(0, 2, 4)).toBe('1 · 2');
    expect(guitarBeatCounts(2, 2, 4)).toBe('3 · 4');
    expect(guitarBeatCounts(0, 4, 4)).toBe('1 · 2 · 3 · 4');
    expect(guitarBeatCounts(0, 1.5, 8)).toBe('1 · 2 · 3');
  });

  it('preserves guitar settings through editable-score updates and validates JSON overrides', () => {
    const song = createDefaultSong('guitar');
    const score = { ...createEditableScore(song), guitar: defaultGuitarSettings() };
    score.measures[0].treble = [{ ...note(['c/4']), guitarPositions: [{ string: 5, fret: 3, finger: 3 }] }];
    const updated = replaceSongTrackFromScore(song, score);
    expect(validateAndMigrateSong(JSON.parse(JSON.stringify(updated))).song?.tracks[0].guitar).toEqual(score.guitar);
    expect(updated.tracks[0].instrumentMode).toBe('guitar');
    expect(updated.tracks[0].instrumentSound).toBe('nylon-guitar');
    score.measures[0].treble[0].guitarPositions![0]!.finger = 5;
    expect(validateAndMigrateSong(replaceSongTrackFromScore(song, score)).song).toBeNull();
  });

  it('transcribes twenty complete bars and the photographed second line and final whole note', () => {
    const song = validateAndMigrateSong(exercise).song!;
    const bars = song.tracks[0].measures;
    expect(bars).toHaveLength(20);
    expect(bars.every((bar) => getMeasureBeatCount(bar.treble) === 4 && bar.bass.length === 0)).toBe(true);
    expect(bars.slice(4, 8).flatMap((bar) => bar.treble.map((entry) => entry.keys[0])))
      .toEqual(['e/4', 'f/4', 'g/4', 'e/4', 'f/4', 'g/4', 'a/4', 'f/4']);
    expect(bars[19].treble[0]).toMatchObject({ keys: ['b/3'], duration: 'w' });
  });
});
