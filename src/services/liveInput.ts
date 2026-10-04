/** Live input stays separate from MIDI-file import and from score playback. */
export type InputSource = 'screen' | 'midi' | 'microphone';
export interface LiveNote { midi: number; velocity: number; on: boolean; source: InputSource; }
export interface MidiDevice { id: string; name: string; }
export interface PitchEstimate { midi: number; frequency: number; cents: number; clarity: number; rms: number; }

export function parseMidiMessage(data: ArrayLike<number>): Omit<LiveNote, 'source'> | null {
  if (data.length < 3) return null;
  const command = data[0] & 0xf0;
  if ((command !== 0x90 && command !== 0x80) || data[1] > 127 || data[2] > 127) return null;
  return { midi: data[1], velocity: data[2] / 127, on: command === 0x90 && data[2] > 0 };
}

/** YIN difference function: choose the first strong period, avoiding octave harmonics. */
export function detectPitch(samples: Float32Array, sampleRate: number, minimumRms = 0.008): PitchEstimate | null {
  let sum = 0;
  let mean = 0;
  for (const sample of samples) mean += sample;
  mean /= samples.length;
  for (const sample of samples) sum += (sample - mean) ** 2;
  const rms = Math.sqrt(sum / samples.length);
  if (!Number.isFinite(rms) || rms < minimumRms) return null;
  const minLag = Math.floor(sampleRate / 1500);
  const maxLag = Math.min(Math.floor(sampleRate / 65), Math.floor(samples.length / 2) - 1);
  const window = samples.length - maxLag;
  const differences = new Float32Array(maxLag + 1);
  let cumulative = 0;
  let period = -1;
  for (let lag = 1; lag <= maxLag; lag++) {
    let difference = 0;
    for (let i = 0; i < window; i++) difference += (samples[i] - samples[i + lag]) ** 2;
    cumulative += difference;
    differences[lag] = cumulative === 0 ? 1 : difference * lag / cumulative;
    if (lag > minLag && differences[lag - 1] < 0.15 && differences[lag] >= differences[lag - 1]) {
      period = lag - 1;
      break;
    }
  }
  if (period < 0) return null;
  const left = differences[period - 1];
  const middle = differences[period];
  const right = differences[period + 1];
  const denominator = 2 * (2 * middle - left - right);
  const refined = period + (denominator === 0 ? 0 : (right - left) / denominator);
  const frequency = sampleRate / refined;
  const note = 69 + 12 * Math.log2(frequency / 440);
  const midi = Math.round(note);
  if (midi < 36 || midi > 96) return null;
  return { midi, frequency, cents: (note - midi) * 100, clarity: 1 - middle, rms };
}

/** Two stable frames per attack; release on silence, pitch change, or a new key strike. */
export class PitchGate {
  private candidate: number | null = null;
  private frames = 0;
  private held: number | null = null;
  private silence = 0;
  private lastRms = 0;
  update(pitch: PitchEstimate | null): { midi: number; on: boolean }[] {
    const events: { midi: number; on: boolean }[] = [];
    if (!pitch) {
      this.silence++;
      this.frames = 0;
      this.candidate = null;
      if (this.silence >= 2 && this.held !== null) {
        events.push({ midi: this.held, on: false });
        this.held = null;
      }
      this.lastRms = 0;
      return events;
    }
    this.silence = 0;
    if (this.held === pitch.midi && this.lastRms > 0 && pitch.rms > this.lastRms * 2.4) {
      events.push({ midi: this.held, on: false });
      this.held = null;
      this.frames = 0;
    }
    this.lastRms = pitch.rms;
    if (pitch.midi !== this.candidate) { this.candidate = pitch.midi; this.frames = 1; }
    else this.frames++;
    if (this.frames >= 2 && this.held !== pitch.midi) {
      if (this.held !== null) events.push({ midi: this.held, on: false });
      this.held = pitch.midi;
      events.push({ midi: pitch.midi, on: true });
    }
    return events;
  }
}

export class MidiInputSession {
  private access: MIDIAccess;
  private selectedId = '';
  private held = new Map<string, number>();
  private closed = false;
  private onNote: (note: LiveNote) => void;
  private onDevices: (devices: MidiDevice[], selectedId: string) => void;
  constructor(access: MIDIAccess, onNote: (note: LiveNote) => void,
    onDevices: (devices: MidiDevice[], selectedId: string) => void) {
    this.access = access; this.onNote = onNote; this.onDevices = onDevices;
    access.onstatechange = () => this.refresh();
    this.refresh();
  }
  private release() {
    for (const midi of new Set(this.held.values())) this.onNote({ midi, velocity: 0, on: false, source: 'midi' });
    this.held.clear();
  }
  private refresh() {
    if (this.closed) return;
    const inputs = [...this.access.inputs.values()].filter((port) => port.state === 'connected');
    if (!inputs.some((input) => input.id === this.selectedId)) {
      this.release();
      this.selectedId = inputs[0]?.id ?? '';
    }
    for (const input of this.access.inputs.values()) {
      input.onmidimessage = input.id === this.selectedId && input.state === 'connected' ? (event) => {
        const data = event.data;
        if (!data) return;
        const command = data[0] & 0xf0;
        if (command === 0xb0 && [120, 123].includes(data[1])) { this.release(); return; }
        const note = parseMidiMessage(data);
        if (!note) return;
        const key = `${data[0] & 0x0f}:${note.midi}`;
        if (note.on) this.held.set(key, note.midi);
        else this.held.delete(key);
        if (note.on || ![...this.held.values()].includes(note.midi)) this.onNote({ ...note, source: 'midi' });
      } : null;
    }
    this.onDevices(inputs.map((port) => ({ id: port.id, name: port.name || 'MIDI keyboard' })), this.selectedId);
  }
  select(id: string) { this.release(); this.selectedId = id; this.refresh(); }
  close() {
    this.closed = true;
    this.access.onstatechange = null;
    for (const input of this.access.inputs.values()) { input.onmidimessage = null; void input.close(); }
    this.release();
  }
}

export async function startMicrophone(onNote: (note: LiveNote) => void,
  onPitch: (pitch: PitchEstimate | null) => void, threshold: () => number): Promise<() => void> {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('Microphone input needs HTTPS or localhost and a browser with microphone support.');
  const stream = await navigator.mediaDevices.getUserMedia({ audio: {
    echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1,
  } });
  let context: AudioContext;
  try { context = new AudioContext(); await context.resume(); }
  catch (error) { stream.getTracks().forEach((track) => track.stop()); throw error; }
  const source = context.createMediaStreamSource(stream);
  const analyser = context.createAnalyser();
  analyser.fftSize = 4096;
  source.connect(analyser); // Analysis only: never route the microphone to speakers.
  const samples = new Float32Array(analyser.fftSize);
  const gate = new PitchGate();
  const timer = window.setInterval(() => {
    analyser.getFloatTimeDomainData(samples);
    const pitch = detectPitch(samples, context.sampleRate, threshold());
    onPitch(pitch);
    for (const event of gate.update(pitch)) onNote({ ...event, velocity: 0.75, source: 'microphone' });
  }, 40);
  return () => {
    window.clearInterval(timer);
    source.disconnect();
    stream.getTracks().forEach((track) => track.stop());
    void context.close();
  };
}
