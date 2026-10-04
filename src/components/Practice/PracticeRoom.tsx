import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LiveInputPanel } from '../LiveInput/LiveInputPanel';
import { useLiveInput } from '../../hooks/useLiveInput';
import { assessBandNote, LESSONS, SESSION_PLAN, lessonNotes, noteTimeline, parsePracticeProgress, performanceStars,
  PRACTICE_STORAGE_KEY, type Lesson, type LessonProgress, type PracticeProgress, type SessionActivity } from '../../models/lessons';
import { PracticeAudio, type BackingStyle } from '../../services/practiceAudio';
import type { LiveNote } from '../../services/liveInput';
import { PracticeStaff } from './PracticeStaff';
import { PracticeDrawer } from './PracticeDrawer';
import { PracticeKeyboard } from './PracticeKeyboard';
import { parseReadingSettings, readingPreset, READING_STORAGE_KEY, type ReadingSupport } from '../../models/practiceReading';
import './PracticeRoom.css';

const KEY_MIDIS = [60, 62, 64, 65, 67, 69, 71, 72];
const EMPTY_LESSON: LessonProgress = { phrases: [], bestStars: 0, bestAccuracy: 0, performances: 0 };
interface Attempt { index: number; correct: number; wrong: number; done: boolean; scored: Set<number>; }
const freshAttempt = (): Attempt => ({ index: 0, correct: 0, wrong: 0, done: false, scored: new Set() });
const noteLabel = (midi: number) => ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'][midi % 12];
function clockLabel(seconds: number) { return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`; }

export function PracticeRoom({ onExit, onOpenScore }: { onExit: () => void; onOpenScore: (lesson: Lesson) => void }) {
  const [lessonId, setLessonId] = useState(LESSONS[0].id);
  const lesson = LESSONS.find((item) => item.id === lessonId)!;
  const [activity, setActivity] = useState<SessionActivity>('learn');
  const [phraseIndex, setPhraseIndex] = useState(0);
  const [attempt, setAttempt] = useState(freshAttempt);
  const attemptRef = useRef(attempt);
  const [feedback, setFeedback] = useState('Read the glowing note on the staff. Take your time.');
  const [tempo, setTempo] = useState(lesson.tempo);
  const [style, setStyle] = useState<BackingStyle>('dreamy');
  const [volume, setVolume] = useState(0.55);
  const [backingVolume, setBackingVolume] = useState(0.65);
  const [backing, setBacking] = useState(true);
  const [metronome, setMetronome] = useState(true);
  const [hearMidi, setHearMidi] = useState(true);
  const [readingSettings, setReadingSettings] = useState(() => {
    try { return parseReadingSettings(localStorage.getItem(READING_STORAGE_KEY)); }
    catch { return parseReadingSettings(null); }
  });
  const [running, setRunning] = useState<'guide' | 'demo' | 'band' | 'create' | null>(null);
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  const [waitingToStart, setWaitingToStart] = useState(false);
  const waitingRef = useRef(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const drawerRef = useRef(false);
  const runningRef = useRef(running);
  const [preparing, setPreparing] = useState(false);
  const [beat, setBeat] = useState<number | null>(null);
  const [screenHeld, setScreenHeld] = useState<number[]>([]);
  const [discovered, setDiscovered] = useState<number[]>([]);
  const [sessionSeconds, setSessionSeconds] = useState(0);
  const [activitySeconds, setActivitySeconds] = useState(0);
  const [timerPaused, setTimerPaused] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [progress, setProgress] = useState<PracticeProgress>(() => {
    try { return parsePracticeProgress(localStorage.getItem(PRACTICE_STORAGE_KEY)); }
    catch { return parsePracticeProgress(null); }
  });
  const [audio] = useState(() => new PracticeAudio());
  const mountedRef = useRef(false);
  const runToken = useRef(0);
  const allNotes = useMemo(() => lessonNotes(lesson), [lesson]);
  const notes = activity === 'learn' ? lesson.phrases[phraseIndex] : allNotes;
  const timeline = useMemo(() => noteTimeline(notes), [notes]);
  const totalBeats = notes.reduce((sum, note) => sum + note.beats, 0);
  const saved = progress.lessons[lesson.id] ?? EMPTY_LESSON;
  const planItem = SESSION_PLAN.find((item) => item.id === activity)!;
  const bandActivity = activity === 'band' || activity === 'replay';
  const updateAttempt = (next: Attempt) => { attemptRef.current = next; setAttempt(next); };
  const stop = useCallback(() => {
    runToken.current++; audio.stop(); runningRef.current = null;
    pausedRef.current = false; setPaused(false);
    setRunning(null); setPreparing(false); setBeat(null);
  }, [audio]);
  const setWaiting = (value: boolean) => { waitingRef.current = value; setWaitingToStart(value); };
  const pauseTransport = useCallback(async () => {
    const mode = runningRef.current;
    if (!mode || pausedRef.current) return;
    const token = runToken.current;
    pausedRef.current = true; setPaused(true);
    try {
      if (mode === 'guide') audio.stop();
      else { await audio.pause(); if (token === runToken.current) setBeat(audio.beat()); }
    } catch { if (token === runToken.current && mountedRef.current) { stop(); setFeedback('Sound could not pause. Press Play to start again.'); } }
  }, [audio, stop]);
  const resumeTransport = async () => {
    const mode = runningRef.current; const token = runToken.current;
    if (!mode || !pausedRef.current || preparing) return;
    setPreparing(true);
    try {
      if (mode !== 'guide') await audio.resume();
      if (token !== runToken.current || !mountedRef.current) return;
      if (drawerRef.current) { if (mode !== 'guide') await audio.pause(); return; }
      pausedRef.current = false; setPaused(false);
    } catch { if (token === runToken.current && mountedRef.current) { stop(); setFeedback('Sound could not resume. Press Play to try again.'); } }
    finally { if (token === runToken.current && mountedRef.current) setPreparing(false); }
  };
  const openMenu = () => { drawerRef.current = true; setDrawerOpen(true); if (preparing) stop(); else void pauseTransport(); };
  const closeMenu = () => { drawerRef.current = false; setDrawerOpen(false); };
  const manualStop = () => {
    stop(); updateAttempt(freshAttempt()); setWaiting(true);
    setFeedback('Stopped. Press Play or Space when you’re ready.');
  };
  const recordPerformance = (result: Attempt) => {
    const accuracy = result.correct / allNotes.length;
    const stars = performanceStars(result.correct, allNotes.length);
    setProgress((previous) => {
      const existing = previous.lessons[lesson.id] ?? EMPTY_LESSON;
      return { ...previous, lessons: { ...previous.lessons, [lesson.id]: { ...existing,
        bestAccuracy: Math.max(existing.bestAccuracy, accuracy), bestStars: Math.max(existing.bestStars, stars), performances: existing.performances + 1 } } };
    });
    setFeedback(stars === 3 ? `Three stars! ★ ★ ★ ${result.correct}/${allNotes.length} notes.` : result.correct ? `${'★'.repeat(stars)} ${result.correct}/${allNotes.length} on the beat. Try slower!` : 'Good listening! Try a little phrase first.');
  };
  const onLiveNote = (note: LiveNote) => {
    if (!note.on || drawerRef.current || pausedRef.current || waitingRef.current || activity === 'break' || runningRef.current === 'demo' || preparing) return;
    if (note.source === 'screen' || (note.source === 'midi' && hearMidi)) void audio.preview(note.midi, note.velocity).catch(() => setFeedback('Sound could not start. Try the play button again.'));
    if (activity === 'explore' || activity === 'create') {
      if (KEY_MIDIS.includes(note.midi)) setDiscovered((previous) => [...new Set([...previous, note.midi])]);
      setFeedback(`${noteLabel(note.midi)}${Math.floor(note.midi / 12) - 1} — lovely! ${activity === 'create' ? 'Keep making your own tune.' : 'Try another key.'}`);
      return;
    }
    if (activity === 'learn') {
      if (!runningRef.current) { runningRef.current = 'guide'; setRunning('guide'); }
      const current = attemptRef.current;
      if (current.done) return;
      if (note.midi === notes[current.index].midi) {
        const next = { ...current, index: current.index + 1, correct: current.correct + 1 };
        next.done = next.index === notes.length;
        updateAttempt(next);
        setFeedback(next.done ? 'You did it! ★' : 'Yes! Keep going.');
        if (next.done) setProgress((previous) => {
          const existing = previous.lessons[lesson.id] ?? EMPTY_LESSON;
          return { ...previous, lessons: { ...previous.lessons, [lesson.id]: { ...existing, phrases: [...new Set([...existing.phrases, phraseIndex])] } } };
        });
      } else {
        updateAttempt({ ...current, wrong: current.wrong + 1 });
        setFeedback(readingSettings.support === 'guided' ? `Try ${noteLabel(notes[current.index].midi)}. The glowing key is waiting for you.` : 'Try that note again. Look at its place on the staff.');
      }
    } else if (bandActivity && runningRef.current === 'band') {
      const elapsed = audio.beat();
      if (elapsed === null || elapsed < -0.4 || elapsed >= totalBeats) return;
      const current = attemptRef.current;
      const match = assessBandNote(notes, elapsed, note.midi, current.scored);
      if (match !== null) {
        const scored = new Set(current.scored); scored.add(match);
        updateAttempt({ ...current, correct: current.correct + 1, scored });
        setFeedback('On the beat! ★');
      } else { updateAttempt({ ...current, wrong: current.wrong + 1 }); setFeedback('Keep listening to the beat. You can do it!'); }
    }
  };
  const input = useLiveInput(onLiveNote);
  useEffect(() => {
    if (input.source === 'microphone') queueMicrotask(() => { if (mountedRef.current) { stop(); setBacking(false); setMetronome(false); } });
  }, [input.source, stop]);
  useEffect(() => { audio.setVolume(volume); audio.setBackingVolume(backingVolume); }, [audio, volume, backingVolume]);
  const disposeAudio = useCallback(() => { mountedRef.current = false; runToken.current++; audio.dispose(); }, [audio]);
  useEffect(() => { mountedRef.current = true; return disposeAudio; }, [disposeAudio]);
  useEffect(() => {
    try {
      localStorage.setItem(PRACTICE_STORAGE_KEY, JSON.stringify(progress));
      localStorage.setItem(READING_STORAGE_KEY, JSON.stringify(readingSettings));
    }
    catch { queueMicrotask(() => { if (mountedRef.current) setSaveError('Progress cannot be saved in this browser. Keep this tab open or allow local storage.'); }); }
  }, [progress, readingSettings]);
  useEffect(() => {
    const interval = window.setInterval(() => {
      if (timerPaused || pausedRef.current || drawerRef.current || document.visibilityState === 'hidden') return;
      setSessionSeconds((seconds) => seconds + 1);
      setActivitySeconds((seconds) => seconds + 1);
      setProgress((previous) => ({ ...previous, seconds: previous.seconds + 1 }));
    }, 1000);
    return () => window.clearInterval(interval);
  }, [timerPaused]);
  useEffect(() => {
    const hide = () => { if (document.visibilityState === 'hidden') void pauseTransport(); };
    document.addEventListener('visibilitychange', hide);
    return () => document.removeEventListener('visibilitychange', hide);
  }, [pauseTransport]);
  // Finish from the audio clock, which also drives note guidance and count-in.
  const finishRef = useRef<() => void>(() => {});
  useEffect(() => {
    finishRef.current = () => {
      if (runningRef.current === 'band') {
        const result = { ...attemptRef.current, done: true }; updateAttempt(result); recordPerformance(result);
      } else if (runningRef.current === 'demo') {
        updateAttempt(freshAttempt());
        if (activity === 'listen') { setActivity('learn'); setPhraseIndex(0); setActivitySeconds(0); }
        setFeedback('Your turn! Play the glowing note.');
      }
      const finishedDemo = runningRef.current === 'demo' && (activity === 'listen' || activity === 'learn');
      stop();
      if (finishedDemo) { setWaiting(false); runningRef.current = 'guide'; setRunning('guide'); }
    };
  });
  useEffect(() => {
    if (!running || running === 'guide' || paused) return;
    const interval = window.setInterval(() => {
      const position = audio.beat();
      setBeat(position);
      if (running !== 'create' && position !== null && position >= totalBeats + 0.15) finishRef.current();
    }, 35);
    return () => window.clearInterval(interval);
  }, [audio, running, paused, totalBeats]);
  const changeActivity = (next: SessionActivity) => {
    stop(); setWaiting(false); closeMenu(); setActivity(next); setActivitySeconds(0); setScreenHeld([]); updateAttempt(freshAttempt());
    setFeedback(SESSION_PLAN.find((item) => item.id === next)!.prompt);
  };
  const changeLesson = (id: string) => {
    stop(); setWaiting(false); closeMenu(); setActivity('learn'); setActivitySeconds(0); setLessonId(id); setPhraseIndex(0); updateAttempt(freshAttempt()); setDiscovered([]);
    setTempo(LESSONS.find((item) => item.id === id)!.tempo); setFeedback('New song! Listen first, then try a little phrase.');
  };
  const changePhrase = (index: number) => { stop(); setWaiting(false); closeMenu(); setPhraseIndex(index); updateAttempt(freshAttempt()); setFeedback('Follow the glowing note. Take your time.'); };
  const start = async (mode: 'guide' | 'demo' | 'band' | 'create') => {
    stop(); setWaiting(false); updateAttempt(freshAttempt());
    if (mode === 'guide') { runningRef.current = 'guide'; setRunning('guide'); setFeedback('Your turn! Play the glowing note.'); return; }
    const token = runToken.current;
    setPreparing(true);
    try {
      await audio.start({ notes: mode === 'create' ? [] : notes,
        chords: activity === 'learn' ? lesson.chords.slice(phraseIndex * 2, phraseIndex * 2 + 2) : lesson.chords,
        tempo, melody: mode === 'demo', backing, metronome, style, loop: mode === 'create' });
      if (token !== runToken.current) return;
      runningRef.current = mode; setRunning(mode); setFeedback(mode === 'demo' ? 'Listen to the melody and clap along.' : 'Get ready! Four clicks, then play.');
    } catch { if (token === runToken.current) setFeedback('Audio could not start. Try again after allowing sound in your browser.'); }
    finally { if (token === runToken.current) setPreparing(false); }
  };
  const currentIndex = running && running !== 'guide' && beat !== null && beat >= 0
    ? timeline.findIndex((note) => beat >= note.startBeat && beat < note.startBeat + note.beats)
    : activity === 'learn' && !attempt.done && !waitingToStart ? attempt.index : -1;
  const completedNotes = useMemo(() => {
    const completed = new Set(attempt.scored);
    if (activity === 'learn') for (let index = 0; index < attempt.index; index++) completed.add(index);
    return completed;
  }, [attempt.index, attempt.scored, activity]);
  const expected = currentIndex >= 0 ? notes[currentIndex].midi : activity === 'explore' ? 60 : null;
  const activeKeys = new Set([...screenHeld, ...input.held]);
  const screenDown = (midi: number) => {
    if (screenHeld.includes(midi)) return;
    setScreenHeld((previous) => [...new Set([...previous, midi])]);
    onLiveNote({ midi, velocity: 0.75, on: true, source: 'screen' });
  };
  const screenUp = (midi: number) => setScreenHeld((previous) => previous.filter((key) => key !== midi));
  const countIn = running && beat !== null && beat < 0 ? Math.min(4, Math.max(1, Math.ceil(-beat))) : null;
  const nextActivity = SESSION_PLAN[SESSION_PLAN.findIndex((item) => item.id === activity) + 1];
  const breakRemaining = Math.max(0, 300 - activitySeconds);

  const toggleTransport = () => {
    if (preparing || activity === 'break') return;
    if (runningRef.current) { if (pausedRef.current) void resumeTransport(); else void pauseTransport(); }
    else void start(bandActivity ? 'band' : activity === 'create' ? 'create' : activity === 'learn' || activity === 'explore' ? 'guide' : 'demo');
  };
  const hotkeys = useRef<(event: KeyboardEvent) => void>(() => {});
  useEffect(() => {
    hotkeys.current = (event) => {
      if (drawerRef.current) return;
      const target = event.target as HTMLElement;
      if (target.matches('input, select, textarea') || target.isContentEditable) return;
      if (event.code === 'Space') {
        event.preventDefault();
        if (event.repeat) return;
        if (event.shiftKey || preparing) manualStop(); else toggleTransport();
      } else if (event.key === 'Escape') { event.preventDefault(); manualStop(); }
    };
  });
  useEffect(() => {
    const keyDown = (event: KeyboardEvent) => hotkeys.current(event);
    window.addEventListener('keydown', keyDown);
    return () => window.removeEventListener('keydown', keyDown);
  }, []);
  const nextStep = () => {
    if (activity === 'learn') {
      if (phraseIndex < lesson.phrases.length - 1) changePhrase(phraseIndex + 1);
      else changeActivity('band');
    } else if (nextActivity) changeActivity(nextActivity.id);
    else openMenu();
  };
  const canAdvance = (activity === 'learn' || bandActivity) ? attempt.done : activity === 'break' ? breakRemaining === 0 : discovered.length >= 8;
  const nextLabel = activity === 'learn' ? phraseIndex < lesson.phrases.length - 1 ? 'Next little phrase' : 'Play with the band' : nextActivity ? `Next: ${nextActivity.title}` : 'Choose another song';
  const phaseLabel = activity === 'learn' ? `Phrase ${phraseIndex + 1} of ${lesson.phrases.length}` : planItem.title;
  const totalStars = Object.values(progress.lessons).reduce((sum, item) => sum + item.bestStars, 0);

  return <main className="practice-room practice-focus" data-transport={preparing ? 'loading' : paused ? 'paused' : running ? 'playing' : 'stopped'}>
    <div className="practice-focus-content" inert={drawerOpen}>
      <header className="practice-focus-header">
        <button className="focus-menu-button" aria-label="Open practice menu" title="Songs and settings" onClick={openMenu}>☰</button>
        <div className="focus-song"><h1>{lesson.title}</h1><span>{phaseLabel}</span></div>
        <div className="focus-transport" role="group" aria-label="Practice playback">
          <button className="focus-play" aria-label={paused ? 'Resume practice' : running ? 'Pause practice' : 'Start practice'}
            title="Space: play / pause / resume" disabled={preparing || activity === 'break'} onClick={toggleTransport}>{preparing ? '…' : paused || !running ? '▶' : 'Ⅱ'}</button>
          <button aria-label="Stop practice" title="Shift+Space or Escape: stop" onClick={manualStop}>■</button>
          {activity !== 'break' && <button aria-label="Listen & clap" title="Hear the melody" disabled={preparing} onClick={() => void start('demo')}>♫</button>}
        </div>
      </header>
      <section className="practice-focus-score" aria-label={planItem.title}>
        {activity === 'break' ? <div className="focus-break"><span aria-hidden="true">☀</span><h2>Stretch. Shake. Smile.</h2><strong>{clockLabel(breakRemaining)}</strong><p>Give your hands and ears a little rest.</p></div>
          : <PracticeStaff notes={notes} lessonId={lesson.id} settings={readingSettings} currentIndex={currentIndex}
              completed={completedNotes} beat={running && running !== 'guide' && beat !== null && beat >= 0 ? beat : null}
              firstBar={activity === 'learn' ? phraseIndex * 2 + 1 : 1} songBarCount={lesson.chords.length} done={attempt.done} />}
        {paused && <span className="focus-paused-label" role="status">Paused</span>}
      </section>
      <div className={`practice-feedback ${attempt.done ? 'celebrate' : ''}`} role="status" aria-live="polite">
        <span aria-hidden="true">{countIn ?? (attempt.done ? '★' : '♪')}</span>
        <strong>{paused ? 'Press Play or Space to keep going.' : countIn ? `Get ready… ${countIn}` : feedback}</strong>
        {canAdvance && <button className="focus-next" aria-label={nextLabel} title={nextLabel} onClick={nextStep}>Next →</button>}
      </div>
      {activity !== 'break' && <PracticeKeyboard settings={readingSettings} held={activeKeys} expected={expected} onDown={screenDown} onUp={screenUp} />}
      {saveError && <p className="focus-save-error" role="alert">{saveError}</p>}
    </div>
    {drawerOpen && <PracticeDrawer onClose={closeMenu}>
      <div className="drawer-progress"><strong>{totalStars} stars</strong><span>{clockLabel(sessionSeconds)} / 60 min</span></div>
      <section className="drawer-section"><h3>Choose a song</h3><div className="lesson-picker" aria-label="Choose a song">
        {LESSONS.map((item) => <button key={item.id} aria-pressed={item.id === lesson.id} onClick={() => changeLesson(item.id)}><span aria-hidden="true">{item.icon}</span><span><strong>{item.title}</strong><small>{'★'.repeat(progress.lessons[item.id]?.bestStars ?? 0)}{'☆'.repeat(3 - (progress.lessons[item.id]?.bestStars ?? 0))}</small></span></button>)}
      </div></section>
      <section className="drawer-section"><h3>Lesson plan</h3><div className="practice-plan" aria-label="Suggested 60 minute lesson plan">
        {SESSION_PLAN.map((item, index) => <button key={item.id} aria-pressed={activity === item.id} onClick={() => changeActivity(item.id)}><span>{index + 1} {item.title}</span><small>{item.minutes} min</small></button>)}
      </div><p>Move at your own pace. Take a rest whenever you need one.</p></section>
      <section className="drawer-section"><h3>Little phrases</h3><div className="phrase-selector" role="group" aria-label="Choose a phrase">
        {lesson.phrases.map((_, index) => <button key={index} aria-pressed={activity === 'learn' && phraseIndex === index} onClick={() => { changeActivity('learn'); changePhrase(index); }}>Phrase {index + 1} {saved.phrases.includes(index) ? '★' : ''}</button>)}
      </div><p>{saved.phrases.length}/{lesson.phrases.length} learned</p></section>
      <section className="drawer-section"><h3>Piano input</h3><LiveInputPanel input={input} />
        <p>Microphone: one note at a time. Use headphones with demos and the band.</p></section>
      <section className="drawer-section"><h3>Reading help</h3><div className="reading-controls">
        <label>Reading help<select aria-label="Reading help" value={readingSettings.support} onChange={(event) => setReadingSettings((settings) => readingPreset(event.target.value as ReadingSupport, settings))}>
          <option value="guided">Colors + names</option><option value="colors">Colors only</option><option value="staff">Read the staff</option></select></label>
        <div className="reading-bar-buttons" role="group" aria-label="Visible bars">{([1, 2] as const).map((bars) => <button key={bars} aria-pressed={readingSettings.bars === bars} onClick={() => setReadingSettings((settings) => ({ ...settings, bars }))}>{bars} {bars === 1 ? 'bar' : 'bars'}</button>)}</div>
        <label><input type="checkbox" checked={readingSettings.fingers} onChange={(event) => setReadingSettings((settings) => ({ ...settings, fingers: event.target.checked }))} />Finger hints</label>
        <label><input type="checkbox" checked={readingSettings.keyboardGuide} onChange={(event) => setReadingSettings((settings) => ({ ...settings, keyboardGuide: event.target.checked }))} />Glowing key hint</label>
      </div><p>Finger 1 is your thumb. {lesson.id === 'twinkle' ? 'Use 1–2–3 for C–D–E, then slide your thumb to F for F–G–A.' : 'Place your thumb on middle C. Fingers 1–5 go from thumb to little finger.'}</p></section>
      <section className="drawer-section"><h3>Your band</h3><div className="practice-settings">
        <label>Speed <strong>{tempo} BPM</strong><input aria-label="Practice tempo" type="range" min="40" max="120" step="2" value={tempo} onChange={(event) => { stop(); setTempo(Number(event.target.value)); }} /></label>
        <label>Band sound<select value={style} onChange={(event) => { stop(); setStyle(event.target.value as BackingStyle); }}><option value="dreamy">Dreamy lullaby</option><option value="pop">Little pop band</option></select></label>
        <label>Volume<input aria-label="Practice volume" type="range" min="0" max="1" step="0.05" value={volume} onChange={(event) => setVolume(Number(event.target.value))} /></label>
        <label>Backing volume<input aria-label="Backing track volume" type="range" min="0" max="1" step="0.05" value={backingVolume} onChange={(event) => setBackingVolume(Number(event.target.value))} /></label>
        <label><input type="checkbox" checked={backing} onChange={(event) => { stop(); setBacking(event.target.checked); }} />Backing track{input.source === 'microphone' ? ' (headphones)' : ''}</label>
        <label><input type="checkbox" checked={metronome} onChange={(event) => { stop(); setMetronome(event.target.checked); }} />Beat clicks</label>
        {input.source === 'midi' && <label><input type="checkbox" checked={hearMidi} onChange={(event) => setHearMidi(event.target.checked)} />Hear MIDI in the app</label>}
      </div></section>
      <section className="drawer-section"><h3>Practice controls</h3><p>Space: play, pause, resume. Shift+Space or Escape: stop.</p><button onClick={() => { setTimerPaused(!timerPaused); void pauseTransport(); }}>{timerPaused ? 'Resume timer' : 'Pause timer'}</button>
        <button onClick={() => { stop(); updateAttempt(freshAttempt()); setWaiting(false); closeMenu(); setFeedback('Your turn! Play the glowing note.'); }}>Try this phrase again</button>
        <button onClick={() => { stop(); onOpenScore(lesson); }}>Open melody + backing in score editor ↗</button>
        <button onClick={() => { stop(); onExit(); }}>Score editor ↗</button>
      </section>
    </PracticeDrawer>}
  </main>;
}
