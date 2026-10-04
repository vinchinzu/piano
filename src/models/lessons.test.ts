import { describe, expect, it } from 'vitest';
import { LESSONS, SESSION_PLAN, lessonNotes, createLessonSong, noteTimeline, assessBandNote, performanceStars, parsePracticeProgress } from './lessons';
import { getMeasureBeatCount } from './song';
import { validateAndMigrateSong } from '../services/storage';

describe('beginner lessons and backing scores', () => {
  it('plans an hour with breaks and creative play', () => {
    expect(SESSION_PLAN.reduce((sum, item) => sum + item.minutes, 0)).toBe(60);
    expect(SESSION_PLAN.map((item) => item.id)).toContain('break');
    expect(SESSION_PLAN.map((item) => item.id)).toContain('create');
  });
  it.each(LESSONS)('exports $id as a valid, aligned melody and accompaniment', (lesson) => {
    const song = createLessonSong(lesson);
    expect(validateAndMigrateSong(song).errors).toEqual([]);
    expect(song.tracks).toHaveLength(2);
    expect(song.tracks[0].measures).toHaveLength(lesson.chords.length);
    for (const track of song.tracks) for (const measure of track.measures) {
      expect(getMeasureBeatCount(track.name === 'Your melody' ? measure.treble : measure.bass)).toBe(4);
    }
    expect(lesson.phrases.every((phrase) => phrase.reduce((sum, note) => sum + note.beats, 0) === 8)).toBe(true);
  });
  it('has the recognizable opening and full ending of Twinkle', () => {
    const notes = lessonNotes(LESSONS[0]);
    expect(notes.slice(0, 7).map((note) => note.midi)).toEqual([60, 60, 67, 67, 69, 69, 67]);
    expect(noteTimeline(notes).at(-1)).toMatchObject({ midi: 60, beats: 2, startBeat: 46 });
  });
});
describe('band assessment', () => {
  const notes = LESSONS[0].phrases[0];
  it('credits pitches only within an onset window, once per note', () => {
    expect(assessBandNote(notes, 0.2, 60, new Set())).toBe(0);
    expect(assessBandNote(notes, 0.2, 62, new Set())).toBeNull();
    expect(assessBandNote(notes, 0.6, 60, new Set())).toBe(1);
    expect(assessBandNote(notes, 0.2, 60, new Set([0]))).toBeNull();
    expect(assessBandNote(notes, -2, 60, new Set())).toBeNull();
    expect(assessBandNote(notes, 7, 67, new Set())).toBeNull();
  });
  it('awards stars for increasingly accurate performances', () => {
    expect([0, 1, 6, 9].map((correct) => performanceStars(correct, 10))).toEqual([0, 1, 2, 3]);
  });
});
describe('practice progress recovery', () => {
  it('recovers safely from malformed data and validates saved milestones', () => {
    expect(parsePracticeProgress('{oops').seconds).toBe(0);
    const saved = parsePracticeProgress(JSON.stringify({ version: 1, seconds: 25, lessons: { twinkle: {
      phrases: [0, 0, 1, 100, -1, '2', 2.5], bestStars: 20, bestAccuracy: 4, performances: -5,
    } } }));
    expect(saved.lessons.twinkle).toEqual({ phrases: [0, 1], bestStars: 3, bestAccuracy: 1, performances: 0 });
  });
});
