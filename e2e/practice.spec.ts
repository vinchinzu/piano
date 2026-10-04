import { test, expect, type Page } from '@playwright/test';

async function openPractice(page: Page) {
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'Twinkle, Twinkle, Little Star' })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}
async function openMenu(page: Page) {
  if (!await page.getByRole('dialog').count()) await page.getByRole('button', { name: 'Open practice menu' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
}
async function closeMenu(page: Page) {
  await page.getByRole('button', { name: 'Back to piano →' }).click();
}
async function learnTwinklePhrase(page: Page) {
  await page.getByRole('button', { name: 'Play D4', exact: true }).click();
  await expect(page.getByText('Try C. The glowing key is waiting for you.')).toBeVisible();
  for (const pitch of ['C4', 'C4', 'G4', 'G4', 'A4', 'A4', 'G4']) await page.getByRole('button', { name: `Play ${pitch}`, exact: true }).click();
  await expect(page.getByText('You did it! ★')).toBeVisible();
}

test('learns a phrase, saves milestones, and opens a multitrack score', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', (error) => errors.push(error.message));
  await openPractice(page); await learnTwinklePhrase(page);
  await expect(page.getByRole('button', { name: 'Next little phrase' })).toBeVisible();
  await page.getByRole('button', { name: 'Next little phrase' }).click();
  await expect(page.getByText('Phrase 2 of 6')).toBeVisible();
  await page.reload(); await openMenu(page);
  await expect(page.getByText('1/6 learned')).toBeVisible();
  await page.getByRole('button', { name: 'Open melody + backing in score editor ↗' }).click();
  await expect(page.locator('.score-container svg')).toBeVisible();
  await expect(page.locator('option', { hasText: 'Backing chords' })).toHaveCount(1);
  await expect(page.getByText('Lesson melody and backing chords are ready.', { exact: false })).toBeVisible();
  expect(errors).toEqual([]);
});

test('listening and demos do not earn lesson milestones', async ({ page }) => {
  await openPractice(page);
  await page.getByRole('button', { name: 'Listen & clap', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Stop practice' })).toBeVisible();
  for (const pitch of ['C4', 'C4', 'G4', 'G4', 'A4', 'A4', 'G4']) await page.getByRole('button', { name: `Play ${pitch}`, exact: true }).click();
  await expect(page.locator('.practice-note.completed')).toHaveCount(0);
  // The short demo may finish naturally on slower machines.
  if (await page.getByRole('button', { name: 'Stop practice' }).count()) await page.getByRole('button', { name: 'Stop practice' }).click();
  await expect(page.getByRole('button', { name: 'Listen & clap', exact: true })).toBeVisible();
});

test('receives MIDI, releases highlights on unplug, and disconnects on exit', async ({ page }) => {
  await page.addInitScript(() => {
    const port = { id: 'test-piano', name: 'Test USB piano', state: 'connected', onmidimessage: null as null | ((event: { data: Uint8Array }) => void), close: () => Promise.resolve() };
    const access = { inputs: new Map([[port.id, port]]), onstatechange: null as null | (() => void) };
    Object.defineProperty(navigator, 'requestMIDIAccess', { value: () => Promise.resolve(access) });
    Object.assign(window, { pianoTest: { send: (data: number[]) => port.onmidimessage?.({ data: new Uint8Array(data) }),
      unplug: () => { port.state = 'disconnected'; access.onstatechange?.(); }, connected: () => !!port.onmidimessage } });
  });
  await openPractice(page);
  await openMenu(page); await page.getByRole('button', { name: 'USB / MIDI piano' }).click();
  await expect(page.getByText('Connected — play your piano!')).toBeVisible();
  await closeMenu(page);
  await page.evaluate(() => (window as unknown as { pianoTest: { send(data: number[]): void } }).pianoTest.send([0x90, 60, 100]));
  await expect(page.getByRole('button', { name: 'Play C4', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.practice-note.completed')).toHaveCount(1);
  await page.evaluate(() => (window as unknown as { pianoTest: { unplug(): void } }).pianoTest.unplug());
  await expect(page.getByRole('button', { name: 'Play C4', exact: true })).toHaveAttribute('aria-pressed', 'false');
  await openMenu(page);
  await expect(page.getByText('MIDI is enabled. Plug in a USB piano to begin.')).toBeVisible();
  await page.getByRole('button', { name: 'Score editor ↗', exact: true }).click();
  expect(await page.evaluate(() => (window as unknown as { pianoTest: { connected(): boolean } }).pianoTest.connected())).toBe(false);
});

test('renders the keyboard and break on a narrow screen without overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await openPractice(page);
  await expect(page.getByRole('button', { name: 'Play C4', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(await page.evaluate(() => {
    const staff = document.querySelector('.practice-reading')!.getBoundingClientRect();
    const keys = document.querySelector('.practice-keyboard')!.getBoundingClientRect();
    return staff.top >= 0 && keys.bottom <= window.innerHeight;
  })).toBe(true);
  await openMenu(page); await page.getByRole('button', { name: '5 Wiggle break' }).click();
  await expect(page.getByRole('heading', { name: 'Stretch. Shake. Smile.' })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Practice piano, middle C to high C' })).toHaveCount(0);
});

test('microphone detects single notes without duplicate credit and releases the stream', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { value: async () => {
      const context = new AudioContext(); await context.resume();
      const oscillator = context.createOscillator(); const gain = context.createGain();
      const destination = context.createMediaStreamDestination();
      oscillator.frequency.value = 261.6256; gain.gain.value = 0;
      oscillator.connect(gain); gain.connect(destination); oscillator.start();
      const track = destination.stream.getAudioTracks()[0]; const originalStop = track.stop.bind(track);
      const microphone = { stopped: false, sound: () => { gain.gain.value = 0.15; }, pitch: (frequency: number) => { oscillator.frequency.value = frequency; } };
      track.stop = () => { microphone.stopped = true; originalStop(); oscillator.stop(); void context.close(); };
      Object.assign(window, { microphoneTest: microphone });
      return destination.stream;
    } });
  });
  await openPractice(page);
  await openMenu(page); await page.getByRole('button', { name: 'Microphone', exact: true }).click();
  await expect(page.getByText('Listening for one note at a time.', { exact: false })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: 'Backing track (headphones)', exact: true })).not.toBeChecked();
  await closeMenu(page);
  await page.evaluate(() => (window as unknown as { microphoneTest: { sound(): void } }).microphoneTest.sound());
  await expect(page.locator('.practice-note.completed')).toHaveCount(1);
  await openMenu(page);
  await page.getByRole('button', { name: 'On-screen keys' }).click();
  expect(await page.evaluate(() => (window as unknown as { microphoneTest: { stopped: boolean } }).microphoneTest.stopped)).toBe(true);
  await expect(page.locator('.practice-note.completed')).toHaveCount(1);
});

test('reports denied microphone permission and keeps on-screen practice available', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
    value: async () => { throw new DOMException('Permission denied', 'NotAllowedError'); },
  }));
  await openPractice(page); await openMenu(page); await page.getByRole('button', { name: 'Microphone', exact: true }).click();
  await expect(page.getByText('Permission was declined.', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'On-screen keys' })).toHaveAttribute('aria-pressed', 'true');
  await closeMenu(page); await learnTwinklePhrase(page);
});

