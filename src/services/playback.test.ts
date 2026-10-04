import { beforeEach, describe, expect, it, vi } from 'vitest';
import alouette from '../../songs/alouette-beginner.json';
import { createDefaultSong, type Song } from '../models/song';
import { getPlaybackOrder, PlaybackEngine } from './playback';
import { validateAndMigrateSong } from './storage';

const clock = vi.hoisted(() => ({
  seconds: 0,
  events: [] as Array<{ time: number; callback: (time: number) => void }>,
  draws: [] as Array<() => void>,
  attack: vi.fn(),
}));

vi.mock('tone', () => {
  class AudioNode {
    volume = { value: 0 };
    frequency = { value: 0 };
    wet = { value: 0 };
    feedback = { value: 0 };
    connect() { return this; }
    toDestination() { return this; }
    triggerAttackRelease = clock.attack;
    releaseAll() {}
  }
  const transport = {
    seconds: 0, loop: false, loopStart: 0, loopEnd: 0,
    stop() {}, pause() {}, start() {},
    cancel() { clock.events = []; },
    getSecondsAtTime() { return clock.seconds; },
    schedule(callback: (time: number) => void, time: number) {
      clock.events.push({ time, callback });
    },
  };
  return {
    start: async () => {}, immediate: () => 0,
    getTransport: () => transport,
    getDraw: () => ({
      anticipation: 0,
      schedule: (callback: () => void) => clock.draws.push(callback),
    }),
    PolySynth: AudioNode, Synth: AudioNode, Filter: AudioNode,
    FeedbackDelay: AudioNode, Volume: AudioNode,
  };
});

function runAt(seconds: number) {
  clock.seconds = seconds;
  for (const event of clock.events.filter((event) => Math.abs(event.time - seconds) < 1e-6)) {
    event.callback(seconds);
  }
  clock.draws.splice(0).forEach((draw) => draw());
}

function simpleSong(): Song {
  const song = createDefaultSong();
  song.tempo = 120;
  song.tracks[0].instrumentSound = 'electric-keys';
  song.tracks[0].measures = [{
    treble: [
      { id: 'c', keys: ['c/4'], duration: 'q' },
      { id: 'rest', keys: ['b/4'], duration: 'q', isRest: true },
      { id: 'd', keys: ['d/4'], duration: 'h' },
    ],
    bass: [{ id: 'bass', keys: ['c/3'], duration: 'w' }],
  }];
  return song;
}

describe('repeat expansion', () => {
  it('plays a marked repeat section exactly twice', () => {
    const song = createDefaultSong();
    song.tracks[0].measures[1].repeatStart = true;
    song.tracks[0].measures[2].repeatEnd = true;
    expect(getPlaybackOrder(song.tracks[0])).toEqual([0, 1, 2, 1, 2, 3]);
  });

  it('repeats from the beginning when no explicit start marker exists', () => {
    const song = createDefaultSong();
    song.tracks[0].measures[1].repeatEnd = true;
    expect(getPlaybackOrder(song.tracks[0])).toEqual([0, 1, 0, 1, 2, 3]);
  });
});

