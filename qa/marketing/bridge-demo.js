// Demo @forge/bridge for Marketplace screenshots. Fictional companies and people; example.com addresses.
const orgs = [
  { id: '1', name: 'Tidewell Logistics' }, { id: '2', name: 'Northmere Travel' }, { id: '3', name: 'Corvane Retail' },
  { id: '4', name: 'Veloair' }, { id: '5', name: 'Brackenfield Finance' }, { id: '6', name: 'Harlow Health' },
  { id: '7', name: 'Ostlund Manufacturing' }, { id: '8', name: 'Kestrel Hospitality' }, { id: '9', name: 'Marrowby Media' },
  { id: '10', name: 'Fernhill Foods' }, { id: '11', name: 'Quillon Industries' }, { id: '12', name: 'Ashgrove Labs' }
];
const people = ['Amelia Clarke', 'Jonas Weber', 'Priya Nair', "Tom O'Brien", 'Sofia Rossi', 'Liam Murphy', 'Chen Wei', 'Grace Doyle', 'Mateo Garcia', 'Hannah Schmidt', 'Aisha Khan', 'Oscar Lindqvist'];
const email = (name) => `${name.toLowerCase().replace(/[^a-z]+/g, '.')}@example.com`;
const customers = people.slice(0, 8).map((name, i) => ({ accountId: `qm:5f1c-${1000 + i}`, displayName: name, emailAddress: email(name) }));
// A 16k-customer index for the large-site shot.
const FIRST = ['Emma','Noah','Olivia','Liam','Ava','Lucas','Mia','Ethan','Isla','Leo','Zara','Finn','Ruby','Omar','Chloe','Arjun','Nora','Felix','Maya','Hugo','Ines','Kai','Elena','Ravi','Freya','Tomas','Lena','Yusuf','Clara','Diego'];
const LAST = ['Walsh','Becker','Moreau','Kowalski','Silva','Novak','Jensen','Brennan','Costa','Fischer','Haddad','Larsen','Duarte','Keane','Petrov','Iqbal','Romano','Sato','Byrne','Lindgren','Okafor','Meyer','Carvalho','Doyle','Varga','Nilsen','Rahman','Quinn','Farrell','Hale'];
export const demoName = (i) => `${FIRST[i % FIRST.length]} ${LAST[Math.floor(i / FIRST.length) % LAST.length]}${i >= FIRST.length * LAST.length ? ' ' + String.fromCharCode(65 + Math.floor(i / (FIRST.length * LAST.length)) % 26) + '.' : ''}`;
export const demoEmail = (i) => `${demoName(i).toLowerCase().replace(/[^a-z]+/g, '.').replace(/\.$/, '')}.${i}@example.com`;
const bigIndex = Array.from({ length: 12840 }, (_, i) => ({ accountId: `qm:${i}`, displayName: i % 3 === 0 ? `${demoName(i).split(' ')[0]} ${LAST[(i + 7) % LAST.length]}` : demoName(i), emailAddress: demoEmail(i) }));

let syncConfig = {
  enabled: true, clientFieldId: 'customfield_10050', organisationsFieldId: 'customfield_10002', projectKeys: ['SUP'], ignoredRequestTypeIds: [],
  mappings: [
    { clientValue: 'TDW', organizationId: '1', organizationName: 'Tidewell Logistics' },
    { clientValue: 'NMT', organizationId: '2', organizationName: 'Northmere Travel' },
    { clientValue: 'CRV', organizationId: '3', organizationName: 'Corvane Retail' },
    { clientValue: 'VLA', organizationId: '4', organizationName: 'Veloair' },
    { clientValue: 'BRF', organizationId: '5', organizationName: 'Brackenfield Finance' }
  ]
};
let mappings = [{ id: 'm1', name: 'CRM monthly export', serviceDeskId: '1', emailHeader: 'Work Email', displayNameHeader: 'Contact Name', organisationHeader: 'Account', updatedAt: '2026-09-20T10:00:00Z' }];
let bulkCount = 0;

