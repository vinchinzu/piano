import type { CSSProperties } from 'react';
import { pitchColor, type ReadingSettings } from '../../models/practiceReading';
const KEYS = [60, 62, 64, 65, 67, 69, 71, 72];
const NAMES = ['C', 'D', 'E', 'F', 'G', 'A', 'B', 'C'];
const BLACK = [{ midi: 61, position: 1 }, { midi: 63, position: 2 }, { midi: 66, position: 4 }, { midi: 68, position: 5 }, { midi: 70, position: 6 }];
const label = (midi: number) => ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'][midi % 12];
interface KeyboardProps { settings: ReadingSettings; held: ReadonlySet<number>; expected: number | null; onDown: (midi: number) => void; onUp: (midi: number) => void; }
export function PracticeKeyboard({ settings, held, expected, onDown, onUp }: KeyboardProps) {
  const events = (midi: number) => ({
    onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); onDown(midi); },
    onPointerUp: () => onUp(midi), onPointerCancel: () => onUp(midi), onLostPointerCapture: () => onUp(midi),
    onClick: (event: React.MouseEvent<HTMLButtonElement>) => { if (event.detail === 0) { onDown(midi); window.setTimeout(() => onUp(midi), 180); } },
  });
  return <div className="practice-keyboard" role="group" aria-label="Practice piano, middle C to high C">
    <div className="practice-white-keys">{KEYS.map((midi, index) => <button key={midi} aria-label={`Play ${NAMES[index]}${midi === 72 ? 5 : 4}`}
      aria-pressed={held.has(midi)} className={`${settings.keyboardGuide && expected === midi ? 'target' : ''} ${held.has(midi) ? 'pressed' : ''}`}
      style={{ '--pitch-color': pitchColor(midi) } as CSSProperties} {...events(midi)}>
      {settings.keyboardGuide && expected === midi && <span className="key-star" aria-hidden="true">★</span>}
      {settings.support === 'guided' && <><strong>{NAMES[index]}</strong><small>{index === 0 ? 'Middle C' : midi === 72 ? 'High C' : ''}</small></>}
      {settings.support !== 'staff' && <span className="key-color" aria-hidden="true" />}
    </button>)}</div>
    {BLACK.map((key) => <button key={key.midi} className={`practice-black-key ${held.has(key.midi) ? 'pressed' : ''}`} style={{ left: `${key.position * 12.5}%` }}
      aria-label={`Play ${label(key.midi)}4`} {...events(key.midi)} />)}
  </div>;
}
