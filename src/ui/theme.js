// Light / dark: 'auto' follows the phone.
const media = matchMedia('(prefers-color-scheme: dark)');
let pref = 'auto';

export function applyTheme(next = pref) {
  pref = next || 'auto';
  const dark = pref === 'dark' || (pref === 'auto' && media.matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#000000' : '#ffffff');
}

media.addEventListener?.('change', () => applyTheme());