test('a full band performance earns stars once and saves them across visits', async ({ page }) => {
  await page.addInitScript(() => {
    const NativeAudioContext = AudioContext;
    let clock = 0;
    class ClockedAudioContext extends NativeAudioContext { get currentTime() { return clock; } }
    Object.assign(window, { AudioContext: ClockedAudioContext });
    const port = { id: 'test-piano', name: 'Test piano', state: 'connected', onmidimessage: null as null | ((event: { data: Uint8Array }) => void), close: () => Promise.resolve() };
    Object.defineProperty(navigator, 'requestMIDIAccess', { value: async () => ({ inputs: new Map([[port.id, port]]), onstatechange: null }) });
    Object.assign(window, { bandTest: { play: (notes: { midi: number; beats: number }[]) => {
      let beat = 0;
      for (const note of notes) {
        clock = 2.15 + beat * 0.5;
        port.onmidimessage?.({ data: new Uint8Array([0x90, note.midi, 100]) });
        port.onmidimessage?.({ data: new Uint8Array([0x80, note.midi, 0]) });
        beat += note.beats;
      }
      clock = 2.15 + beat * 0.5 + 0.2;
    } } });
  });
  await openPractice(page); await openMenu(page); await page.getByRole('button', { name: 'USB / MIDI piano' }).click();
  await expect(page.getByText('Connected — play your piano!')).toBeVisible();
  await closeMenu(page);
  await openMenu(page); await page.getByRole('button', { name: '4 Play with the band' }).click();
  await openMenu(page);
  await page.getByRole('slider', { name: 'Practice tempo' }).press('End');
  await expect(page.getByText('120 BPM')).toBeVisible();
  await closeMenu(page); await page.getByRole('button', { name: 'Start practice', exact: true }).click();
  await expect(page.locator('.practice-room')).toHaveAttribute('data-transport', 'playing');
  await expect(page.getByRole('button', { name: 'Stop practice' })).toBeVisible();
  const { LESSONS, lessonNotes } = await import('../src/models/lessons');
  await page.evaluate((notes) => (window as unknown as { bandTest: { play(notes: { midi: number; beats: number }[]): void } }).bandTest.play(notes), lessonNotes(LESSONS[0]));
  await expect(page.getByText('Three stars! ★ ★ ★', { exact: false })).toBeVisible();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('piano_sheet_practice_v1')!));
  expect(saved.lessons.twinkle).toMatchObject({ bestStars: 3, bestAccuracy: 1, performances: 1 });
  await page.reload(); await openMenu(page);
  await expect(page.getByText('3 stars', { exact: true })).toBeVisible();
});

