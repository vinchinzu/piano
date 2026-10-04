import { describe, expect, it } from 'vitest';
import {
  getPlaybackAnchorX,
  getContinuousPlaybackEndX,
  getPlaybackCursorX,
  getRenderedVoiceLabel,
  shouldUsePlaybackAnchor,
  getFocusMeasureStart,
  getFocusAccidentalHelpers,
} from './renderer';
import { type NoteEntry } from '../models/song';

describe('focus score guidance', () => {
  it('keeps two-bar pages stable and clamps the last page', () => {
    expect([0, 1, 2, 3, 4].map((index) => getFocusMeasureStart(index, 5))).toEqual([0, 0, 2, 2, 4]);
    expect(getFocusMeasureStart(-1, 5)).toBe(0);
    expect(getFocusMeasureStart(99, 5)).toBe(4);
    expect(getFocusMeasureStart(0, 0)).toBe(0);
  });

  it('adds a flat reminder to the low B-flat in Tu Falta without duplicating printed accidentals', () => {
    const note: NoteEntry = { id: 'low-b-flat', keys: ['bb/3'], duration: 'q' };
    expect(getFocusAccidentalHelpers(note, 'Bb', [null])).toEqual(['b']);
    expect(getFocusAccidentalHelpers(note, 'Bb', ['b'])).toEqual([null]);
  });

  it('respects key signatures and explicit naturals for each chord pitch', () => {
    const note: NoteEntry = {
      id: 'chord', keys: ['f/4', 'b/3', 'f/5'], duration: 'q', accidentals: [null, null, 'n'],
    };
    expect(getFocusAccidentalHelpers(note, 'G', [null, null, 'n'])).toEqual(['#', null, null]);
    expect(getFocusAccidentalHelpers({ ...note, isRest: true }, 'G', [])).toEqual([null, null, null]);
    expect(getFocusAccidentalHelpers({ ...note, drumMidi: [42] }, 'G', [])).toEqual([null, null, null]);
  });
});

describe('score voice labels', () => {
  it('hides labels that merely repeat the selected track name', () => {
    expect(getRenderedVoiceLabel('Melody', 'Melody')).toBeUndefined();
    expect(getRenderedVoiceLabel(' Lead ', 'Lead')).toBeUndefined();
  });

  it('removes a redundant track prefix while preserving the voice distinction', () => {
    expect(getRenderedVoiceLabel('Drums · voice 2', 'Drums')).toBe('Voice 2');
  });

  it('preserves hand and descriptive voice labels', () => {
    expect(getRenderedVoiceLabel('R.H.', 'R.H.')).toBe('R.H.');
    expect(getRenderedVoiceLabel('L.H.', 'Melody')).toBe('L.H.');
    expect(getRenderedVoiceLabel('Arpeggio', 'Piano')).toBe('Arpeggio');
  });
});

describe('playback cursor position', () => {
  const anchors = [
    { progress: 0, x: 100 },
    { progress: 0.25, x: 180 },
    { progress: 1, x: 300 },
  ];

  it('starts and ends on the rendered measure positions', () => {
    expect(getPlaybackCursorX(anchors, 0)).toBe(100);
    expect(getPlaybackCursorX(anchors, 1)).toBe(300);
  });

  it('moves at a constant speed and clamps outside the measure', () => {
    expect(getPlaybackCursorX(anchors, 0.125)).toBe(125);
    expect(getPlaybackCursorX(anchors, 0.5)).toBe(200);
    expect(getPlaybackCursorX(anchors, 0.75)).toBe(250);
    expect(getPlaybackCursorX(anchors, -1)).toBe(100);
    expect(getPlaybackCursorX(anchors, 2)).toBe(300);
  });

  it('continues to the next downbeat on the same staff row', () => {
    expect(getContinuousPlaybackEndX(
      { x: 40, y: 120 },
      { x: 320, y: 120, playbackAnchors: [{ progress: 0, x: 374 }] },
    )).toBe(374);
  });

  it('wraps normally instead of connecting across staff rows', () => {
    expect(getContinuousPlaybackEndX(
      { x: 880, y: 120 },
      { x: 40, y: 370, playbackAnchors: [{ progress: 0, x: 98 }] },
    )).toBeNull();
  });

  it('anchors to a sounding note instead of a simultaneous centered rest', () => {
    expect(getPlaybackAnchorX([
      { x: 116, kind: 'note' },
      { x: 216, kind: 'rest' },
    ])).toBe(116);
  });

  it('uses the leftmost sounding onset when independently formatted staves differ', () => {
    expect(getPlaybackAnchorX([
      { x: 124, kind: 'note' },
      { x: 132, kind: 'note' },
      { x: 98, kind: 'spacer' },
    ])).toBe(124);
  });

  it('ignores centered whole-measure rests when another staff is sounding', () => {
    expect(shouldUsePlaybackAnchor('measure-rest', true)).toBe(false);
    expect(shouldUsePlaybackAnchor('note', true)).toBe(true);
    expect(shouldUsePlaybackAnchor('measure-rest', false)).toBe(true);
  });
});
