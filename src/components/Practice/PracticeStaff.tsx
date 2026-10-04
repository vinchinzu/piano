import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { LessonNote } from '../../models/lessons';
import { readingWindow, type ReadingSettings } from '../../models/practiceReading';
import { PRACTICE_BAR_WIDTH, PRACTICE_STAFF_HEIGHT, renderPracticeStaff, updatePracticeStaff, type PracticeStaffResult } from '../../services/practiceStaff';
import './PracticeStaff.css';

interface PracticeStaffProps {
  notes: LessonNote[]; lessonId: string; settings: ReadingSettings; currentIndex: number;
  completed: ReadonlySet<number>; beat: number | null; firstBar: number; songBarCount: number; done: boolean;
}
export function PracticeStaff({ notes, lessonId, settings, currentIndex, completed, beat, firstBar, songBarCount, done }: PracticeStaffProps) {
  const viewport = useRef<HTMLDivElement>(null);
  const rail = useRef<HTMLDivElement>(null);
  const result = useRef<PracticeStaffResult | null>(null);
  const [size, setSize] = useState({ width: 360, height: 188 });
  // Keep the final bar in view after completion; an idle song starts at bar one.
  const focusIndex = currentIndex >= 0 ? currentIndex : done ? notes.length - 1 : 0;
  const viewWindow = readingWindow(notes, focusIndex, settings.bars);
  const scale = Math.max(0.1, Math.min(size.width / (viewWindow.visibleBars * PRACTICE_BAR_WIDTH), size.height / PRACTICE_STAFF_HEIGHT));
  useEffect(() => {
    const container = viewport.current;
    if (!container) return;
    const observer = new ResizeObserver(([entry]) => setSize({ width: entry.contentRect.width, height: entry.contentRect.height }));
    observer.observe(container);
    return () => observer.disconnect();
  }, []);
  useLayoutEffect(() => {
    if (!rail.current) return;
    result.current = renderPracticeStaff(rail.current, notes, settings, lessonId, firstBar);
  }, [notes, settings, lessonId, firstBar]);
  useLayoutEffect(() => {
    if (result.current) updatePracticeStaff(result.current, currentIndex, completed, beat);
  }, [notes, settings, lessonId, firstBar, currentIndex, completed, beat]);
  const lastBar = firstBar + viewWindow.startBar + viewWindow.visibleBars - 1;
  return <section className="practice-reading" aria-label="Music reading">
    <div className="staff-caption"><strong>Read the staff</strong><span aria-live="polite">{viewWindow.visibleBars === 1 ? `Bar ${firstBar + viewWindow.startBar}` : `Bars ${firstBar + viewWindow.startBar}–${lastBar}`} <small>of {songBarCount}</small></span></div>
    <div className="practice-staff-frame" ref={viewport}>
      <div className="practice-staff-window" data-window-start={firstBar + viewWindow.startBar} data-visible-bars={viewWindow.visibleBars}
        style={{ width: viewWindow.visibleBars * PRACTICE_BAR_WIDTH * scale, height: PRACTICE_STAFF_HEIGHT * scale }}>
        <div ref={rail} className="practice-staff-rail" style={{ width: viewWindow.totalBars * PRACTICE_BAR_WIDTH * scale,
          height: PRACTICE_STAFF_HEIGHT * scale, transform: `translateX(${-viewWindow.startBar * PRACTICE_BAR_WIDTH * scale}px)` }} />
      </div>
    </div>
    <p className="staff-reading-tip">{settings.support === 'guided' ? 'Watch where each note sits on the five lines. Colors and names help you find it.' : settings.support === 'colors' ? 'Read the note’s place on the staff. Match its color to a key if you need a hint.' : 'Read each note from its place on the staff. Take your time.'}</p>
  </section>;
}
