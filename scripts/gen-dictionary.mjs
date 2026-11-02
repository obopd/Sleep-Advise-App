// Regenerates docs/DATA_DICTIONARY.md from src/core/schema.js and src/core/features.js.
//   node scripts/gen-dictionary.mjs
import { writeFileSync } from 'node:fs';
import { TABLES } from '../src/core/schema.js';
import { FEATURE_DEFS, FEATURE_VERSION } from '../src/core/features.js';

const esc = (s) => String(s ?? '').replace(/\|/g, '\\|');
let md = `# Data dictionary\n\nGenerated from \`src/core/schema.js\` and \`src/core/features.js\` by \`node scripts/gen-dictionary.mjs\`. Do not edit by hand.\n\n`;
md += 'Categories: **observed** (user or device), **derived** (calculated), **prediction** (model output), **reference** (laboratory). They are stored and exported separately.\n\n';
md += 'Conventions: all instants are UTC ISO-8601; `tz` is the IANA zone in which the event happened; empty = not recorded (never zero).\n\n';
for (const [name, def] of Object.entries(TABLES)) {
  md += `## ${name} (${def.category}${def.sensitive ? ', sensitive' : ''})\n\n${def.description}\n\n| Column | Type | Unit | Allowed values | Required | Description |\n|---|---|---|---|---|---|\n`;
  for (const f of def.fields) md += `| \`${f.name}\` | ${f.type} | ${esc(f.unit)} | ${esc(f.values?.join(', '))} | ${f.required ? 'yes' : ''} | ${esc(f.description)} |\n`;
  md += '\n';
}
md += `## Features (derived, version ${FEATURE_VERSION})\n\nComputed "as of" an instant T from data at or before T only. Each has a \`data_coverage\` (0–1).\n\n| Feature | Unit | Definition |\n|---|---|---|\n`;
for (const [n, d] of Object.entries(FEATURE_DEFS)) md += `| \`${n}\` | ${esc(d.unit)} | ${esc(d.description)} |\n`;
writeFileSync(new URL('../docs/DATA_DICTIONARY.md', import.meta.url), md);
console.log('docs/DATA_DICTIONARY.md written');
