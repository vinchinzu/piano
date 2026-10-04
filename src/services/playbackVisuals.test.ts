import { describe, expect, it } from 'vitest';
import { PlaybackVisualTimeline, type PlaybackVisualNote } from './playbackVisuals';

function entry(
  id: string,
  keys: string[],
  startTime: number,
  duration: number,
  overrides: Partial<PlaybackVisualNote> = {},
): PlaybackVisualNote {
  return {
    trackId: 'piano', measureIdx: 0,
    note: { id, keys, duration: 'q' },
    startTime, duration, ...overrides,
  };
}

describe('playback visual timeline', () => {
  it('holds a quarter note for the entire beat and releases at the next attack', () => {
    const timeline = new PlaybackVisualTimeline([
      entry('c', ['c/4'], 0, 0.5), entry('d', ['d/4'], 0.5, 0.5),
    ], 'C');
    expect(timeline.getState(-0.01, 'piano').pianoKeys).toEqual([]);
    for (const time of [0, 0.25, 0.49, 0.499999]) {
      expect(timeline.getState(time, 'piano').pianoKeys).toEqual(['c/4']);
    }
    expect(timeline.getState(0.5, 'piano')).toEqual({
      measureIdx: 0, noteIds: ['d'], pianoKeys: ['d/4'],
    });
    expect(timeline.getState(1, 'piano').pianoKeys).toEqual([]);
  });

  it('keeps a shared key lit until every overlapping voice releases it', () => {
    const timeline = new PlaybackVisualTimeline([
      entry('long', ['c/4', 'g/4'], 0, 2),
      entry('short', ['c/4', 'e/4'], 0.5, 0.5),
    ], 'C');
    expect(timeline.getState(0.75, 'piano').pianoKeys).toEqual(['c/4', 'e/4', 'g/4']);
    expect(timeline.getState(1, 'piano')).toEqual({
      measureIdx: 0, noteIds: ['long'], pianoKeys: ['c/4', 'g/4'],
    });
    expect(timeline.getState(2, 'piano').pianoKeys).toEqual([]);
  });

  it('keeps ties lit across bars while advancing the highlighted score note', () => {
    const first = entry('tie-start', ['c/4'], 0, 1);
    first.note.tieToNext = true;
    const timeline = new PlaybackVisualTimeline([
      first, entry('tie-end', ['c/4'], 1, 1, { measureIdx: 1 }),
    ], 'C');
    expect(timeline.getState(0.99, 'piano').pianoKeys).toEqual(['c/4']);
    expect(timeline.getState(1, 'piano')).toEqual({
      measureIdx: 1, noteIds: ['tie-end'], pianoKeys: ['c/4'],
    });
    expect(timeline.getState(2, 'piano').pianoKeys).toEqual([]);
  });

  it('advances through rests and spacers without lighting their placeholder pitches', () => {
    const rest = entry('rest', ['b/4'], 0.5, 0.5, { measureIdx: 1 });
    rest.note.isRest = true;
    const spacer = entry('spacer', ['d/4'], 0, 1);
    spacer.note.isSpacer = true;
    const timeline = new PlaybackVisualTimeline([
      entry('c', ['c/4'], 0, 0.5), rest, spacer,
    ], 'C');
    expect(timeline.getState(0, 'piano').pianoKeys).toEqual(['c/4']);
    expect(timeline.getState(0.5, 'piano')).toEqual({
      measureIdx: 1, noteIds: [], pianoKeys: [],
    });
  });

  it('uses physical keys for key signatures, explicit naturals, enharmonics, and drums', () => {
    const pitched = entry('chord', ['f/4', 'f/5', 'bb/3', 'e/3'], 0, 1);
    pitched.note.accidentals = [null, 'n', null, '#'];
    const drum = entry('drum', ['f/4'], 0, 1, { trackId: 'drums' });
    drum.note.drumMidi = [36, 42];
    const timeline = new PlaybackVisualTimeline([pitched, drum], 'G');
    expect(timeline.getState(0, 'piano').pianoKeys).toEqual(['f/3', 'a#/3', 'f#/4', 'f/5']);
    expect(timeline.getState(0, 'drums').pianoKeys).toEqual(['c/2', 'f#/2']);
  });

  it('restores absolute state for track changes and repeated loop positions', () => {
    const timeline = new PlaybackVisualTimeline([
      entry('melody', ['e/4'], 0, 1),
      entry('bass', ['c/3'], 0, 2, { trackId: 'bass' }),
    ], 'C');
    const first = timeline.getState(0.5, 'piano');
    expect(timeline.getState(0.5, 'bass').pianoKeys).toEqual(['c/3']);
    expect(timeline.getState(1.5, 'piano').pianoKeys).toEqual([]);
    expect(timeline.getState(0.5, 'piano')).toEqual(first);
    expect(timeline.getState(0.5, 'missing').pianoKeys).toEqual([]);
  });

  it('merges floating-point boundaries without a stale release after the next attack', () => {
    const timeline = new PlaybackVisualTimeline([
      entry('first', ['c/4'], 0.1, 0.2), entry('next', ['d/4'], 0.3, 0.1),
    ], 'C');
    expect(timeline.eventTimes).toEqual([0.1, 0.3, 0.4]);
    expect(timeline.getState(0.3, 'piano').pianoKeys).toEqual(['d/4']);
  });
});
