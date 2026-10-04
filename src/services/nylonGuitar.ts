/** Locally generated plucked-string samples: rounded attack and fast-decaying upper partials. */
export function createNylonStringSamples(midi: number, sampleRate: number, seconds = 4): Float32Array {
  const frequency = 440 * 2 ** ((midi - 69) / 12);
  const samples = new Float32Array(Math.ceil(sampleRate * seconds));
  const harmonics = Math.min(18, Math.floor(sampleRate / (2 * frequency)));
  for (let harmonic = 1; harmonic <= harmonics; harmonic++) {
    // Pluck at 1/5 of the string length; the fifth partial is naturally subdued.
    const amplitude = Math.sin(harmonic * Math.PI * 0.2) / harmonic ** 1.65;
    const decay = 1.25 + harmonic * 0.55 + frequency / 900;
    const step = 2 * Math.PI * frequency * harmonic / sampleRate;
    for (let i = 0; i < samples.length; i++) {
      const time = i / sampleRate;
      samples[i] += amplitude * Math.sin(step * i) * Math.exp(-time * decay);
    }
  }
  let peak = 0;
  for (let i = 0; i < samples.length; i++) {
    const time = i / sampleRate;
    samples[i] *= (1 - Math.exp(-time * 1600)) * Math.min(1, (seconds - time) / 0.03);
    peak = Math.max(peak, Math.abs(samples[i]));
  }
  if (peak > 0) for (let i = 0; i < samples.length; i++) samples[i] *= 0.75 / peak;
  return samples;
}
