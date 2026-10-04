import { useCallback, useEffect, useRef, useState } from 'react';
import { MidiInputSession, startMicrophone, type InputSource, type LiveNote, type MidiDevice, type PitchEstimate } from '../services/liveInput';

export function useLiveInput(onNote: (note: LiveNote) => void, enabled = true) {
  const [source, setSource] = useState<InputSource>('screen');
  const [status, setStatus] = useState('Use the on-screen keys or connect your piano.');
  const [connecting, setConnecting] = useState(false);
  const [devices, setDevices] = useState<MidiDevice[]>([]);
  const [deviceId, setDeviceId] = useState('');
  const [held, setHeld] = useState<number[]>([]);
  const [pitch, setPitch] = useState<PitchEstimate | null>(null);
  const [threshold, setThreshold] = useState(0.008);
  const callback = useRef(onNote);
  const thresholdRef = useRef(threshold);
  useEffect(() => { callback.current = onNote; thresholdRef.current = threshold; });
  const cleanup = useRef<(() => void) | null>(null);
  const midi = useRef<MidiInputSession | null>(null);
  const generation = useRef(0);
  const emit = useCallback((note: LiveNote) => {
    setHeld((previous) => note.on ? [...new Set([...previous, note.midi])] : previous.filter((value) => value !== note.midi));
    callback.current(note);
  }, []);
  const releaseResources = useCallback(() => {
    generation.current++; cleanup.current?.(); cleanup.current = null; midi.current = null;
  }, []);
  const disconnect = useCallback(() => {
    releaseResources();
    setHeld([]); setPitch(null); setConnecting(false); setSource('screen');
    setStatus('Use the on-screen keys or connect your piano.');
  }, [releaseResources]);
  const connect = useCallback(async (next: InputSource) => {
    disconnect();
    if (next === 'screen' || !enabled) return;
    const request = generation.current;
    setConnecting(true);
    try {
      if (next === 'midi') {
        if (!navigator.requestMIDIAccess) throw new Error('This browser does not support MIDI. Try Chrome or Edge, or use microphone input.');
        const access = await navigator.requestMIDIAccess({ sysex: false });
        if (generation.current !== request) return;
        const session = new MidiInputSession(access, emit, (available, selected) => {
          setDevices(available); setDeviceId(selected);
          setStatus(available.length ? 'Connected — play your piano!' : 'MIDI is enabled. Plug in a USB piano to begin.');
        });
        midi.current = session; cleanup.current = () => session.close();
      } else {
        const close = await startMicrophone(emit, setPitch, () => thresholdRef.current);
        if (generation.current !== request) { close(); return; }
        cleanup.current = close;
        setStatus('Listening for one note at a time. Use headphones with the band.');
      }
      setSource(next);
    } catch (error) {
      if (generation.current !== request) return;
      const denied = error instanceof DOMException && error.name === 'NotAllowedError';
      setStatus(denied ? 'Permission was declined. Allow access in browser settings, then try again.' : error instanceof Error ? error.message : 'Could not connect. Please try again.');
    } finally { if (generation.current === request) setConnecting(false); }
  }, [disconnect, emit, enabled]);
  useEffect(() => {
    if (!enabled) queueMicrotask(disconnect);
    return releaseResources;
  }, [enabled, disconnect, releaseResources]);
  return { source, status, connecting, devices, deviceId, held, pitch, threshold, setThreshold, connect, disconnect,
    selectDevice: (id: string) => midi.current?.select(id) };
}
export type LiveInputControls = ReturnType<typeof useLiveInput>;