test('reads one scrolling staff bar, waits on wrong notes, and offers two bars', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', (error) => errors.push(error.message));
  await openPractice(page);
  const staffWindow = page.locator('.practice-staff-window');
  await expect(staffWindow).toHaveAttribute('data-visible-bars', '1');
  await expect(staffWindow).toHaveAttribute('data-window-start', '1');
  await expect(page.locator('.practice-staff-rail svg')).toBeVisible();
  await expect(page.locator('.practice-note')).toHaveCount(7);
  await expect(page.locator('.staff-note-name')).toHaveCount(7);
  expect(await page.evaluate(() => {
    const frame = document.querySelector('.practice-staff-window')!.getBoundingClientRect();
    const nextBar = document.querySelector('.vf-practice-measure[data-bar="2"]')!.getBoundingClientRect();
    return nextBar.left >= frame.right;
  })).toBe(true);
  await page.getByRole('button', { name: 'Play D4', exact: true }).click();
  await expect(staffWindow).toHaveAttribute('data-window-start', '1');
  for (const pitch of ['C4', 'C4', 'G4', 'G4']) await page.getByRole('button', { name: `Play ${pitch}`, exact: true }).click();
  await expect(staffWindow).toHaveAttribute('data-window-start', '2');
  await expect(page.locator('.practice-note.current')).toHaveAttribute('data-midi', '69');
  // The completed bar is clipped; the current note and its staff are inside the window.
  await expect.poll(() => page.evaluate(() => {
    const frame = document.querySelector('.practice-staff-window')!.getBoundingClientRect();
    const note = document.querySelector('.practice-note.current')!.getBoundingClientRect();
    return { left: note.left >= frame.left, right: note.right <= frame.right };
  })).toEqual({ left: true, right: true });
  await openMenu(page); await page.getByRole('button', { name: '2 bars', exact: true }).click();
  await closeMenu(page);
  await expect(staffWindow).toHaveAttribute('data-visible-bars', '2');
  await expect(staffWindow).toHaveAttribute('data-window-start', '1');
  await openMenu(page); await page.getByRole('button', { name: 'Phrase 2', exact: true }).click();
  await expect(staffWindow).toHaveAttribute('data-window-start', '3');
  expect(errors).toEqual([]);
});

