import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { zip, crc32 } from '../src/core/zip.js';

test('crc32 known value', () => {
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
});

test('zip opens in a standard reader with the same contents (incl. UTF-8)', () => {
  const files = [{ name: 'a.csv', content: 'x,y\n1,2\n' }, { name: 'data_dictionary.csv', content: 'Åkerstedt,é\n' }];
  const dir = mkdtempSync(join(tmpdir(), 'zip-'));
  const p = join(dir, 't.zip');
  writeFileSync(p, zip(files));
  const out = execFileSync('python3', ['-I', '-c', 'import sys,zipfile,json; z=zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None; print(json.dumps({n: z.read(n).decode() for n in z.namelist()}))', p]).toString();
  assert.deepEqual(JSON.parse(out), Object.fromEntries(files.map((f) => [f.name, f.content])));
});
