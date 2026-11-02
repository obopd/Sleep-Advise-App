// The app's own dialogs, sheets and controls (no iPhone system pop-ups or native selects),
// following Planner's design rules.
import { h, icon } from './dom.js';

const reduced = matchMedia('(prefers-reduced-motion: reduce)');

function openLayer(className, content, { onBackdrop } = {}) {
  const dialog = h('dialog', { class: `layer ${className}` }, content);
  document.body.append(dialog);
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog && onBackdrop) onBackdrop();
  });
  dialog.addEventListener('cancel', (e) => {
    e.preventDefault();
    if (onBackdrop) onBackdrop();
  });
  dialog.showModal();
  return {
    close() {
      dialog.classList.add('closing');
      setTimeout(() => {
        dialog.close();
        dialog.remove();
      }, 160);
    },
  };
}

/** Yes/no card. danger = red confirm button. */
export function ask({ title, message = '', ok = 'OK', cancel = 'Cancel', danger = false }) {
  return new Promise((resolve) => {
    let layer;
    const done = (v) => {
      layer.close();
      resolve(v);
    };
    layer = openLayer(
      'ask',
      h('div', { class: 'ask-card', role: 'alertdialog', 'aria-label': title },
        h('p', { class: 'ask-title display' }, title),
        message ? h('p', { class: 'ask-message' }, message) : null,
        h('div', { class: 'ask-actions' },
          cancel ? h('button', { type: 'button', class: 'ask-btn', autofocus: true, onclick: () => done(false) }, cancel) : null,
          h('button', { type: 'button', class: `ask-btn primary${danger ? ' danger' : ''}`, onclick: () => done(true) }, ok))),
      { onBackdrop: () => done(false) },
    );
  });
}

export const tell = (title, message = '') => ask({ title, message, ok: 'OK', cancel: null });

/** Small message above the dock. */
let snackTimer = null;
export function snack(text) {
  document.querySelector('.snack')?.remove();
  clearTimeout(snackTimer);
  const el = h('div', { class: 'snack', role: 'status' }, text);
  document.body.append(el);
  snackTimer = setTimeout(() => {
    el.classList.add('leaving');
    setTimeout(() => el.remove(), 250);
  }, 3000);
}

/**
 * Bottom sheet. Slides up, can be dragged down by its grabber/header to close.
 * Returns { close }. onOk adds a round ✓ button.
 */
export function openSheet({ title, sub = null, body, onOk = null, onClose = null }) {
  const head = h('div', { class: 'sheet-head' },
    h('div', { class: 'sheet-title' }, h('h2', { class: 'display' }, title), sub ? h('div', { class: 'sheet-sub' }, sub) : null),
    h('span', { class: 'spacer' }),
    h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Close', onclick: () => close() }, icon('close')),
    onOk ? h('button', { type: 'button', class: 'icon-btn ok', 'aria-label': 'Save', onclick: () => onOk(close) }, icon('check')) : null);
  const sheet = h('dialog', { class: 'sheet' }, h('div', { class: 'grabber' }), head, h('div', { class: 'sheet-body' }, body));
  document.body.append(sheet);

  let closing = false;
  function close() {
    if (closing) return;
    closing = true;
    const finish = () => {
      sheet.close();
      sheet.remove();
      onClose?.();
    };
    if (reduced.matches) return finish();
    sheet.classList.add('closing');
    sheet.style.transition = 'transform 220ms cubic-bezier(.4,0,1,1)';
    sheet.style.transform = 'translateY(100%)';
    setTimeout(finish, 220);
  }
  sheet.addEventListener('cancel', (e) => {
    e.preventDefault();
    close();
  });
  sheet.addEventListener('click', (e) => {
    if (e.target === sheet) close(); // backdrop
  });

  // Drag down to close (grabber or header, not its buttons).
  let start = null;
  sheet.addEventListener('pointerdown', (e) => {
    const handle = e.target.closest('.grabber, .sheet-head');
    if (!handle || e.target.closest('button, input') || sheet.scrollTop > 0) return;
    start = { y: e.clientY, t: Date.now(), id: e.pointerId, dy: 0, handle };
    sheet.style.transition = 'none';
  });
  sheet.addEventListener('pointermove', (e) => {
    if (!start || e.pointerId !== start.id) return;
    start.dy = Math.max(0, e.clientY - start.y);
    if (start.dy > 4 && !start.handle.hasPointerCapture(e.pointerId)) start.handle.setPointerCapture(e.pointerId);
    sheet.style.transform = `translateY(${start.dy}px)`;
  });
  const end = (e) => {
    if (!start || e.pointerId !== start.id) return;
    const { dy, t } = start;
    start = null;
    const flick = dy > 50 && dy / Math.max(1, Date.now() - t) > 0.6;
    if (dy > Math.min(140, sheet.offsetHeight / 3) || flick) close();
    else {
      sheet.style.transition = 'transform .25s cubic-bezier(.2,.8,.2,1)';
      sheet.style.transform = '';
    }
  };
  sheet.addEventListener('pointerup', end);
  sheet.addEventListener('pointercancel', end);

  sheet.showModal();
  // Don't focus a text field on open (no keyboard until tapped).
  sheet.querySelector('.icon-btn')?.focus({ preventScroll: true });
  return { close, sheet };
}

/**
 * Segmented control. options: [[value, label]]. Returns element with .value and
 * an onchange callback.
 */
export function segmented(options, value, onchange, { label = '' } = {}) {
  let current = value;
  const el = h('div', { class: 'segmented', role: 'radiogroup', 'aria-label': label });
  const paint = () => el.querySelectorAll('button').forEach((b, i) => b.setAttribute('aria-checked', String(options[i][0] === current)));
  options.forEach(([v, text]) =>
    el.append(h('button', {
      type: 'button',
      role: 'radio',
      onclick: () => {
        current = v;
        paint();
        onchange?.(v);
      },
    }, text)));
  Object.defineProperty(el, 'value', { get: () => current, set: (v) => { current = v; paint(); } });
  paint();
  return el;
}

/** iOS-style switch. */
export function toggle(checked, onchange, label) {
  return h('input', { type: 'checkbox', class: 'switch', role: 'switch', 'aria-label': label, checked: checked || null, onchange: (e) => onchange?.(e.target.checked) });
}

/** Row: label on the left, control on the right. */
export function field(label, control, { sub = null } = {}) {
  return h('label', { class: 'field' }, h('span', { class: 'field-label' }, label, sub ? h('small', {}, sub) : null), control);
}

/** Time input; empty allowed. */
export function timeInput(value, onchange, label) {
  return h('input', { type: 'time', class: 'time-input', value: value || '', 'aria-label': label, onchange: (e) => onchange?.(e.target.value) });
}
