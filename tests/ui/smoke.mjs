// Phone-sized UI smoke test (needs Playwright + a running `npm start`).
// Walks setup → log a night → sample data → every tab and sheet, in light and dark,
// and fails on page errors or content wider than the screen.
//   npm start  (in another terminal)   then   npm run test:ui
import { createRequire } from 'node:module';

let pw;
try {
  pw = createRequire(import.meta.url)('playwright');
} catch {
  console.log('Playwright is not installed; skipping the UI smoke test.');
  process.exit(0);
}
const { chromium, devices } = pw;

const URL = process.env.APP_URL || 'http://localhost:5173/';
const problems = [];
const browser = await chromium.launch();
for (const scheme of ['light', 'dark']) {
  const ctx = await browser.newContext({ ...devices['iPhone 13'], colorScheme: scheme });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => problems.push(`${scheme}: ${e.message}`));
  const wide = async (where) => {
    const n = await p.evaluate(() => [...document.querySelectorAll('body *')].filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width && r.right > innerWidth + 1 && !el.closest('.chart-wrap,.table-scroll');
    }).length);
    if (n) problems.push(`${scheme} ${where}: ${n} elements wider than the screen`);
  };
  await p.goto(URL);
  await p.fill('.ob-age', '30');
  for (let i = 0; i < 3; i++) await p.click('text=Next');
  await p.click('text=Show my plan');
  await p.click('text=Log last night');
  await wide('log sheet');
  await p.click('.sheet-head .ok');
  await p.waitForSelector('.logged');
  await p.evaluate(() => localStorage.clear());
  await p.reload();
  await p.click('text=Look around with sample data');
  await wide('tonight');
  await p.click('[aria-label="Body clock details"]');
  await wide('body clock sheet');
  await p.click('.sheet [aria-label=Close]');
  await p.waitForTimeout(300);
  for (const tab of ['week', 'settings']) {
    await p.click(`.tab[data-view=${tab}]`);
    await wide(tab);
  }
  await ctx.close();
}
await browser.close();
if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log('UI smoke test passed (light + dark, iPhone 13).');
