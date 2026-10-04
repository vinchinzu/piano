import {
  midiToPianoKey,
  notationPitchToPianoKey,
  pianoKeyToMidi,
  type NoteEntry,
} from '../models/song';

export interface PlaybackVisualState {
  measureIdx: number;
  noteIds: string[];
  pianoKeys: string[];
}

export interface PlaybackVisualNote {
  trackId: string;
  measureIdx: number;
  note: NoteEntry;
  startTime: number;
  /** Full score duration, including dots and fermatas; independent of audio release/pedal. */
  duration: number;
}

interface VisualSnapshot {
  time: number;
  state: PlaybackVisualState;
}

interface VisualBoundary {
  starts: PlaybackVisualNote[];
  stops: PlaybackVisualNote[];
}

// Merge boundaries that differ only through floating-point beat arithmetic.
const timeKey = (seconds: number) => Math.round(seconds * 1_000_000);

export function emptyPlaybackVisualState(measureIdx = 0): PlaybackVisualState {
  return { measureIdx, noteIds: [], pianoKeys: [] };
}

/**
 * Immutable score guidance, sampled by transport position. Each interval is
 * [start, end): releases and attacks at the same beat become one snapshot.
 * Absolute snapshots also make track changes, resume, and loops independent
 * of which visual callbacks have already run.
 */
export class PlaybackVisualTimeline {
  private snapshots = new Map<string, VisualSnapshot[]>();
  readonly eventTimes: number[];

  constructor(notes: PlaybackVisualNote[], keySignature: string) {
    const tracks = new Map<string, Map<number, VisualBoundary>>();
    const times = new Set<number>();
    for (const entry of notes) {
      if (entry.duration <= 0) continue;
      let boundaries = tracks.get(entry.trackId);
      if (!boundaries) {
        boundaries = new Map();
        tracks.set(entry.trackId, boundaries);
      }
      for (const [time, kind] of [
        [entry.startTime, 'starts'],
        [entry.startTime + entry.duration, 'stops'],
      ] as const) {
        const key = timeKey(time);
        const boundary = boundaries.get(key) ?? { starts: [], stops: [] };
        boundary[kind].push(entry);
        boundaries.set(key, boundary);
        times.add(key);
      }
    }

    for (const [trackId, boundaries] of tracks) {
      const active = new Set<PlaybackVisualNote>();
      const snapshots: VisualSnapshot[] = [];
      let measureIdx = 0;
      for (const [time, boundary] of [...boundaries].sort(([a], [b]) => a - b)) {
        boundary.stops.forEach((entry) => active.delete(entry));
        boundary.starts.forEach((entry) => {
          measureIdx = entry.measureIdx;
          if (!entry.note.isRest && !entry.note.isSpacer) active.add(entry);
        });
        const keys = new Set<string>();
        for (const { note } of active) {
          if (note.drumMidi) note.drumMidi.forEach((midi) => keys.add(midiToPianoKey(midi)));
          else note.keys.forEach((key, index) => {
            keys.add(notationPitchToPianoKey(key, note.accidentals?.[index], keySignature));
          });
        }
        snapshots.push({
          time,
          state: {
            measureIdx,
            noteIds: [...new Set([...active].map((entry) => entry.note.id))],
            pianoKeys: [...keys].sort((a, b) => pianoKeyToMidi(a) - pianoKeyToMidi(b)),
          },
        });
      }
      this.snapshots.set(trackId, snapshots);
    }
    this.eventTimes = [...times].sort((a, b) => a - b).map((time) => time / 1_000_000);
  }

  getState(seconds: number, trackId: string | null): PlaybackVisualState {
    const snapshots = trackId ? this.snapshots.get(trackId) : undefined;
    if (!snapshots?.length) return emptyPlaybackVisualState();
    const time = timeKey(seconds);
    let low = 0;
    let high = snapshots.length;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if (snapshots[middle].time <= time) low = middle + 1;
      else high = middle;
    }
    const state = snapshots[low - 1]?.state;
    return state
      ? { ...state, noteIds: [...state.noteIds], pianoKeys: [...state.pianoKeys] }
      : emptyPlaybackVisualState();
  }
}
