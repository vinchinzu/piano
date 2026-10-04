import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PracticeAudio, type PracticeTransport } from './practiceAudio';

class TestAudioContext {
  static latest: TestAudioContext;
  state = 'suspended';
  destination = {};
  private elapsed = 0;
  private resumedAt = 0;
  starts: { at: number; frequency: number }[] = [];
  stops: number[] = [];
  constructor() { TestAudioContext.latest = this; }
  get currentTime() { return this.elapsed + (this.state === 'running' ? (Date.now() - this.resumedAt) / 1000 : 0); }
  async resume() { if (this.state !== 'running') { this.resumedAt = Date.now(); this.state = 'running'; } }
  async suspend() { this.elapsed = this.currentTime; this.state = 'suspended'; }
  async close() { this.state = 'closed'; }
  createGain() { return { connect() {}, disconnect() {}, gain: { value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} } }; }
  createOscillator() {
    const frequency = { value: 0 };
    return { frequency, type: 'triangle', connect() {}, disconnect() {}, onended: null,
      start: (at: number) => { this.starts.push({ at, frequency: frequency.value }); },
      stop: (at = this.currentTime) => { this.stops.push(at); } };
  }
}
const options = (): PracticeTransport => ({ notes: Array.from({ length: 8 }, () => ({ midi: 60, beats: 1, finger: 1 })), chords: ['C', 'G'], tempo: 120, melody: true, backing: true, metronome: true, style: 'dreamy' });

describe('practice playback pause and stop', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.stubGlobal('window', globalThis); vi.stubGlobal('AudioContext', TestAudioContext); });
  afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); });
  it('freezes the beat and scheduler, then resumes without restarting the count-in', async () => {
    const audio = new PracticeAudio(); await audio.start(options());
    vi.advanceTimersByTime(3000);
    const context = TestAudioContext.latest;
    await audio.pause();
    const beat = audio.beat(); const count = context.starts.length;
    expect(beat).toBeCloseTo(1.7);
    vi.advanceTimersByTime(2000);
    expect(audio.beat()).toBe(beat);
    expect(context.starts).toHaveLength(count);
    await audio.resume(); vi.advanceTimersByTime(500);
    expect(audio.beat()).toBeCloseTo(beat! + 1);
    expect(context.starts.length).toBeGreaterThan(count);
    expect(context.starts.slice(count).every((event) => event.at >= 3)).toBe(true);
    audio.dispose();
  });
  it('stops suspended voices and starts a fresh count-in on the next play', async () => {
    const audio = new PracticeAudio(); await audio.start(options());
    vi.advanceTimersByTime(3000); await audio.pause();
    const context = TestAudioContext.latest; const count = context.stops.length;
    audio.stop();
    expect(audio.beat()).toBeNull(); expect(context.stops.length).toBeGreaterThan(count);
    vi.advanceTimersByTime(1000); await audio.resume();
    expect(context.state).toBe('suspended');
    await audio.start(options());
    expect(context.state).toBe('running'); expect(audio.beat()).toBeCloseTo(-4.3);
    audio.dispose(); expect(context.state).toBe('closed');
  });
});
