// Form for laboratory reference measurements (stored separately from predictions).
import { h } from '../dom.js';
import { openSheet, ask } from '../dialogs.js';
import { app, update } from '../store.js';
import { addRecord } from '../../core/repo.js';
import { validateRecord, hasErrors } from '../../core/validate.js';
import { toIso } from '../../core/time.js';
import { dateTime, chips, numberInput, textInput, issueList, nowIso } from '../kit.js';

const UNITS = { melatonin: [['pg/mL', 'pg/mL']], cortisol: [['nmol/L', 'nmol/L'], ['ug/dL', 'µg/dL']], dlmo: [['clock_minutes', 'clock time']] };

export function openLabForm() {
  const tz = app.state.user.timezone;
  const r = { analyte: 'dlmo', measured_unit: 'clock_minutes', sample_type: 'saliva', collection_timestamp: nowIso(), quality_control_status: 'not_reported' };
  const box = h('div', { class: 'form' });
  const issues = h('div');
  let dlmoClock = '';
  const candidate = () => ({ id: '00000000-0000-4000-8000-000000000000', participant_id: app.state.research.participant_id, source: 'user', tz, created_at: toIso(Date.now()), ...r });
  const check = () => {
    const i = validateRecord('laboratory_measurements', candidate());
    issues.replaceChildren(issueList(i));
    return i;
  };
  const paint = () => {
    box.replaceChildren(
      h('div', { class: 'q' }, h('span', {}, 'What was measured'), chips([['dlmo', 'DLMO'], ['melatonin', 'Melatonin'], ['cortisol', 'Cortisol']], r.analyte, (v) => { r.analyte = v; r.measured_unit = UNITS[v][0][0]; r.measured_value = undefined; paint(); check(); }, 'Analyte')),
      dateTime(r.analyte === 'dlmo' ? 'Evening of the test (any time that evening)' : 'Sample collected at', r.collection_timestamp, tz, (v) => { r.collection_timestamp = v ?? undefined; check(); }, { required: true }),
      r.analyte === 'dlmo'
        ? h('label', { class: 'q-row' }, h('span', {}, 'Melatonin onset time (from the lab report)'), h('input', { type: 'time', class: 'time-input', value: dlmoClock, onchange: (e) => { dlmoClock = e.target.value; const [hh, mm] = dlmoClock.split(':').map(Number); r.measured_value = dlmoClock ? hh * 60 + mm : undefined; check(); } }))
        : h('div', { class: 'q' }, h('label', { class: 'q-row' }, h('span', {}, 'Value'), numberInput(r.measured_value, (v) => { r.measured_value = v ?? undefined; check(); }, { label: 'Value', min: 0, step: 0.01 })),
            chips(UNITS[r.analyte], r.measured_unit, (v) => { r.measured_unit = v; check(); }, 'Unit')),
      h('div', { class: 'q' }, h('span', {}, 'Sample type'), chips([['saliva', 'Saliva'], ['plasma', 'Plasma'], ['serum', 'Serum'], ['urine', 'Urine'], ['derived', 'Derived (e.g. DLMO)']], r.sample_type, (v) => { r.sample_type = v; check(); }, 'Sample type')),
      h('label', { class: 'q' }, h('span', {}, 'Assay or method'), textInput(r.assay_method, (v) => { r.assay_method = v ?? undefined; }, { label: 'Assay', placeholder: 'e.g. ELISA; DLMO threshold 3 pg/mL' })),
      h('label', { class: 'q' }, h('span', {}, 'Laboratory'), textInput(r.laboratory_identifier, (v) => { r.laboratory_identifier = v ?? undefined; }, { label: 'Laboratory' })),
      h('div', { class: 'q' }, h('span', {}, 'Quality control'), chips([['passed', 'Passed'], ['failed', 'Failed'], ['pending', 'Pending'], ['not_reported', 'Not reported']], r.quality_control_status, (v) => { r.quality_control_status = v; }, 'QC')),
      h('label', { class: 'q' }, h('span', {}, 'Protocol deviations'), textInput(r.protocol_deviation, (v) => { r.protocol_deviation = v ?? undefined; }, { label: 'Deviations', placeholder: 'e.g. light during sampling, missed sample' })));
  };
  paint();
  openSheet({
    title: 'Add lab result',
    sub: 'Reference measurement, stored separately from estimates',
    body: h('div', { class: 'form' }, box, issues),
    onOk: async (close) => {
      const i = check();
      if (hasErrors(i)) return ask({ title: 'Please check the entry', message: i.find((x) => x.level === 'error').message, ok: 'OK', cancel: null });
      const res = addRecord(app.state, 'laboratory_measurements', r, { source: 'user' });
      if (hasErrors(res.issues)) return ask({ title: 'Could not save', message: res.issues.find((x) => x.level === 'error').message, ok: 'OK', cancel: null });
      close();
      update(res.state, 'Lab result saved');
    },
  });
}
