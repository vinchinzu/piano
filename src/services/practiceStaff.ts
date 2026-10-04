import { Renderer, Stave, StaveNote, Voice, Formatter, Beam, Dot, Accidental, BarlineType } from 'vexflow';
import { noteTimeline, type LessonNote } from '../models/lessons';
import { midiToPianoKey } from '../models/song';
import { pitchColor, readingFinger, type ReadingSettings } from '../models/practiceReading';

export const PRACTICE_BAR_WIDTH = 360;
export const PRACTICE_STAFF_HEIGHT = 188;
export interface StaffNoteAnchor { x: number; y: number; startBeat: number; beats: number; element: SVGGElement; }
export interface PracticeStaffResult { anchors: StaffNoteAnchor[]; cursor: SVGLineElement; }
const namespace = 'http://www.w3.org/2000/svg';
function label(parent: SVGElement, x: number, y: number, value: string, className: string, color?: string) {
  const text = document.createElementNS(namespace, 'text');
  text.setAttribute('x', String(x)); text.setAttribute('y', String(y));
  text.setAttribute('text-anchor', 'middle'); text.setAttribute('class', className);
  if (color) text.setAttribute('fill', color);
  text.textContent = value; parent.append(text);
}
/** A single horizontal engraving rail. Clipping and movement belong to PracticeStaff. */
export function renderPracticeStaff(container: HTMLDivElement, notes: LessonNote[], settings: ReadingSettings, lessonId: string, firstBar = 1): PracticeStaffResult {
  container.replaceChildren();
  const timeline = noteTimeline(notes);
  const totalBeats = notes.reduce((sum, note) => sum + note.beats, 0);
  const barCount = Math.max(1, Math.ceil(totalBeats / 4));
  const width = barCount * PRACTICE_BAR_WIDTH;
  const renderer = new Renderer(container, Renderer.Backends.SVG);
  renderer.resize(width, PRACTICE_STAFF_HEIGHT);
  const context = renderer.getContext();
  context.setFillStyle('#282538'); context.setStrokeStyle('#585565');
  const anchors: StaffNoteAnchor[] = [];
  for (let bar = 0; bar < barCount; bar++) {
    const group = context.openGroup('practice-measure');
    group?.setAttribute('data-bar', String(firstBar + bar));
    const x = bar * PRACTICE_BAR_WIDTH;
    const stave = new Stave(x + 8, 22, PRACTICE_BAR_WIDTH - 16);
    // Repeating the clef keeps each one-bar window readable on its own.
    stave.addClef('treble');
    if (bar === 0) stave.addTimeSignature('4/4');
    if (bar === barCount - 1) stave.setEndBarType(BarlineType.END);
    stave.setContext(context).draw();
    const entries = timeline.filter((note) => Math.floor(note.startBeat / 4) === bar);
    const vexNotes = entries.map((note) => {
      const duration = ({ 0.5: '8', 1: 'q', 1.5: 'q', 2: 'h', 4: 'w' } as Record<number, string>)[note.beats];
      const key = midiToPianoKey(note.midi);
      const vex = new StaveNote({ keys: [key], duration: duration + (note.beats === 1.5 ? 'd' : ''), clef: 'treble', autoStem: true });
      if (key.includes('#')) vex.addModifier(new Accidental('#'), 0);
      if (note.beats === 1.5) Dot.buildAndAttach([vex]);
      const color = settings.support === 'staff' ? '#282538' : pitchColor(note.midi);
      vex.setStyle({ fillStyle: color, strokeStyle: color });
      return vex;
    });
    const voice = new Voice({ numBeats: 4, beatValue: 4 }).setMode(Voice.Mode.SOFT).addTickables(vexNotes);
    new Formatter().joinVoices([voice]).format([voice], PRACTICE_BAR_WIDTH - (bar === 0 ? 116 : 82));
    const beams = Beam.generateBeams(vexNotes, { maintainStemDirections: true });
    voice.draw(context, stave);
    beams.forEach((beam) => beam.setContext(context).draw());
    const elements = Array.from(container.querySelectorAll<SVGGElement>('.vf-stavenote')).slice(-vexNotes.length);
    entries.forEach((note, index) => {
      const vex = vexNotes[index]; const element = elements[index];
      if (!element) return;
      const head = vex.noteHeads[0];
      const centerX = head.getAbsoluteX() + head.getWidth() / 2;
      const centerY = head.getY();
      element.classList.add('practice-note');
      element.setAttribute('data-note-index', String(note.index));
      element.setAttribute('data-midi', String(note.midi));
      element.setAttribute('data-beats', String(note.beats));
      element.setAttribute('data-bar', String(firstBar + bar));
      const name = keyLabel(note.midi);
      element.setAttribute('role', 'img');
      element.setAttribute('aria-label', `${name}, ${note.beats} ${note.beats === 1 ? 'beat' : 'beats'}`);
      const halo = document.createElementNS(namespace, 'ellipse');
      halo.setAttribute('cx', String(centerX)); halo.setAttribute('cy', String(centerY));
      halo.setAttribute('rx', '19'); halo.setAttribute('ry', '16'); halo.setAttribute('class', 'practice-note-halo');
      element.prepend(halo);
      if (settings.support === 'guided') label(element, centerX, 144, name.replace(/[0-9]/g, ''), 'staff-note-name', pitchColor(note.midi));
      if (settings.fingers) label(element, centerX, 167, String(readingFinger(note, lessonId)), 'staff-finger');
      anchors[note.index] = { x: centerX, y: centerY, startBeat: note.startBeat, beats: note.beats, element };
    });
    if (group) label(group, x + PRACTICE_BAR_WIDTH / 2, 16, `Bar ${firstBar + bar}`, 'staff-bar-label');
    context.closeGroup();
  }
  const svg = container.querySelector('svg')!;
  // VexFlow adds pixel dimensions inline; let the responsive rail scale the SVG.
  svg.style.width = '100%'; svg.style.height = '100%';
  svg.setAttribute('viewBox', `0 0 ${width} ${PRACTICE_STAFF_HEIGHT}`);
  svg.setAttribute('aria-label', 'Treble staff melody in 4/4');
  const cursor = document.createElementNS(namespace, 'line');
  cursor.setAttribute('class', 'practice-staff-cursor'); cursor.setAttribute('y1', '39'); cursor.setAttribute('y2', '126');
  cursor.setAttribute('visibility', 'hidden'); svg.append(cursor);
  return { anchors, cursor };
}
function keyLabel(midi: number) {
  return midiToPianoKey(midi).replace('/', '').replace('#', '♯').toUpperCase();
}
export function updatePracticeStaff(result: PracticeStaffResult, activeIndex: number, completed: ReadonlySet<number>, elapsedBeat: number | null, showCursor = true) {
  result.anchors.forEach((anchor, index) => {
    anchor.element.classList.toggle('completed', completed.has(index));
    anchor.element.classList.toggle('current', index === activeIndex);
    anchor.element.setAttribute('data-current', String(index === activeIndex));
  });
  const active = result.anchors[activeIndex];
  if (!active || !showCursor) { result.cursor.setAttribute('visibility', 'hidden'); return; }
  let x = active.x;
  if (elapsedBeat !== null) {
    const next = result.anchors[activeIndex + 1];
    const barEnd = (Math.floor(active.startBeat / 4) + 1) * PRACTICE_BAR_WIDTH - 16;
    const end = next && Math.floor(next.startBeat / 4) === Math.floor(active.startBeat / 4) ? next.x : barEnd;
    x += (end - x) * Math.max(0, Math.min(1, (elapsedBeat - active.startBeat) / active.beats));
  }
  result.cursor.setAttribute('x1', String(x)); result.cursor.setAttribute('x2', String(x)); result.cursor.setAttribute('visibility', 'visible');
}
