// App shell: dock, screens, first-launch setup, theme.
import { icon } from './dom.js';
import { app, onChange } from './store.js';
import { renderTonight } from './tonight.js';
import { renderWeek } from './week.js';
import { renderSettings } from './settings.js';
import { renderOnboarding } from './onboarding.js';
import { applyTheme } from './theme.js';

const VIEWS = { tonight: renderTonight, week: renderWeek, settings: renderSettings };
const ICON = { tonight: 'moon', week: 'week', settings: 'sliders' };
let current = 'tonight';

const dock = document.getElementById('dock');
const onboard = document.getElementById('onboard');

dock.querySelectorAll('.tab').forEach((b) => {
  b.append(icon(ICON[b.dataset.view]));
  b.addEventListener('click', () => go(b.dataset.view));
});

function go(name) {
  if (name === current) {
    document.getElementById(`view-${name}`).scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }
  current = name;
  render(true);
}

const onboarded = () => Boolean(app.state.profile?.onboarded || app.state.entries.length);

function render(animate = false) {
  if (!onboarded()) {
    for (const name of Object.keys(VIEWS)) document.getElementById(`view-${name}`).hidden = true;
    dock.hidden = true;
    onboard.hidden = false;
    renderOnboarding(onboard);
    return;
  }
  onboard.hidden = true;
  onboard.replaceChildren();
  dock.hidden = false;
  for (const name of Object.keys(VIEWS)) {
    const el = document.getElementById(`view-${name}`);
    const show = name === current;
    el.hidden = !show;
    if (show) {
      const top = el.scrollTop;
      VIEWS[name](el);
      if (animate) {
        el.scrollTop = 0;
        el.classList.remove('view-enter');
        void el.offsetWidth;
        el.classList.add('view-enter');
      } else el.scrollTop = top;
    }
  }
  dock.querySelectorAll('.tab').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.view === current)));
}

onChange(() => render());
applyTheme(app.state.settings?.theme ?? 'auto');
render();

// Re-render when the app comes back to the foreground (the "next" steps depend on the time).
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') render();
});

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
