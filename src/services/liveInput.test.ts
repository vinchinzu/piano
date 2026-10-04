import { describe, expect, it } from 'vitest';
import { detectPitch, parseMidiMessage, PitchGate, MidiInputSession, type PitchEstimate, type LiveNote } from './liveInput';

function samples(frequency: number, harmonics = false, sampleRate = 48000) {
  return Float32Array.from({ length: 4096 }, (_, i) => {
    const phase = 2 * Math.PI * frequency * i / sampleRate;
    return 0.15 * Math.sin(phase) + (harmonics ? 0.25 * Math.sin(phase * 2) + 0.08 * Math.sin(phase * 3) : 0);
  });
}
const pitch = (midi: number, rms = 0.1): PitchEstimate => ({ midi, rms, frequency: 440, cents: 0, clarity: 0.99 });

describe('live MIDI decoding', () => {
  it('handles channels, velocity-zero releases and ignores non-note messages', () => {
    expect(parseMidiMessage([0x95, 60, 100])).toEqual({ midi: 60, velocity: 100 / 127, on: true });
    expect(parseMidiMessage([0x9f, 60, 0])?.on).toBe(false);
    expect(parseMidiMessage([0x80, 60, 64])?.on).toBe(false);
    expect(parseMidiMessage([0xb0, 64, 127])).toBeNull();
    expect(parseMidiMessage([0xf8])).toBeNull();
    expect(parseMidiMessage([0x90, 200, 70])).toBeNull();
  });
  it('releases notes on device switching, hot unplug, and session close', () => {
    const notes: LiveNote[] = [];
    const one = { id: 'one', name: 'Piano', state: 'connected', onmidimessage: null, close: async () => {} };
    const two = { ...one, id: 'two' };
    const access = { inputs: new Map([['one', one], ['two', two]]), onstatechange: null };
    const session = new MidiInputSession(access as unknown as MIDIAccess, (note) => notes.push(note), () => {});
    const send = (port: typeof one, data: number[]) => (port.onmidimessage as unknown as (event: { data: number[] }) => void)({ data });
    send(one, [0x90, 60, 90]);
    session.select('two');
    expect(notes.map((note) => [note.midi, note.on])).toEqual([[60, true], [60, false]]);
    expect(one.onmidimessage).toBeNull();
    send(two, [0x90, 67, 90]);
    two.state = 'disconnected';
    (access.onstatechange as unknown as () => void)();
    expect(notes.at(-1)).toMatchObject({ midi: 67, on: false });
    send(one, [0x90, 64, 90]); session.close();
    expect(notes.at(-1)).toMatchObject({ midi: 64, on: false });
    expect(access.onstatechange).toBeNull();
  });
});

describe('microphone pitch detection', () => {
  it.each([44100, 48000])('detects piano-range pitches at %i Hz without octave errors', (rate) => {
    for (const midi of [48, 60, 62, 64, 65, 67, 69, 72, 84]) {
      const frequency = 440 * 2 ** ((midi - 69) / 12);
      const result = detectPitch(samples(frequency, false, rate), rate);
      expect(result?.midi).toBe(midi);
      expect(Math.abs(result!.cents)).toBeLessThan(5);
    }
  });
  it('finds the fundamental when the second harmonic is stronger', () => {
    expect(detectPitch(samples(261.6256, true), 48000)?.midi).toBe(60);
  });
  it('ignores silence, DC offset, quiet sound, and unpitched noise', () => {
    expect(detectPitch(new Float32Array(4096), 48000)).toBeNull();
    expect(detectPitch(new Float32Array(4096).fill(0.1), 48000)).toBeNull();
    expect(detectPitch(samples(440), 48000, 0.3)).toBeNull();
    let seed = 42;
    const noise = Float32Array.from({ length: 4096 }, () => { seed = (seed * 1664525 + 1013904223) >>> 0; return (seed / 2 ** 32 - 0.5) * 0.2; });
    expect(detectPitch(noise, 48000)).toBeNull();
  });
  it('requires stable notes and supports repeated strikes and pitch changes', () => {
    const gate = new PitchGate();
    expect(gate.update(pitch(60))).toEqual([]);
    expect(gate.update(pitch(60))).toEqual([{ midi: 60, on: true }]);
    expect(gate.update(pitch(60))).toEqual([]);
    expect(gate.update(pitch(62))).toEqual([]);
    expect(gate.update(pitch(62))).toEqual([{ midi: 60, on: false }, { midi: 62, on: true }]);
    gate.update(null);
    expect(gate.update(null)).toEqual([{ midi: 62, on: false }]);
    gate.update(pitch(62, 0.02)); gate.update(pitch(62, 0.02));
    expect(gate.update(pitch(62, 0.15))).toEqual([{ midi: 62, on: false }]);
    expect(gate.update(pitch(62, 0.15))).toEqual([{ midi: 62, on: true }]);
  });
});
