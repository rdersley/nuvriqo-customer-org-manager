import test from 'node:test';
import assert from 'node:assert/strict';
import { analyseRows, failureReportCsv, importHistoryCsv, mapRows, parseCsv, planImportRows, suggestMapping, taskFailures, taskStatus, toIssueCsv } from '../static/src/import-utils.js';

test('parses quoted CSV values and preserves row numbers', () => {
  const parsed = parseCsv('Email,Full Name,Organisation\n"a@example.com","Doe, Jane","Example Ltd"');
  assert.deepEqual(parsed.headers, ['Email', 'Full Name', 'Organisation']);
  assert.equal(parsed.rows[0].rowNumber, 2);
  assert.equal(parsed.rows[0].raw['Full Name'], 'Doe, Jane');
});

test('suggests common Jira customer import mappings', () => {
  assert.deepEqual(suggestMapping(['Email Address', 'Customer Name', 'Company']), { email: 'Email Address', displayName: 'Customer Name', organisation: 'Company' });
});

test('maps arbitrary source columns into importer fields', () => {
  const rows = [{ rowNumber: 2, raw: { Mail: ' A@EXAMPLE.COM ', Person: ' Jane Doe ', Company: ' Acme ' } }];
  assert.deepEqual(mapRows(rows, { email: 'Mail', displayName: 'Person', organisation: 'Company' }), [{ rowNumber: 2, email: 'A@EXAMPLE.COM', displayName: 'Jane Doe', organisation: 'Acme' }]);
});

test('detects duplicate, invalid email and missing name rows', () => {
  const result = analyseRows([{ rowNumber: 2, email: 'A@example.com', displayName: 'Jane', organisation: '' }, { rowNumber: 3, email: 'a@example.com', displayName: 'John', organisation: '' }, { rowNumber: 4, email: 'bad', displayName: '', organisation: '' }]);
  assert.equal(result.valid, 1); assert.equal(result.invalid, 2);
  assert.match(result.rows[1].issues.join(' '), /Duplicate email/);
  assert.match(result.rows[2].issues.join(' '), /Valid email required/);
  assert.match(result.rows[2].issues.join(' '), /Display name required/);
});

test('creates a downloadable row-level issue CSV', () => {
  assert.equal(toIssueCsv([{ row: 4, message: 'Display name required' }]), 'Row,Issue\n4,Display name required');
});

test('create-new mode creates new customers and skips existing customers', () => {
  const rows = [{ rowNumber: 2, email: 'new@example.com', displayName: 'New', valid: true }, { rowNumber: 3, email: 'existing@example.com', displayName: 'Existing', valid: true }];
  const plan = planImportRows(rows, ['EXISTING@example.com'], 'create-new');
  assert.equal(plan.create, 1); assert.equal(plan.update, 0); assert.equal(plan.skip, 1); assert.equal(plan.eligible, 1); assert.equal(plan.rows[1].action, 'SKIP');
});

test('update-existing mode only updates customers already in Jira', () => {
  const rows = [{ rowNumber: 2, email: 'new@example.com', displayName: 'New', valid: true }, { rowNumber: 3, email: 'existing@example.com', displayName: 'Existing', valid: true }];
  const plan = planImportRows(rows, ['existing@example.com'], 'update-existing');
  assert.equal(plan.create, 0); assert.equal(plan.update, 1); assert.equal(plan.skip, 1); assert.equal(plan.rows[1].action, 'UPDATE');
});

test('upsert mode explicitly creates new and updates existing customers', () => {
  const rows = [{ rowNumber: 2, email: 'new@example.com', displayName: 'New', valid: true }, { rowNumber: 3, email: 'existing@example.com', displayName: 'Existing', valid: true }, { rowNumber: 4, email: 'bad', displayName: '', valid: false }];
  const plan = planImportRows(rows, ['existing@example.com'], 'upsert');
  assert.equal(plan.create, 1); assert.equal(plan.update, 1); assert.equal(plan.invalid, 1); assert.equal(plan.eligible, 2);
});

test('normalises task status and nested failure shapes for audit reporting', () => {
  assert.equal(taskStatus({ state: 'COMPLETE' }), 'COMPLETE');
  assert.deepEqual(taskFailures({ result: { errors: [{ message: 'No permission' }] } }), [{ message: 'No permission' }]);
  assert.deepEqual(taskFailures(null), []);
});

test('exports import history and failure detail safely as CSV', () => {
  const history = [{ createdAt: '2026-08-29T09:00:00Z', count: 2, taskId: 'task-1', task: { status: 'FAILED', failures: [{ message: 'Name, invalid' }] } }];
  const summary = importHistoryCsv(history), failures = failureReportCsv(history);
  assert.match(summary, /FAILED,1,task-1/);
  assert.match(failures, /"Name, invalid"/);
});