describe('synchronized playback guidance', () => {
  beforeEach(() => {
    clock.seconds = 0;
    clock.events = [];
    clock.draws = [];
    clock.attack.mockClear();
  });

  it('sounds guitar notation one octave lower while guidance retains written pitches', async () => {
    const song = simpleSong();
    song.tracks[0].instrumentMode = 'guitar';
    song.tracks[0].measures[0].bass = [];
    const engine = new PlaybackEngine();
    const visuals = vi.fn();
    engine.onVisualState(visuals);
    await engine.play(song, song.tracks[0].id);
    runAt(0);
    expect(clock.attack.mock.lastCall?.[0]).toEqual(['C3']);
    expect(visuals.mock.lastCall?.[0].pianoKeys).toEqual(['c/4']);
    engine.stop();
  });

  it('lights only current Alouette notes and holds them for their full written duration', async () => {
    const song = validateAndMigrateSong(alouette).song!;
    song.tracks.forEach((track) => { track.instrumentSound = 'electric-keys'; });
    const engine = new PlaybackEngine();
    const visuals = vi.fn();
    engine.onVisualState(visuals);
    await engine.play(song, song.tracks[0].id);
    const beat = 60 / song.tempo;
    runAt(0);
    expect(visuals.mock.lastCall?.[0].pianoKeys).toEqual(['g/2', 'd/3', 'g/4']);
    // Ordinary audio ends at 90% of the note; guidance holds through 100%.
    clock.seconds = beat * 1.49;
    engine.setActiveTrack(song.tracks[0].id);
    expect(visuals.mock.lastCall?.[0].pianoKeys).toEqual(['g/2', 'd/3', 'g/4']);
    runAt(beat * 1.5);
    expect(visuals.mock.lastCall?.[0].pianoKeys).toEqual(['g/2', 'd/3', 'a/4']);
    runAt(beat * 2);
    expect(visuals.mock.lastCall?.[0].pianoKeys).toEqual(['g/2', 'd/3', 'b/4']);
    clock.seconds = beat * 2.99;
    engine.setActiveTrack(song.tracks[0].id);
    expect(visuals.mock.lastCall?.[0].noteIds).toContain('alouette-m1-3');
    runAt(beat * 3);
    expect(visuals.mock.lastCall?.[0].noteIds).toContain('alouette-m1-4');
    runAt(beat * 4);
    expect(visuals.mock.lastCall?.[0].pianoKeys).toEqual(['d/3', 'a/3', 'a/4']);
    engine.stop();
  });

  it('retains highlights on pause, resumes timing, and clears on stop despite queued callbacks', async () => {
    const song = simpleSong();
    const engine = new PlaybackEngine();
    const visuals = vi.fn();
    engine.onVisualState(visuals);
    await engine.play(song, song.tracks[0].id);
    runAt(0);
    clock.seconds = 0.25;
    const beforePause = visuals.mock.lastCall?.[0];
    engine.pause();
    expect(visuals.mock.lastCall?.[0]).toEqual(beforePause);
    runAt(0.5); // Visual callbacks cannot advance the frozen highlights.
    expect(visuals.mock.lastCall?.[0]).toEqual(beforePause);
    engine.setActiveTrack(song.tracks[0].id);
    expect(visuals.mock.lastCall?.[0]).toEqual(beforePause);
    clock.seconds = 0.25;
    engine.resume();
    expect(visuals.mock.lastCall?.[0].pianoKeys).toEqual(['c/3', 'c/4']);
    runAt(0.5);
    expect(visuals.mock.lastCall?.[0].pianoKeys).toEqual(['c/3']);
    clock.events.filter((event) => event.time === 1).forEach((event) => event.callback(1));
    expect(clock.draws.length).toBeGreaterThan(0);
    engine.stop();
    const callCount = visuals.mock.calls.length;
    clock.draws.splice(0).forEach((draw) => draw());
    expect(visuals).toHaveBeenCalledTimes(callCount);
    expect(visuals.mock.lastCall?.[0].pianoKeys).toEqual([]);
  });

  it('samples the current clock after delayed frames and preserves pause at the song ending', async () => {
    const song = simpleSong();
    const engine = new PlaybackEngine();
    const visuals = vi.fn();
    engine.onVisualState(visuals);
    await engine.play(song, song.tracks[0].id);
    clock.events.filter((event) => event.time === 0).forEach((event) => event.callback(0));
    clock.seconds = 0.75; // The frame for the first attack was delayed past its release.
    clock.draws.splice(0).forEach((draw) => draw());
    expect(visuals.mock.lastCall?.[0].pianoKeys).toEqual(['c/3']);
    runAt(1);
    const lastState = visuals.mock.lastCall?.[0];
    clock.events.find((event) => Math.abs(event.time - 2.08) < 1e-6)!.callback(2.08);
    engine.pause();
    clock.draws.splice(0).forEach((draw) => draw());
    expect(engine.getState()).toBe('paused');
    expect(visuals.mock.lastCall?.[0]).toEqual(lastState);
    engine.stop();
  });

  it('restores already-held keys when changing tracks and starting another loop', async () => {
    const song = simpleSong();
    song.tracks.push({ ...song.tracks[0], id: 'other', measures: [{
      treble: [{ id: 'other-note', keys: ['g/4'], duration: 'w' }], bass: [],
    }] });
    const engine = new PlaybackEngine();
    const visuals = vi.fn();
    engine.onVisualState(visuals);
    await engine.play(song, song.tracks[0].id, 0, true);
    runAt(0);
    clock.seconds = 0.75;
    engine.setActiveTrack('other');
    expect(visuals.mock.lastCall?.[0].pianoKeys).toEqual(['g/4']);
    engine.setActiveTrack(song.tracks[0].id);
    expect(visuals.mock.lastCall?.[0].pianoKeys).toEqual(['c/3']);
    runAt(1);
    runAt(0); // Tone wraps its position back to zero on each loop.
    expect(visuals.mock.lastCall?.[0].pianoKeys).toEqual(['c/3', 'c/4']);
    engine.stop();
  });

  it('uses score timing for pedal and staccato while preserving their audio durations', async () => {
    const song = simpleSong();
    const notes = song.tracks[0].measures[0].treble;
    notes[0].pedalStart = true;
    notes[2].pedalEnd = true;
    song.tracks[0].measures[0].bass = [];
    const engine = new PlaybackEngine();
    const visuals = vi.fn();
    engine.onVisualState(visuals);
    await engine.play(song, song.tracks[0].id);
    runAt(0);
    expect(clock.attack.mock.lastCall?.[1]).toBe(2);
    runAt(0.5);
    expect(visuals.mock.lastCall?.[0].pianoKeys).toEqual([]);
    engine.stop();

    notes[0].pedalStart = false;
    notes[0].articulations = ['staccato'];
    await engine.play(song, song.tracks[0].id);
    runAt(0);
    expect(clock.attack.mock.lastCall?.[1]).toBe(0.15);
    clock.seconds = 0.49;
    engine.setActiveTrack(song.tracks[0].id);
    expect(visuals.mock.lastCall?.[0].pianoKeys).toEqual(['c/4']);
    engine.stop();
  });

  it('extends visual duration for dotted fermatas and keeps tied notes lit across measures', async () => {
    const song = simpleSong();
    song.tracks[0].measures = [
      { treble: [{ id: 'held', keys: ['c/4'], duration: 'w', tieToNext: true }], bass: [] },
      { treble: [{ id: 'end', keys: ['c/4'], duration: 'q', dotted: true, articulations: ['fermata'] }], bass: [] },
    ];
    const engine = new PlaybackEngine();
    const visuals = vi.fn();
    engine.onVisualState(visuals);
    await engine.play(song, song.tracks[0].id);
    runAt(0);
    runAt(2);
    expect(visuals.mock.lastCall?.[0]).toEqual({
      measureIdx: 1, noteIds: ['end'], pianoKeys: ['c/4'],
    });
    clock.seconds = 3.12;
    engine.setActiveTrack(song.tracks[0].id);
    expect(visuals.mock.lastCall?.[0].pianoKeys).toEqual(['c/4']);
    runAt(3.125);
    expect(visuals.mock.lastCall?.[0].pianoKeys).toEqual([]);
    engine.stop();
  });
});
