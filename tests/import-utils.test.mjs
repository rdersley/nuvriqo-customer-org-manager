import test from 'node:test';
import assert from 'node:assert/strict';
import { analyseRows, mapRows, parseCsv, suggestMapping, toIssueCsv } from '../static/src/import-utils.js';

test('parses quoted CSV values and preserves row numbers', () => {
  const parsed = parseCsv('Email,Full Name,Organisation\n"a@example.com","Doe, Jane","Example Ltd"');
  assert.deepEqual(parsed.headers, ['Email', 'Full Name', 'Organisation']);
  assert.equal(parsed.rows[0].rowNumber, 2);
  assert.equal(parsed.rows[0].raw['Full Name'], 'Doe, Jane');
});

test('suggests common Jira customer import mappings', () => {
  assert.deepEqual(suggestMapping(['Email Address', 'Customer Name', 'Company']), {
    email: 'Email Address',
    displayName: 'Customer Name',
    organisation: 'Company'
  });
});

test('maps arbitrary source columns into importer fields', () => {
  const rows = [{ rowNumber: 2, raw: { Mail: ' A@EXAMPLE.COM ', Person: ' Jane Doe ', Company: ' Acme ' } }];
  assert.deepEqual(mapRows(rows, { email: 'Mail', displayName: 'Person', organisation: 'Company' }), [{
    rowNumber: 2,
    email: 'A@EXAMPLE.COM',
    displayName: 'Jane Doe',
    organisation: 'Acme'
  }]);
});

test('detects duplicate, invalid email and missing name rows', () => {
  const result = analyseRows([
    { rowNumber: 2, email: 'A@example.com', displayName: 'Jane', organisation: '' },
    { rowNumber: 3, email: 'a@example.com', displayName: 'John', organisation: '' },
    { rowNumber: 4, email: 'bad', displayName: '', organisation: '' }
  ]);
  assert.equal(result.valid, 1);
  assert.equal(result.invalid, 2);
  assert.match(result.rows[1].issues.join(' '), /Duplicate email/);
  assert.match(result.rows[2].issues.join(' '), /Valid email required/);
  assert.match(result.rows[2].issues.join(' '), /Display name required/);
});

test('creates a downloadable row-level issue CSV', () => {
  const csv = toIssueCsv([{ row: 4, message: 'Display name required' }]);
  assert.equal(csv, 'Row,Issue\n4,Display name required');
});