test('graduates from colored note names to plain staff reading and saves the choice', async ({ page }) => {
  await openPractice(page);
  await openMenu(page); await page.getByRole('combobox', { name: 'Reading help' }).selectOption('colors');
  await expect(page.locator('.staff-note-name')).toHaveCount(0);
  await expect(page.locator('.staff-finger')).toHaveCount(0);
  await expect(page.locator('.key-color')).toHaveCount(8);
  await expect(page.locator('.key-star')).toHaveCount(0);
  await page.getByRole('combobox', { name: 'Reading help' }).selectOption('staff');
  await expect(page.locator('.key-color')).toHaveCount(0);
  await expect(page.locator('.practice-white-keys strong')).toHaveCount(0);
  await closeMenu(page);
  await page.getByRole('button', { name: 'Play D4', exact: true }).click();
  await expect(page.getByText('Try that note again. Look at its place on the staff.')).toBeVisible();
  await openMenu(page); await page.getByRole('button', { name: '2 bars', exact: true }).click();
  await closeMenu(page);
  await page.reload(); await openMenu(page);
  await expect(page.getByRole('combobox', { name: 'Reading help' })).toHaveValue('staff');
  await expect(page.locator('.practice-staff-window')).toHaveAttribute('data-visible-bars', '2');
  await expect(page.locator('.staff-note-name')).toHaveCount(0);
  await expect(page.locator('.staff-finger')).toHaveCount(0);
});

for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 640, height: 360 }]) {
  test(`focus fits one screen at ${viewport.width}×${viewport.height} with one or two bars`, async ({ page }) => {
    await page.setViewportSize(viewport); await openPractice(page);
    await expect(page.getByRole('combobox')).toHaveCount(0);
    await expect(page.locator('.practice-plan')).toHaveCount(0);
    const fits = () => page.evaluate(() => {
      const bounds = ['.practice-focus-header', '.practice-staff-window', '.practice-feedback', '.practice-keyboard']
        .map((selector) => document.querySelector(selector)!.getBoundingClientRect());
      return bounds.every((rect) => rect.width > 0 && rect.height > 0 && rect.left >= 0 && rect.right <= innerWidth + 1 && rect.top >= 0 && rect.bottom <= innerHeight + 1)
        && document.documentElement.scrollHeight <= innerHeight && document.documentElement.scrollWidth <= innerWidth;
    });
    await expect.poll(fits).toBe(true);
    await openMenu(page); await page.getByRole('button', { name: '2 bars', exact: true }).click(); await closeMenu(page);
    await expect(page.locator('.practice-staff-window')).toHaveAttribute('data-visible-bars', '2');
    await expect.poll(fits).toBe(true);
    await learnTwinklePhrase(page); await expect.poll(fits).toBe(true);
  });
}

test('Space starts, pauses and resumes a phrase; Shift+Space and Escape stop it', async ({ page }) => {
  await openPractice(page);
  const room = page.locator('.practice-room');
  await page.keyboard.press('Space'); await expect(room).toHaveAttribute('data-transport', 'playing');
  await page.getByRole('button', { name: 'Play C4', exact: true }).click();
  await expect(page.locator('.practice-note.completed')).toHaveCount(1);
  await page.keyboard.press('Space'); await expect(room).toHaveAttribute('data-transport', 'paused');
  await page.getByRole('button', { name: 'Play C4', exact: true }).click();
  await expect(page.locator('.practice-note.completed')).toHaveCount(1);
  await page.keyboard.press('Space'); await expect(room).toHaveAttribute('data-transport', 'playing');
  await page.getByRole('button', { name: 'Play C4', exact: true }).click();
  await expect(page.locator('.practice-note.completed')).toHaveCount(2);
  await page.keyboard.press('Shift+Space'); await expect(room).toHaveAttribute('data-transport', 'stopped');
  await expect(page.locator('.practice-note.completed')).toHaveCount(0);
  await page.getByRole('button', { name: 'Play C4', exact: true }).click();
  await expect(page.locator('.practice-note.completed')).toHaveCount(0);
  await page.keyboard.press('Space'); await page.getByRole('button', { name: 'Play C4', exact: true }).click();
  await page.keyboard.press('Escape'); await expect(room).toHaveAttribute('data-transport', 'stopped');
  await expect(page.locator('.practice-note.completed')).toHaveCount(0);
});

