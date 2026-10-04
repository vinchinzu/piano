import { CHORD_PITCHES, noteTimeline, type LessonNote, type Lesson } from '../models/lessons';

export type BackingStyle = 'dreamy' | 'pop';
export interface PracticeTransport {
  notes: LessonNote[];
  chords: Lesson['chords'];
  tempo: number;
  melody: boolean;
  backing: boolean;
  metronome: boolean;
  style: BackingStyle;
  loop?: boolean;
}
/** Small local synth and look-ahead scheduler. No downloads or shared editor transport. */
export class PracticeAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private voices = new Set<OscillatorNode>();
  private timer: number | null = null;
  private origin = 0;
  private beatDuration = 1;
  private generation = 0;
  private running = false;
  private paused = false;
  private level = 0.55;
  private backingLevel = 0.65;
  private backingGain: GainNode | null = null;
  private async ready() {
    if (!this.context || this.context.state === 'closed') {
      this.context = new AudioContext();
      this.master = this.context.createGain(); this.master.gain.value = this.level;
      this.master.connect(this.context.destination);
      this.backingGain = this.context.createGain(); this.backingGain.gain.value = this.backingLevel;
      this.backingGain.connect(this.master);
    }
    await this.context.resume();
    return this.context;
  }
  setVolume(level: number) { this.level = level; if (this.master) this.master.gain.value = level; }
  setBackingVolume(level: number) { this.backingLevel = level; if (this.backingGain) this.backingGain.gain.value = level; }
  private tone(midi: number, at: number, length: number, volume: number, backing = false, type: OscillatorType = 'triangle') {
    const context = this.context;
    const destination = backing ? this.backingGain : this.master;
    if (!context || !destination) return;
    const oscillator = context.createOscillator(); const gain = context.createGain();
    oscillator.type = type; oscillator.frequency.value = 440 * 2 ** ((midi - 69) / 12);
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(volume, at + 0.012);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, volume * 0.25), at + Math.max(0.04, length * 0.75));
    gain.gain.exponentialRampToValueAtTime(0.0001, at + length + 0.12);
    oscillator.connect(gain); gain.connect(destination);
    this.voices.add(oscillator);
    oscillator.onended = () => { this.voices.delete(oscillator); oscillator.disconnect(); gain.disconnect(); };
    oscillator.start(at); oscillator.stop(at + length + 0.15);
  }
  async preview(midi: number, velocity = 0.75) {
    const request = this.generation;
    const context = await this.ready();
    if (request !== this.generation) return;
    this.tone(midi, context.currentTime + 0.008, 0.38, velocity * 0.28);
  }
  async start(options: PracticeTransport) {
    this.stop();
    const request = this.generation;
    const context = await this.ready();
    if (request !== this.generation) return;
    this.running = true; this.paused = false;
    this.beatDuration = 60 / options.tempo;
    this.origin = context.currentTime + 0.15 + 4 * this.beatDuration;
    const timeline = noteTimeline(options.notes);
    const totalBeats = options.notes.reduce((sum, note) => sum + note.beats, 0) || 16;
    let nextHalfBeat = -8;
    let noteIndex = 0;
    let cycle = 0;
    const schedule = () => {
      if (this.paused || !this.running) return;
      const horizon = context.currentTime + 0.18;
      while (this.origin + nextHalfBeat / 2 * this.beatDuration < horizon) {
        const beat = nextHalfBeat / 2;
        if (!options.loop && beat >= totalBeats) break;
        const at = this.origin + beat * this.beatDuration;
        if (beat < 0) {
          if (Number.isInteger(beat)) this.tone(beat === -4 ? 90 : 85, at, 0.035, 0.12, false, 'sine');
        } else {
          const localBeat = beat % totalBeats;
          const chord = CHORD_PITCHES[options.chords[Math.floor(localBeat / 4) % options.chords.length] ?? 'C'];
          if (options.backing) {
            if (localBeat % 4 === 0) {
              chord.forEach((midi) => this.tone(midi + 12, at, this.beatDuration * 3.7, 0.045, true, 'sine'));
              this.tone(chord[0] - 12, at, this.beatDuration * 0.9, 0.13, true, 'sine');
            }
            if (options.style === 'pop') {
              if (Number.isInteger(beat) && beat % 2 === 0) this.tone(30, at, 0.09, 0.2, true, 'sine');
              if (Number.isInteger(beat) && beat % 2 === 1) this.tone(74, at, 0.055, 0.045, true, 'triangle');
              if (!Number.isInteger(beat)) this.tone(103, at, 0.025, 0.018, true, 'square');
            } else if (Number.isInteger(beat)) this.tone(chord[Math.floor(localBeat) % 3] + 24, at, this.beatDuration * 0.65, 0.05, true, 'sine');
          }
          if (options.metronome && Number.isInteger(beat)) this.tone(beat % 4 === 0 ? 90 : 85, at, 0.025, 0.045, false, 'sine');
        }
        nextHalfBeat++;
      }
      if (options.melody && timeline.length) {
        while (this.origin + (timeline[noteIndex].startBeat + cycle * totalBeats) * this.beatDuration < horizon) {
          const note = timeline[noteIndex];
          this.tone(note.midi, this.origin + (note.startBeat + cycle * totalBeats) * this.beatDuration,
            note.beats * this.beatDuration * 0.85, 0.25);
          noteIndex++;
          if (noteIndex === timeline.length) { noteIndex = 0; cycle++; if (!options.loop) break; }
        }
        if (!options.loop && cycle) options.melody = false;
      }
    };
    schedule();
    this.timer = window.setInterval(schedule, 45);
  }
  async pause() {
    if (!this.running || !this.context) return;
    this.paused = true;
    await this.context.suspend();
  }
  async resume() {
    if (!this.running || !this.context) return;
    const request = this.generation;
    await this.context.resume();
    if (request === this.generation) this.paused = false;
  }
  beat() { return this.running && this.context ? (this.context.currentTime - this.origin) / this.beatDuration : null; }
  stop() {
    this.generation++;
    this.running = false; this.paused = false;
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
    for (const voice of this.voices) { try { voice.stop(); } catch { /* Voice has already ended. */ } }
    this.voices.clear();
  }
  dispose() { this.stop(); if (this.context) void this.context.close(); }
}
