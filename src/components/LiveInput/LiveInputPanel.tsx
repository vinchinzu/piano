import type { LiveInputControls } from '../../hooks/useLiveInput';
import { midiToPianoKey } from '../../models/song';
import './LiveInputPanel.css';

export function LiveInputPanel({ input, compact = false }: { input: LiveInputControls; compact?: boolean }) {
  return <div className={`live-input ${compact ? 'compact' : ''}`}>
    <div className="live-input-buttons" role="group" aria-label="Piano input">
      <span className="input-label">Play using</span>
      {(['screen', 'midi', 'microphone'] as const).map((source) => <button key={source}
        aria-pressed={input.source === source} disabled={input.connecting && source !== 'screen'}
        onClick={() => void input.connect(source)}>{source === 'screen' ? 'On-screen keys' : source === 'midi' ? 'USB / MIDI piano' : 'Microphone'}</button>)}
      {input.source === 'midi' && input.devices.length > 0 && <select aria-label="MIDI piano" value={input.deviceId}
        onChange={(event) => input.selectDevice(event.target.value)}>
        {input.devices.map((device) => <option key={device.id} value={device.id}>{device.name}</option>)}
      </select>}
      {input.source === 'microphone' && <label className="mic-sensitivity">Noise floor
        <input type="range" min="0.004" max="0.04" step="0.002" value={input.threshold}
          onChange={(event) => input.setThreshold(Number(event.target.value))} />
      </label>}
      {input.pitch && <span className="input-pitch">{midiToPianoKey(input.pitch.midi).replace('/', '').toUpperCase()} · {Math.round(input.pitch.cents)}¢</span>}
    </div>
    <p role="status">{input.connecting ? 'Waiting for browser permission…' : input.status}</p>
  </div>;
}
