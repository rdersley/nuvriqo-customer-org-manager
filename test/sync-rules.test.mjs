import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, readClientValue, changelogTouchesField, normaliseConfig, inScope } from '../src/sync/rules.js';

// Ryanair = 10, Buzz = 20, Lauda = 30; 99 is an org someone added by hand (not in any mapping).
const mappings = [
  { clientValue: 'RYR', organizationId: '10', organizationName: 'Ryanair' },
  { clientValue: 'RYS', organizationId: '20', organizationName: 'Buzz' },
  { clientValue: 'LDA', organizationId: '30', organizationName: 'Lauda' }
];
const orgs = (...ids) => ids.map((id) => ({ id: String(id), name: `Org ${id}` }));
const run = (client, current) => evaluate({ clientFieldValue: client == null ? null : { value: client }, organisationsFieldValue: current, mappings });

test('adds the mapped organisation when the ticket has none', () => {
  assert.deepEqual(run('RYR', []), { status: 'needs-change', clientValue: 'RYR', current: [], target: ['10'] });
});

test('already correct: nothing to do', () => {
  assert.equal(run('RYR', orgs(10)).status, 'correct');
});

test('client changed RYR → RYS: swaps Ryanair for Buzz', () => {
  const r = run('RYS', orgs(10));
  assert.equal(r.status, 'needs-change');
  assert.deepEqual(r.target, ['20']);
});

test('organisations added by hand (not in any mapping) are kept', () => {
  const r = run('RYS', orgs(10, 99));
  assert.deepEqual(r.target.sort(), ['20', '99']);
  assert.equal(run('RYR', orgs(10, 99)).status, 'correct');
});

test('removes every other mapped organisation, not just one', () => {
  assert.deepEqual(run('LDA', orgs(10, 20, 99)).target.sort(), ['30', '99']);
});

test('empty client or unmapped value changes nothing', () => {
  assert.equal(run(null, orgs(10)).status, 'no-client');
  assert.equal(run('', orgs(10)).status, 'no-client');
  const unmapped = run('XYZ', orgs(10));
  assert.equal(unmapped.status, 'missing-mapping');
  assert.deepEqual(unmapped.target, ['10']);
});

test('client values match case-insensitively and ignore spaces', () => {
  assert.equal(run(' ryr ', orgs(10)).status, 'correct');
});

test('reads single-select, text and empty client values', () => {
  assert.equal(readClientValue({ value: 'RYR', id: '100' }), 'RYR');
  assert.equal(readClientValue('  LDA '), 'LDA');
  assert.equal(readClientValue(null), '');
  assert.equal(readClientValue({}), '');
});

test('detects whether an update changed the Client field', () => {
  const changelog = { items: [{ fieldId: 'summary' }, { fieldId: 'customfield_10050' }] };
  assert.equal(changelogTouchesField(changelog, 'customfield_10050'), true);
  assert.equal(changelogTouchesField(changelog, 'customfield_99999'), false);
  assert.equal(changelogTouchesField(undefined, 'customfield_10050'), false);
});

test('config validation: rejects duplicates, drops junk, requires a complete setup to enable', () => {
  const base = { clientFieldId: 'customfield_10050', organisationsFieldId: 'customfield_10002', projectKeys: ['sd', 'SD', 'bad key'], mappings };
  const c = normaliseConfig({ ...base, enabled: true, mappings: [...mappings, { clientValue: '', organizationId: '1' }, { clientValue: 'X', organizationId: 'abc' }] });
  assert.deepEqual(c.projectKeys, ['SD']);
  assert.equal(c.mappings.length, 3);
  assert.throws(() => normaliseConfig({ ...base, mappings: [...mappings, { clientValue: 'ryr', organizationId: '40' }] }), /mapped more than once/);
  assert.throws(() => normaliseConfig({ ...base, enabled: true, projectKeys: [] }), /at least one project/);
  assert.throws(() => normaliseConfig({ ...base, enabled: true, clientFieldId: 'summary' }), /Client field/);
  assert.equal(normaliseConfig({ enabled: false }).enabled, false, 'an incomplete config can be saved while off');
});

test('scope: project must be selected; ignored request types are skipped', () => {
  const c = { projectKeys: ['SD'], ignoredRequestTypeIds: ['7'] };
  assert.equal(inScope(c, { projectKey: 'SD', requestTypeId: '3' }), true);
  assert.equal(inScope(c, { projectKey: 'sd' }), true);
  assert.equal(inScope(c, { projectKey: 'OPS' }), false);
  assert.equal(inScope(c, { projectKey: 'SD', requestTypeId: '7' }), false);
});
