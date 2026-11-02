// App shell: dock (Today · Log · Insights · Plan · More), onboarding, theme.
import { icon } from './dom.js';
import { app, onChange, syncTimeZone } from './store.js';
import { setNav } from './nav.js';
import { applyTheme } from './theme.js';
import { renderToday } from './screens/today.js';
import { renderLog } from './screens/log.js';
import { renderInsights } from './screens/insights.js';
import { renderPlan } from './screens/plan.js';
import { renderMore, pageRefreshers } from './screens/more.js';
import { renderOnboarding } from './screens/onboarding.js';

const VIEWS = { today: renderToday, log: renderLog, insights: renderInsights, plan: renderPlan, more: renderMore };
const ICON = { today: 'home', log: 'list', insights: 'chart', plan: 'calendar', more: 'more' };
let current = 'today';
let pendingSub = null;

const dock = document.getElementById('dock');
const onboard = document.getElementById('onboard');
dock.querySelectorAll('.tab').forEach((b) => {
  b.append(icon(ICON[b.dataset.view]));
  b.addEventListener('click', () => go(b.dataset.view));
});

function go(name, sub = null) {
  pendingSub = sub;
  if (name === current && !sub) {
    document.getElementById(`view-${name}`).scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }
  current = name;
  render(true);
}
setNav(go);

function render(animate = false) {
  if (!app.state.user.onboarded) {
    for (const n of Object.keys(VIEWS)) document.getElementById(`view-${n}`).hidden = true;
    dock.hidden = true;
    onboard.hidden = false;
    renderOnboarding(onboard);
    return;
  }
  onboard.hidden = true;
  onboard.replaceChildren();
  dock.hidden = false;
  for (const n of Object.keys(VIEWS)) {
    const el = document.getElementById(`view-${n}`);
    el.hidden = n !== current;
    if (n !== current) continue;
    const top = el.scrollTop;
    VIEWS[n](el, pendingSub);
    pendingSub = null;
    if (animate) {
      el.scrollTop = 0;
      el.classList.remove('view-enter');
      void el.offsetWidth;
      el.classList.add('view-enter');
    } else el.scrollTop = top;
  }
  dock.querySelectorAll('.tab').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.view === current)));
}

onChange(() => {
  render();
  pageRefreshers.forEach((fn) => fn());
});
applyTheme(app.state.settings?.theme ?? 'auto');
render();

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') syncTimeZone();
});
syncTimeZone();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