test('the left drawer pauses practice, traps focus, and keeps Space available for settings', async ({ page }) => {
  await openPractice(page); await page.keyboard.press('Space');
  await page.getByRole('button', { name: 'Play C4', exact: true }).click();
  await openMenu(page);
  await expect(page.locator('.practice-room')).toHaveAttribute('data-transport', 'paused');
  await expect(page.locator('.practice-focus-content')).toHaveAttribute('inert', '');
  const dialog = page.getByRole('dialog');
  expect((await dialog.boundingBox())!.x).toBe(0);
  await expect(page.getByRole('button', { name: 'Close menu', exact: true })).toBeFocused();
  await page.keyboard.press('Shift+Tab'); await expect(page.getByRole('button', { name: 'Back to piano →' })).toBeFocused();
  await page.keyboard.press('Tab'); await expect(page.getByRole('button', { name: 'Close menu', exact: true })).toBeFocused();
  await page.getByRole('checkbox', { name: 'Finger hints' }).focus(); await page.keyboard.press('Space');
  await expect(page.getByRole('checkbox', { name: 'Finger hints' })).not.toBeChecked();
  await expect(page.locator('.practice-room')).toHaveAttribute('data-transport', 'paused');
  await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Open practice menu' })).toBeFocused();
  await expect(page.locator('.practice-note.completed')).toHaveCount(1);
  await page.keyboard.press('Space'); await page.getByRole('button', { name: 'Play C4', exact: true }).click();
  await expect(page.locator('.practice-note.completed')).toHaveCount(2);
  await openMenu(page); await page.getByRole('button', { name: '2 Listen & clap', exact: false }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText('Listen & clap', { exact: true })).toBeVisible();
});

test('pausing a sounding demo holds its real audio clock and resumes the same count-in', async ({ page }) => {
  await page.addInitScript(() => {
    const NativeAudioContext = AudioContext;
    class ObservedAudioContext extends NativeAudioContext {
      constructor() { super(); Object.assign(window, { practiceAudioTest: this }); }
    }
    Object.assign(window, { AudioContext: ObservedAudioContext });
  });
  await openPractice(page); await page.getByRole('button', { name: 'Listen & clap', exact: true }).click();
  const room = page.locator('.practice-room');
  await expect(room).toHaveAttribute('data-transport', 'playing');
  await page.keyboard.press('Space'); await expect(room).toHaveAttribute('data-transport', 'paused');
  await expect.poll(() => page.evaluate(() => (window as unknown as { practiceAudioTest: AudioContext }).practiceAudioTest.state)).toBe('suspended');
  const time = await page.evaluate(() => (window as unknown as { practiceAudioTest: AudioContext }).practiceAudioTest.currentTime);
  // Wall time must pass to prove the real context clock is frozen.
  await page.waitForTimeout(550);
  expect(await page.evaluate(() => (window as unknown as { practiceAudioTest: AudioContext }).practiceAudioTest.currentTime)).toBe(time);
  await page.keyboard.press('Space'); await expect(room).toHaveAttribute('data-transport', 'playing');
  await expect.poll(() => page.evaluate(() => (window as unknown as { practiceAudioTest: AudioContext }).practiceAudioTest.currentTime)).toBeGreaterThan(time + 0.1);
  await page.keyboard.press('Shift+Space'); await expect(room).toHaveAttribute('data-transport', 'stopped');
});
