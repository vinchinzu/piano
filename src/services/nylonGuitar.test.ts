import { describe, expect, it } from 'vitest';
import { createNylonStringSamples } from './nylonGuitar';

describe('nylon-string sound', () => {
  it('generates finite, bounded audio with a decaying pluck at the requested pitch', () => {
    const sampleRate = 22050;
    const samples = createNylonStringSamples(57, sampleRate); // A3, 220 Hz
    expect(samples.length).toBe(sampleRate * 4);
    expect(samples.every(Number.isFinite)).toBe(true);
    expect(Math.max(...samples.slice(0, 8192).map(Math.abs))).toBeCloseTo(0.75);
    const energy = (start: number) => samples.slice(start, start + 2205).reduce((sum, value) => sum + value * value, 0);
    expect(energy(66000)).toBeLessThan(energy(2205) * 0.01);
    const crossings: number[] = [];
    for (let i = 2206; i < 11025; i++) if (samples[i] >= 0 && samples[i - 1] < 0) crossings.push(i);
    const measuredFrequency = (crossings.length - 1) * sampleRate / (crossings[crossings.length - 1] - crossings[0]);
    expect(Math.abs(measuredFrequency - 220)).toBeLessThan(0.1);
    expect(samples[samples.length - 1]).toBeCloseTo(0, 4);
  });
});
