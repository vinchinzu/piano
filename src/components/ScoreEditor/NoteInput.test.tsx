import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DEFAULT_SYNTH_CONTROLS } from '../../services/playback';
import { NoteInput } from './NoteInput';

function renderKeyboard(
  activePlaybackKeys: string[],
  showPlaybackGuidance: boolean,
  compact = false,
  preferFlatLabels = false,
) {
  return renderToStaticMarkup(<NoteInput
    onAddNote={() => true}
    onUpdateSelectedKeys={() => {}}
    selectedNote={{ id: 'selected', keys: ['e/4'], duration: 'q' }}
    onPreviewKeysChange={() => true}
    onSessionCommit={() => {}}
    onSessionCancel={() => {}}
    activePlaybackKeys={activePlaybackKeys}
    showPlaybackGuidance={showPlaybackGuidance}
    instrumentSound="electric-keys"
    synthControls={DEFAULT_SYNTH_CONTROLS}
    onInstrumentSoundChange={() => {}}
    onSynthControlsChange={() => {}}
    onPreviewNotes={() => {}}
    showAllNoteNames={true}
    preferFlatLabels={preferFlatLabels}
    trackKind="pitched"
    keySignature="C"
    recordingEnabled={true}
    midiRange={compact ? { start: 60, end: 72 } : null}
  />);
}

function pressedKeys(markup: string) {
  return [...markup.matchAll(/<button\b[^>]*aria-pressed="true"[^>]*aria-label="([^"]+)"/g)]
    .map((match) => match[1]).sort();
}

describe('keyboard score guidance', () => {
  it.each([false, true])('shows only required white and black keys (compact: %s)', (compact) => {
    const markup = renderKeyboard(['c/4', 'f#/4'], true, compact);
    expect(pressedKeys(markup)).toEqual(['C4', 'F#4']);
    expect(markup).not.toMatch(/class="[^"]*\bselected\b/);
  });

  it('keeps supplied pause highlights and clears releases without a fading glow', () => {
    const pausedKeys = ['c/4', 'f#/4'];
    expect(pressedKeys(renderKeyboard(pausedKeys, true, true))).toEqual(['C4', 'F#4']);
    const released = renderKeyboard([], true, true);
    expect(pressedKeys(released)).toEqual([]);
    expect(released).not.toMatch(/class="[^"]*\b(playing|fading|selected)\b/);
  });

  it('shows editor selection again when playback guidance ends', () => {
    expect(pressedKeys(renderKeyboard([], false))).toEqual(['E4']);
  });

  it('labels physical black keys as flats when practicing in a flat key signature', () => {
    const markup = renderKeyboard(['a#/4', 'd#/4'], true, true, true);
    expect(pressedKeys(markup)).toEqual(['B♭4', 'E♭4']);
  });
});
