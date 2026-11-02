// SCREEN 8 — Research & data export, reference measurements, validation tools.
import { h, icon } from '../dom.js';
import { toggle, field, tell } from '../dialogs.js';
import { app, update } from '../store.js';
import { buildExport, pairWithReference, evaluate, toCsv, EXPORT_VERSION } from '../../core/research.js';
import { zip } from '../../core/zip.js';
import { CIRCADIAN_MODELS } from '../../core/models/circadian.js';
import { section, badge, emptyNote, row, clock, dur } from '../kit.js';
import { openLabForm } from './labform.js';

const opts = { pseudonymous: true, includeSensitive: false };

export function researchBody() {
  const { state } = app;
  const wrap = h('div', { class: 'form' });
  const r = state.research;

  wrap.append(section('Your research ID', null,
    h('p', { class: 'explain' }, 'Research exports use this pseudonymous ID instead of the app’s internal ID, so exported records are not directly linked to this phone.'),
    h('p', { class: 'display', style: 'font-size:22px' }, r.participant_id),
    field('Allow my records to be used for research', toggle(r.enrolled, (v) => update({ ...state, research: { ...r, enrolled: v, consent_changed_at: new Date().toISOString(), consent_version: '2026-11' } }, v ? 'Research use allowed' : 'Research use withdrawn'), 'Research consent'), { sub: 'Off by default. Withdrawing stops future use; data already shared with a study follows that study’s withdrawal rules.' })));

  wrap.append(section('Export my data', null,
    h('p', { class: 'explain' }, 'A ZIP of CSV files: your raw observations, calculated features, model outputs and lab results in separate files, with a data dictionary. Times are UTC with local-time columns; empty cells mean "not recorded".'),
    field('Use research ID instead of internal ID', toggle(opts.pseudonymous, (v) => { opts.pseudonymous = v; }, 'Pseudonymous')),
    field('Include medications (sensitive)', toggle(opts.includeSensitive, (v) => { opts.includeSensitive = v; }, 'Include medications')),
    h('button', { type: 'button', class: 'big-btn', onclick: () => download(state) }, icon('download'), 'Download export (.zip)'),
    h('p', { class: 'note' }, `Export format v${EXPORT_VERSION}. Nothing is uploaded: the file is created on this device.`)));

  wrap.append(section('Lab results', h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Add a lab result', onclick: () => openLabForm() }, icon('plus')),
    h('p', { class: 'explain' }, 'Reference measurements (e.g. salivary melatonin, cortisol, laboratory DLMO). Kept separate from model estimates and never mixed with them.'),
    state.tables.laboratory_measurements.length
      ? h('div', { class: 'rows' }, state.tables.laboratory_measurements.map((l) => row({ ic: 'flask', title: `${l.analyte === 'dlmo' ? 'DLMO' : l.analyte} · ${l.analyte === 'dlmo' ? clock(l.measured_value) : `${l.measured_value} ${l.measured_unit}`}`, sub: `${new Date(l.collection_timestamp).toLocaleString()} · ${l.sample_type}${l.quality_control_status ? ` · QC ${l.quality_control_status}` : ''}`, end: badge('reference') })))
      : emptyNote('None yet.')));

  wrap.append(section('Model check', badge('experimental'), validationBlock(state)));
  return wrap;
}

function validationBlock(state) {
  const labs = state.tables.laboratory_measurements.filter((l) => l.analyte === 'dlmo' && l.quality_control_status !== 'failed');
  if (!labs.length) return emptyNote('Comparisons with laboratory DLMO appear here once a DLMO result is added. With no reference measurements, the circadian estimates remain unvalidated.');
  const blocks = CIRCADIAN_MODELS.map((m) => {
    const pairs = pairWithReference(state.tables.model_predictions, labs, { modelName: m.name });
    const ev = evaluate(pairs, { circular: true });
    return h('div', { class: 'card' },
      h('div', { class: 'card-head' }, h('b', {}, m.name), h('span', { class: 'muted small' }, `v${m.version}`)),
      ev.n ? h('p', { class: 'explain' }, `${ev.n} comparison${ev.n > 1 ? 's' : ''}: mean absolute error ${dur(ev.mae)}, mean signed error ${ev.meanSignedError >= 0 ? '+' : '−'}${dur(Math.abs(ev.meanSignedError))} (predicted later = +).`)
        : h('p', { class: 'explain' }, 'No prediction from this model was stored before your lab result(s), so there is nothing to compare yet. Predictions are stored daily from now on.'),
      h('p', { class: 'note' }, `Only predictions made before each sample are used. ${ev.n < 10 ? 'A handful of comparisons from one person is not a validation.' : ''}`));
  });
  return h('div', { class: 'form' }, ...blocks);
}

function download(state) {
  try {
    const files = buildExport(state, { now: Date.now(), pseudonymous: opts.pseudonymous, includeSensitive: opts.includeSensitive });
    const blob = new Blob([zip(files)], { type: 'application/zip' });
    const a = h('a', { href: URL.createObjectURL(blob), download: `sleep-advisor-export-${new Date().toISOString().slice(0, 10)}.zip` });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  } catch (err) {
    tell('Export failed', err.message);
  }
}

export { toCsv };
