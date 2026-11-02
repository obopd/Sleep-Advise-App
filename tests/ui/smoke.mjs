// Phone-sized end-to-end test (Playwright, iPhone 13, light + dark).
//   npm start   (another terminal)   then   npm run test:ui
// Optional: SHOTS=dir to save screenshots of every screen.
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';

let pw;
try {
  pw = createRequire(import.meta.url)('playwright');
} catch {
  console.log('Playwright is not installed; skipping the UI test.');
  process.exit(0);
}
const { chromium, devices } = pw;
const URL = process.env.APP_URL || 'http://localhost:5173/';
const SHOTS = process.env.SHOTS;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const problems = [];
const check = (cond, msg) => { if (!cond) problems.push(msg); };

const browser = await chromium.launch();
for (const scheme of ['light', 'dark']) {
  const ctx = await browser.newContext({ ...devices['iPhone 13'], colorScheme: scheme, timezoneId: 'America/New_York', acceptDownloads: true });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => problems.push(`${scheme}: page error ${e.message}`));
  p.on('console', (m) => m.type() === 'error' && problems.push(`${scheme}: console ${m.text()}`));
  const shot = async (name) => { if (SHOTS) { await p.waitForTimeout(350); await p.screenshot({ path: `${SHOTS}/${scheme}-${name}.png` }); } };
  const wide = async (where) => {
    const n = await p.evaluate(() => [...document.querySelectorAll('body *')].filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width && r.right > innerWidth + 1 && !el.closest('.table-scroll,.quick,.timing');
    }).map((el) => el.className || el.tagName));
    if (n.length) problems.push(`${scheme} ${where}: wider than screen: ${[...new Set(n)].slice(0, 4).join(', ')}`);
  };
  const closeSheet = async () => { await p.click('dialog.sheet [aria-label=Close]'); await p.waitForTimeout(300); };

  await p.goto(URL);
  await p.evaluate(() => localStorage.clear());
  await p.reload();
  // ---- onboarding: consent is required
  await shot('onboarding-1');
  check(await p.isDisabled('text=Agree and continue'), `${scheme}: could continue without consent`);
  await p.click('.ob-body .switch');
  await p.click('.ob-actions >> text=Agree and continue');
  await p.fill('.ob-birthday', '1994-06-01');
  await p.click('text=Next');
  await p.click('text=Regular');
  await shot('onboarding-3');
  for (let i = 0; i < 3; i++) await p.click('.ob-actions >> text=Skip');
  await p.click('.ob-actions >> text=Start');
  await p.waitForSelector('#view-today:not([hidden])');
  await wide('today empty');

  // ---- log sleep (crossing midnight) with time to fall asleep
  await p.click('text=Log your last sleep');
  await p.waitForSelector('dialog.sheet');
  await shot('sleep-form');
  await wide('sleep form');
  await p.click('dialog.sheet .chips >> text=15m');
  await p.click('dialog.sheet .icon-btn.ok');
  await p.waitForTimeout(400);
  const today = await p.textContent('#view-today');
  check(/Recorded|Calculated/.test(today), `${scheme}: data-category labels missing on Today`);
  check(/Sleep\s*[0-9]/.test(today), `${scheme}: sleep duration not shown`);
  check(!/pg\/mL|nmol/.test(today), `${scheme}: hormone concentration shown`);

  // ---- add caffeine and a nap
  await p.click('.quick-btn >> text=Caffeine');
  await p.click('dialog.sheet .icon-btn.ok');
  await p.waitForTimeout(300);
  await p.click('.tab[data-view=log]');
  await p.click('#view-log .icon-btn.round');
  await p.waitForSelector('dialog.sheet');
  await p.click('dialog.sheet .segmented >> text=Nap');
  await p.click('dialog.sheet .icon-btn.ok');
  await p.waitForTimeout(400);
  // overlapping nap? if a confirm card shows (warnings), accept it
  if (await p.isVisible('.ask-card')) await p.click('.ask-btn.primary');
  await p.waitForTimeout(300);
  await shot('log');
  await wide('log');

  // ---- sample data path for the analytics screens
  await p.evaluate(() => localStorage.clear());
  await p.reload();
  await p.click('text=Explore with sample data first');
  await p.waitForSelector('#view-today:not([hidden])');
  await shot('today');
  await wide('today');
  for (const tab of ['log', 'insights', 'plan', 'more']) {
    await p.click(`.tab[data-view=${tab}]`);
    await p.waitForTimeout(250);
    await shot(tab);
    await wide(tab);
  }
  check(/associations, not causes/.test(await p.textContent('#view-insights')), `${scheme}: causation disclaimer missing`);
  await p.click('.tab[data-view=plan]');
  check(/Recommended sleep opportunity/.test(await p.textContent('#view-plan')), `${scheme}: scheduler missing`);
  await p.click('#view-plan .row >> nth=0');
  await shot('recommendation');
  check(/Limitations/.test(await p.textContent('dialog.sheet')), `${scheme}: recommendation without limitations`);
  await closeSheet();

  await p.click('.tab[data-view=more]');
  for (const page of ['Biology', 'Research & export', 'Data quality', 'Import', 'Settings', 'Privacy & consent', 'Backup', 'How it works']) {
    await p.click(`#view-more .row >> text=${page}`);
    await p.waitForSelector('dialog.sheet');
    await shot(`more-${page.split(' ')[0].toLowerCase()}`);
    await wide(`more ${page}`);
    if (page === 'Biology') {
      const t = await p.textContent('dialog.sheet');
      check(/cannot measure or reliably determine your melatonin or cortisol/.test(t), `${scheme}: hormone limitation statement missing`);
      check(!/Estimated melatonin onset/.test(t), `${scheme}: experimental estimate shown before opting in`);
      await p.click('dialog.sheet .switch');
      await p.waitForTimeout(300);
      await shot('biology-experimental');
      check(/Experimental/i.test(await p.textContent('dialog.sheet')), `${scheme}: experimental label missing`);
    }
    if (page === 'Backup') {
      const [dl] = await Promise.all([p.waitForEvent('download'), p.click('text=Save backup file')]);
      check(/\.json$/.test(dl.suggestedFilename()), `${scheme}: backup not a json file`);
    }
    if (page === 'Research & export') {
      const [dl] = await Promise.all([p.waitForEvent('download'), p.click('text=Download export (.zip)')]);
      check(/\.zip$/.test(dl.suggestedFilename()), `${scheme}: export not a zip`);
    }
    await closeSheet();
  }
  await ctx.close();
}
await browser.close();
if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log('UI test passed (light + dark, iPhone 13).');