const handlers = {
  getServiceDesks: () => ({ values: [{ id: '1', projectKey: 'SUP', projectName: 'Customer Support' }, { id: '2', projectKey: 'OPS', projectName: 'Operations Desk' }] }),
  getAppStatus: () => ({ version: '0.5.0', licensed: true, production: true }),
  getCustomers: ({ query = '' }) => ({ values: customers.filter((c) => !query || c.emailAddress === query.toLowerCase() || c.displayName.includes(query)) }),
  getCustomerIndexBatch: ({ start = 0 }) => ({ customers: bigIndex.slice(start, start + 500), nextStart: start + 500, complete: start + 500 >= bigIndex.length, pagesFetched: 10 }),
  getOrganizationIndexBatch: () => ({ organizations: orgs, nextStart: 50, complete: true, pagesFetched: 1 }),
  getImportOrganizations: ({ names }) => {
    const wanted = new Set(names.map((n) => n.trim().toLowerCase()));
    return { organizations: orgs.filter((o) => wanted.has(o.name.toLowerCase())), nextStart: 50, complete: true };
  },
  createImportOrganizations: ({ names }) => ({ created: names.map((name, i) => ({ id: String(100 + i), name })) }),
  validateImport: ({ rows }) => ({
    valid: rows.filter((r) => /@.+\./.test(r.email)).length,
    errors: rows.map((r, i) => (/@.+\./.test(r.email) ? null : { row: i + 2, message: 'Valid email required' })).filter(Boolean)
  }),
  getImportMappings: () => mappings,
  saveImportMapping: (m) => { const saved = { ...m, id: m.id || `m${mappings.length + 1}`, updatedAt: new Date().toISOString() }; mappings = [saved, ...mappings.filter((x) => x.id !== saved.id)]; return saved; },
  deleteImportMapping: ({ id }) => { mappings = mappings.filter((x) => x.id !== id); return { ok: true }; },
  findRecoverableImportSession: () => null,
  startImportSession: (s) => ({ ...s, status: 'READY' }),
  bulkUpsertCustomers: () => { bulkCount += 1; return { id: `task-${bulkCount}`, statusUrl: '' }; },
  getTaskStatus: () => ({ status: 'COMPLETE', failures: [] }),
  finaliseImportBatch: ({ rows }) => {
    const results = rows.map((r) => (r.email.startsWith('oscar')
      ? { rowNumber: r.rowNumber, email: r.email, status: 'failed', error: 'Not added to organisation Ridgeway Partners: this organisation is not added to the Customer Support project yet.' }
      : { rowNumber: r.rowNumber, email: r.email, status: 'done', accountId: 'qm:x' }));
    const linked = results.filter((r) => r.status === 'done').length;
    return { results, linked, problems: results.length - linked };
  },
  getImportSessions: () => [
    { id: 'b1c2-4f7a', createdAt: '2026-09-28T09:14:00Z', fileName: 'crm-export-september.csv', submittedRows: 16413, totalRows: 16413, completedBatches: 165, totalBatches: 165, linkedRows: 16398, problemRows: 15, status: 'SUBMITTED' },
    { id: 'a9e1-22c0', createdAt: '2026-09-21T15:02:00Z', fileName: 'new-partner-contacts.csv', submittedRows: 240, totalRows: 240, completedBatches: 3, totalBatches: 3, linkedRows: 240, problemRows: 0, status: 'SUBMITTED' },
    { id: '77d3-9b15', createdAt: '2026-09-14T11:40:00Z', fileName: 'events-signups.csv', submittedRows: 900, totalRows: 1200, completedBatches: 9, totalBatches: 12, linkedRows: 900, problemRows: 0, status: 'IN_PROGRESS' }
  ],
  getImportHistory: () => Array.from({ length: 6 }, (_, i) => ({ id: `h${i}`, createdAt: `2026-09-28T09:${String(14 + i).padStart(2, '0')}:00Z`, batchNumber: 160 + i, totalBatches: 165, count: 100, taskId: `7c1e${i}a2-4d9b-3f6e-8a10-5b2c${i}91e0d4f` })),
  getSyncSetup: () => ({
    fields: { organisationsField: { id: 'customfield_10002', name: 'Organizations' }, requestTypeField: { id: 'customfield_10010', name: 'Request Type' }, clientCandidates: [{ id: 'customfield_10050', name: 'Client', type: 'select' }, { id: 'customfield_10060', name: 'Brand code', type: 'text' }] },
    config: syncConfig,
    health: { checked: 14382, correct: 14319, needsChange: 51, noClient: 0, ignored: 0, missing: { FHL: 8, QLN: 4 }, checkedAt: '2026-09-29T08:30:00Z' }
  }),
  saveSyncConfig: (c) => { syncConfig = { ...c, organisationsFieldId: 'customfield_10002' }; return { ...syncConfig, warnings: [] }; },
  getClientValueSuggestions: () => ['TDW', 'NMT', 'CRV', 'VLA', 'BRF', 'FHL', 'QLN'],
  scanSyncHealth: () => ({
    checked: 14382, correct: 14319, noClient: 0, ignored: 0, complete: true,
    needsChange: [
      { id: '1', key: 'SUP-4821', clientValue: 'NMT', from: ['1'], to: ['2'] },
      { id: '2', key: 'SUP-4817', clientValue: 'CRV', from: [], to: ['3'] },
      { id: '3', key: 'SUP-4790', clientValue: 'VLA', from: ['3', '9'], to: ['9', '4'] },
      { id: '4', key: 'SUP-4702', clientValue: 'TDW', from: [], to: ['1'] },
      { id: '5', key: 'SUP-4688', clientValue: 'BRF', from: ['2'], to: ['5'] },
      ...Array.from({ length: 46 }, (_, i) => ({ id: String(10 + i), key: `SUP-${4600 - i * 7}`, clientValue: 'TDW', from: [], to: ['1'] }))
    ],
    missing: { FHL: 8, QLN: 4 }
  }),
  saveSyncHealth: (h) => ({ ...h, checkedAt: new Date().toISOString() }),
  applySyncCorrections: ({ issueIds }) => ({ corrected: issueIds.map((id) => `SUP-${id}`), unchanged: [], failed: [] }),
  getSyncLog: () => [
    { at: '2026-09-29T09:12:00Z', issueKey: 'SUP-4830', clientValue: 'NMT', from: ['1'], to: ['2'], source: 'client-changed' },
    { at: '2026-09-29T09:05:00Z', issueKey: 'SUP-4829', clientValue: 'CRV', from: [], to: ['3'], source: 'created' },
    { at: '2026-09-29T08:58:00Z', issueKey: 'SUP-4826', clientValue: 'FHL', from: [], to: [], source: 'missing-mapping' },
    { at: '2026-09-29T08:31:00Z', issueKey: 'SUP-4702', clientValue: 'TDW', from: [], to: ['1'], source: 'backfill' }
  ]
};

export async function invoke(name, payload = {}) {
  await new Promise((r) => setTimeout(r, 20));
  if (!handlers[name]) throw new Error(`No demo handler for ${name}`);
  return handlers[name](payload);
}
export const view = { theme: { enable: async () => {} } };
