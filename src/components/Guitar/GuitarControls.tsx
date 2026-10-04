import { useEffect, useState } from 'react';
import type { NoteEntry } from '../../models/song';
import {
  GUITAR_LAYERS, GUITAR_PROFILES, GUITAR_STAGES, GUITAR_STRINGS,
  defaultGuitarSettings, guitarPositionMidi, resolveGuitarPositions,
  type GuitarPosition, type GuitarProfile, type GuitarSettings,
} from '../../models/guitar';
import { getNoteMidiPitches } from '../../models/song';
import './Guitar.css';

interface Props {
  mode: 'piano' | 'guitar';
  onOpenExercise: () => void;
  hasExercise: boolean;
  disabled: boolean;
  settings?: GuitarSettings;
  selectedNote: NoteEntry | null;
  keySignature: string;
  onModeChange: (mode: 'piano' | 'guitar') => void;
  onSettingsChange: (settings: GuitarSettings) => void;
  onPositionsChange: (positions: (GuitarPosition | null)[] | undefined) => void;
}

const circled = ['①', '②', '③', '④', '⑤', '⑥'];

export function GuitarControls({ onOpenExercise, hasExercise, mode, disabled, settings = defaultGuitarSettings(), selectedNote, keySignature, onModeChange, onSettingsChange, onPositionsChange }: Props) {
  const [guidanceOpen, setGuidanceOpen] = useState(() => typeof window === 'undefined' || !window.matchMedia('(max-width: 760px)').matches);
  useEffect(() => {
    const query = window.matchMedia('(max-width: 760px)');
    const update = () => setGuidanceOpen(!query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  const positions = selectedNote ? resolveGuitarPositions(selectedNote, keySignature, settings) : [];
  const pitches = selectedNote ? getNoteMidiPitches(selectedNote, keySignature) : [];
  const stage = GUITAR_STAGES.findIndex((stage) => GUITAR_LAYERS.every(({ id }) => stage.layers[id] === settings.layers[id]));
  const updatePosition = (index: number, position: GuitarPosition | null) => {
    const overrides = selectedNote?.keys.map((_, i) => selectedNote.guitarPositions?.[i] ?? null) ?? [];
    overrides[index] = position;
    onPositionsChange(overrides.some(Boolean) ? overrides : undefined);
  };
  return (
    <div className="instrument-controls">
      <div className="instrument-controls-row">
        <label>Instrument mode
          <select aria-label="Instrument mode" value={mode} disabled={disabled} onChange={(event) => onModeChange(event.target.value as 'piano' | 'guitar')}>
            <option value="piano">Piano</option><option value="guitar">Guitar</option>
          </select>
        </label>
        {hasExercise && <button type="button" onClick={onOpenExercise}>Guitar exercise 1</button>}
        {mode === 'guitar' && <details className="guitar-practice-panel" open={guidanceOpen} onToggle={(event) => setGuidanceOpen(event.currentTarget.open)}>
          <summary>Practice guidance</summary>
          <div className="guitar-practice-options">
          <label>Position
            <select aria-label="Guitar position guide" value={settings.profile} onChange={(event) => onSettingsChange({ ...settings, profile: event.target.value as GuitarProfile })}>
              {Object.entries(GUITAR_PROFILES).map(([id, profile]) => <option key={id} value={id}>{profile.label}</option>)}
            </select>
          </label>
          <label>Practice stage
            <select aria-label="Guitar practice stage" value={stage} onChange={(event) => onSettingsChange({ ...settings, layers: { ...GUITAR_STAGES[Number(event.target.value)].layers } })}>
              <option value={-1} disabled>Custom layers</option>
              {GUITAR_STAGES.map((stage, index) => <option key={stage.label} value={index}>{stage.label}</option>)}
            </select>
          </label>
          <div className="guitar-layer-toggles" role="group" aria-label="Guitar annotation layers">
            {GUITAR_LAYERS.map(({ id, label }) => <label key={id}>
              <input type="checkbox" checked={settings.layers[id]} onChange={(event) => onSettingsChange({ ...settings, layers: { ...settings.layers, [id]: event.target.checked } })} />{label}
            </label>)}
          </div>
          </div>
        </details>}
      </div>
      {mode === 'guitar' && <>
        <details className="guitar-help"><summary>Guitar notation guide</summary><p className="guitar-legend">① = thinnest string · ⑥ = thickest · Fingering: 0 open, 1 index, 2 middle, 3 ring, 4 little · Guitar sounds one octave below the score.</p></details>
        {selectedNote && !selectedNote.isRest && !selectedNote.isSpacer && <details className="guitar-position-editor"><summary>Selected note positions</summary><div className="guitar-note-overrides">
          {pitches.map((midi, index) => {
            const auto = resolveGuitarPositions({ ...selectedNote, guitarPositions: undefined }, keySignature, settings)[index];
            const current = selectedNote.guitarPositions?.[index];
            const candidates = GUITAR_STRINGS.flatMap(({ string, writtenMidi }) => {
              const fret = midi - writtenMidi;
              return fret >= 0 && fret <= 19 ? [{ string, fret, finger: fret === 0 ? 0 : Math.min(4, Math.max(1, fret - GUITAR_PROFILES[settings.profile].fingerBase)) }] : [];
            });
            return <div className="guitar-tone-override" key={index}>
              <label>{selectedNote.keys[index].toUpperCase()}
                <select aria-label={`Guitar string and fret for tone ${index + 1}`} value={current && guitarPositionMidi(current) === midi ? `${current.string}:${current.fret}` : 'auto'} onChange={(event) => {
                  const candidate = candidates.find((position) => `${position.string}:${position.fret}` === event.target.value);
                  updatePosition(index, candidate ?? null);
                }}>
                  <option value="auto">Auto {auto ? `(${circled[auto.string - 1]} fret ${auto.fret})` : '(outside guide)'}</option>
                  {candidates.map((position) => <option key={position.string} value={`${position.string}:${position.fret}`}>{circled[position.string - 1]} fret {position.fret}</option>)}
                </select>
              </label>
              <label>Finger
                <select aria-label={`Guitar finger for tone ${index + 1}`} value={positions[index]?.finger ?? 0} disabled={!positions[index] || positions[index]?.fret === 0} onChange={(event) => {
                  const position = positions[index];
                  if (position) updatePosition(index, { ...position, finger: Number(event.target.value) });
                }}>
                  <option value={0} disabled={Boolean(positions[index]?.fret)}>0 (open)</option>
                  {[1, 2, 3, 4].map((finger) => <option key={finger} value={finger}>{finger}</option>)}
                </select>
              </label>
            </div>;
          })}
          {selectedNote.guitarPositions && <button type="button" onClick={() => onPositionsChange(undefined)}>Use automatic guide</button>}
          {positions.some((position) => !position) && <span className="guitar-guide-hint">Some tones need another position or a string override.</span>}
        </div></details>}
      </>}
    </div>
  );
}
