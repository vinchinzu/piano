import { GUITAR_STRINGS, GUITAR_PROFILES, type GuitarPosition, type GuitarProfile } from '../../models/guitar';
import { midiToPianoKey } from '../../models/song';
import './Guitar.css';

interface Props {
  profile: GuitarProfile;
  positions: (GuitarPosition | null)[];
  playing: boolean;
  onPress: (writtenKey: string, position: GuitarPosition) => void;
}

export function GuitarFretboard({ profile, positions, playing, onPress }: Props) {
  const rule = GUITAR_PROFILES[profile];
  const frets = [...new Set([
    ...Array.from({ length: rule.maxFret - rule.minFret + 1 }, (_, index) => rule.minFret + index),
    ...positions.flatMap((position) => position ? [position.fret] : []),
  ])].sort((a, b) => a - b);
  return <div className="guitar-fretboard" role="group" aria-label="Guitar fretboard, standard tuning" style={{ '--guitar-fret-count': frets.length } as React.CSSProperties}>
    <div className="guitar-fret-row guitar-fret-header"><span>String</span>{frets.map((fret) => <span key={fret}>{fret === 0 ? 'Open' : `Fret ${fret}`}</span>)}</div>
    {GUITAR_STRINGS.map(({ string, name, writtenMidi }) => <div className="guitar-fret-row" key={string}>
      <span className="guitar-string-label"><span className="circled-string">{string}</span>{name}</span>
      {frets.map((fret) => {
        const key = midiToPianoKey(writtenMidi + fret);
        const active = positions.some((position) => position?.string === string && position.fret === fret);
        return <button type="button" key={fret} className={`guitar-fret ${active ? playing ? 'playing' : 'selected' : ''} ${fret === 0 ? 'open-string' : ''}`}
          aria-pressed={active} aria-label={`String ${string}, ${fret === 0 ? 'open' : `fret ${fret}`}, written ${key.toUpperCase()}`}
          onClick={() => onPress(key, { string, fret, finger: fret === 0 ? 0 : Math.min(4, Math.max(1, fret - rule.fingerBase)) })}>
          <span>{key.split('/')[0].toUpperCase().replace('#', '♯')}</span>
        </button>;
      })}
    </div>)}
  </div>;
}
