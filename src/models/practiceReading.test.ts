import { describe, expect, it } from 'vitest';
import { LESSONS, lessonNotes, noteTimeline } from './lessons';
import { DEFAULT_READING_SETTINGS, parseReadingSettings, pitchColor, readingPreset, readingWindow } from './practiceReading';

describe('staff reading windows', () => {
  it('starts with one bar and advances only when the next note belongs to the next bar', () => {
    const notes = LESSONS[0].phrases[0];
    expect(readingWindow(notes, 3, 1)).toMatchObject({ startBar: 0, visibleBars: 1, activeBar: 0 });
    expect(readingWindow(notes, 4, 1)).toMatchObject({ startBar: 1, visibleBars: 1, activeBar: 1 });
    expect(readingWindow(notes, 6, 2)).toMatchObject({ startBar: 0, visibleBars: 2, activeBar: 1 });
  });
  it('keeps one-bar lookahead and clamps the final two-bar window', () => {
    const notes = lessonNotes(LESSONS[0]);
    const fifthBar = noteTimeline(notes).findIndex((note) => note.startBeat >= 16);
    expect(readingWindow(notes, fifthBar, 2)).toMatchObject({ startBar: 4, visibleBars: 2 });
    expect(readingWindow(notes, notes.length - 1, 2)).toMatchObject({ startBar: 10, visibleBars: 2, totalBars: 12, activeBar: 11 });
  });
  it('uses the same pitch color in every octave', () => {
    expect(pitchColor(60)).toBe(pitchColor(72));
    expect(pitchColor(60)).not.toBe(pitchColor(67));
  });
});
describe('reading support progression', () => {
  it('removes names, fingers, and key guidance while preserving the bar count', () => {
    expect(readingPreset('staff', { ...DEFAULT_READING_SETTINGS, bars: 2 })).toEqual({ support: 'staff', bars: 2, fingers: false, keyboardGuide: false });
    expect(readingPreset('colors', DEFAULT_READING_SETTINGS).keyboardGuide).toBe(false);
    expect(readingPreset('guided', { ...DEFAULT_READING_SETTINGS, fingers: false }).fingers).toBe(true);
  });
  it('restores valid preferences and safely recovers from malformed storage', () => {
    expect(parseReadingSettings('{')).toEqual(DEFAULT_READING_SETTINGS);
    expect(parseReadingSettings(JSON.stringify({ support: 'staff', bars: 10, fingers: 'yes' }))).toEqual({ support: 'staff', bars: 1, fingers: false, keyboardGuide: false });
    expect(parseReadingSettings(JSON.stringify({ support: 'colors', bars: 2, fingers: true, keyboardGuide: false }))).toEqual({ support: 'colors', bars: 2, fingers: true, keyboardGuide: false });
  });
});
