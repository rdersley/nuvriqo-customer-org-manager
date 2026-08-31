import Resolver from '@forge/resolver';
import api, { route } from '@forge/api';
import { kvs, WhereConditions } from '@forge/kvs';

const resolver = new Resolver();

async function jsonResponse(response) {
  const text = await response.text();
  let body;
  try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text }; }
  if (!response.ok) {
    const error = new Error(body?.message || body?.errorMessage || `Atlassian API error ${response.status}`);
    error.status = response.status;
    error.body = body;
    throw error;
  }
  return body;
}

async function requireAdmin() {
  const res = await api.asUser().requestJira(route`/rest/api/3/mypermissions?permissions=ADMINISTER`);
  const body = await jsonResponse(res);
  if (!body?.permissions?.ADMINISTER?.havePermission) {
    const error = new Error('Jira administrator permission is required to use Customer & Organisation Manager.');
    error.status = 403;
    throw error;
  }
}

function secureDefine(name, handler) {
  resolver.define(name, async (request) => {
    await requireAdmin();
    return handler(request);
  });
}

resolver.define('health', async () => ({ ok: true, version: '0.1.8' }));

secureDefine('getServiceDesks', async () => {
  const res = await api.asUser().requestJira(route`/rest/servicedeskapi/servicedesk?limit=100`);
  return jsonResponse(res);
});

const customerHeaders = {
  Accept: 'application/json',
  'X-ExperimentalApi': 'opt-in'
};

secureDefine('getCustomers', async ({ payload }) => {
  const serviceDeskId = String(payload?.serviceDeskId || '');
  const query = String(payload?.query || '');
  const start = Number(payload?.start || 0);
  if (!serviceDeskId) throw new Error('serviceDeskId is required');

  const res = await api.asUser().requestJira(
    route`/rest/servicedeskapi/servicedesk/${serviceDeskId}/customer?query=${query}&start=${start}&limit=50`,
    { headers: customerHeaders }
  );
  return jsonResponse(res);
});

secureDefine('getCustomerIndexBatch', async ({ payload }) => {
  const serviceDeskId = String(payload?.serviceDeskId || '');
  let start = Math.max(0, Number(payload?.start || 0));
  const pages = Math.min(10, Math.max(1, Number(payload?.pages || 10)));
  if (!serviceDeskId) throw new Error('serviceDeskId is required');

  const customers = [];
  let complete = false;
  let pagesFetched = 0;

  for (let page = 0; page < pages; page += 1) {
    const res = await api.asUser().requestJira(
      route`/rest/servicedeskapi/servicedesk/${serviceDeskId}/customer?start=${start}&limit=50`,
      { headers: customerHeaders }
    );
    const body = await jsonResponse(res);
    const values = body?.values || [];
    customers.push(...values.map((customer) => ({
      accountId: customer.accountId || customer.key || '',
      displayName: customer.displayName || '',
      emailAddress: customer.emailAddress || ''
    })));
    pagesFetched += 1;

    if (body?.isLastPage || values.length === 0) {
      complete = true;
      break;
    }

    const limit = Number(body?.limit || 50);
    const returnedStart = Number(body?.start ?? start);
    const nextStart = returnedStart + limit;
    if (!Number.isFinite(nextStart) || nextStart <= start) {
      throw new Error('Jira customer pagination did not advance safely.');
    }
    start = nextStart;
  }

  return { customers, nextStart: start, complete, pagesFetched };
});

secureDefine('getOrganizations', async ({ payload }) => {
  const start = Number(payload?.start || 0);
  const res = await api.asUser().requestJira(route`/rest/servicedeskapi/organization?start=${start}&limit=50`);
  return jsonResponse(res);
});

secureDefine('createOrganization', async ({ payload }) => {
  const name = String(payload?.name || '').trim();
  if (!name) throw new Error('Organisation name is required');
  const res = await api.asUser().requestJira(route`/rest/servicedeskapi/organization`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ name })
  });
  return jsonResponse(res);
});

secureDefine('prepareImportOrganizations', async ({ payload }) => {
  const names = [...new Set((payload?.names || []).map(v => String(v || '').trim()).filter(Boolean))];
  if (!names.length) return { organizations: [], created: [] };

  const existing = [];
  let start = 0;
  for (let page = 0; page < 20; page += 1) {
    const res = await api.asUser().requestJira(route`/rest/servicedeskapi/organization?start=${start}&limit=50`);
    const body = await jsonResponse(res);
    existing.push(...(body.values || []));
    if (body.isLastPage || !(body.values || []).length) break;
    start += body.limit || 50;
  }

  const byName = new Map(existing.map(o => [String(o.name).toLowerCase(), o]));
  const created = [];
  for (const name of names) {
    if (byName.has(name.toLowerCase())) continue;
    const res = await api.asUser().requestJira(route`/rest/servicedeskapi/organization`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ name })
    });
    const org = await jsonResponse(res);
    byName.set(name.toLowerCase(), org);
    created.push(org);
  }
  return { organizations: [...byName.values()].filter(o => names.some(n => n.toLowerCase() === String(o.name).toLowerCase())), created };
});

secureDefine('getTaskStatus', async ({ payload }) => {
  const taskId = String(payload?.taskId || '');
  if (!taskId) throw new Error('taskId is required');
  const res = await api.asUser().requestJira(route`/jsm/csm/api/v1/tasks/${taskId}`);
  return jsonResponse(res);
});

secureDefine('getImportHistory', async () => {
  const result = await kvs.query().where('key', WhereConditions.beginsWith('import:')).limit(100).getMany();
  return (result.results || []).map(r => r.value).sort((a,b) => String(b.createdAt).localeCompare(String(a.createdAt)));
});

secureDefine('getImportSessions', async () => {
  const result = await kvs.query().where('key', WhereConditions.beginsWith('import-session:')).limit(50).getMany();
  return (result.results || []).map(r => r.value).sort((a,b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
});

secureDefine('startImportSession', async ({ payload }) => {
  const id = String(payload?.id || '').trim();
  const fingerprint = String(payload?.fingerprint || '').trim().toLowerCase();
  const serviceDeskId = String(payload?.serviceDeskId || '').trim();
  const fileName = String(payload?.fileName || '').trim().slice(0, 255);
  const actionableRowNumbers = Array.isArray(payload?.actionableRowNumbers)
    ? payload.actionableRowNumbers.map(Number).filter((n) => Number.isInteger(n) && n >= 2)
    : [];
  const totalRows = Math.max(0, Number(payload?.totalRows || actionableRowNumbers.length));
  const totalBatches = Math.max(1, Number(payload?.totalBatches || Math.ceil(actionableRowNumbers.length / 100) || 1));
  const skipped = Math.max(0, Number(payload?.skipped || 0));
  const excludedErrors = Math.max(0, Number(payload?.excludedErrors || 0));

  if (!id) throw new Error('Import session id is required');
  if (!/^[a-f0-9]{64}$/.test(fingerprint)) throw new Error('A SHA-256 import fingerprint is required');
  if (!serviceDeskId) throw new Error('serviceDeskId is required');
  if (!actionableRowNumbers.length) throw new Error('No actionable row numbers supplied');
  if (actionableRowNumbers.length > 50000) throw new Error('Recovery metadata supports at most 50,000 actionable rows');
  if (new Set(actionableRowNumbers).size !== actionableRowNumbers.length) throw new Error('Actionable row numbers must be unique');
  if (totalRows !== actionableRowNumbers.length) throw new Error('Recovery row count does not match the actionable plan');
  if (totalBatches !== Math.ceil(totalRows / 100)) throw new Error('Recovery batch count does not match the actionable plan');

  const key = `import-session:${id}`;
  const existing = await kvs.get(key);
  if (existing) {
    if (existing.fingerprint !== fingerprint || String(existing.serviceDeskId) !== serviceDeskId) {
      throw new Error('Import session identity does not match the saved recovery checkpoint');
    }
    return existing;
  }

  const createdAt = new Date().toISOString();
  const session = {
    id,
    fingerprint,
    serviceDeskId,
    fileName,
    actionableRowNumbers,
    totalRows,
    totalBatches,
    skipped,
    excludedErrors,
    completedBatches: 0,
    submittedRows: 0,
    status: 'READY',
    createdAt,
    updatedAt: createdAt,
    batches: []
  };
  await kvs.set(key, session);
  return session;
});

secureDefine('validateImport', async ({ payload }) => {
  const rows = Array.isArray(payload?.rows) ? payload.rows : [];
  const seen = new Set();
  const errors = [];
  rows.forEach((row, index) => {
    const email = String(row.email || '').trim().toLowerCase();
    const displayName = String(row.displayName || row.fullName || '').trim();
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) errors.push({ row: index + 2, field: 'email', message: 'Valid email required' });
    if (!displayName) errors.push({ row: index + 2, field: 'displayName', message: 'Display name required' });
    if (email && seen.has(email)) errors.push({ row: index + 2, field: 'email', message: 'Duplicate email in file' });
    if (email) seen.add(email);
  });
  return { total: rows.length, valid: Math.max(0, rows.length - new Set(errors.map(e => e.row)).size), errors };
});

secureDefine('bulkUpsertCustomers', async ({ payload }) => {
  const rows = Array.isArray(payload?.rows) ? payload.rows : [];
  if (!rows.length) throw new Error('No rows supplied');
  if (rows.length > 100) throw new Error('This operation accepts at most 100 rows per request');

  const customerProfiles = rows.map((row) => {
    const p = {
      email: String(row.email || '').trim(),
      displayName: String(row.displayName || row.fullName || '').trim()
    };
    const organizationIds = (row.organizationIds || [])
      .map(Number)
      .filter(Number.isFinite);
    if (organizationIds.length) p.associateOrganizations = { organizationIds };
    return { operationType: 'UPSERT', payload: p };
  });

  const suppliedKey = String(payload?.idempotencyKey || '').trim();
  const idempotencyKey = suppliedKey || globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
  if (idempotencyKey.length > 200) throw new Error('Idempotency key is too long');

  const importSessionId = String(payload?.importSessionId || '').trim() || null;
  const batchNumber = Math.max(1, Number(payload?.batchNumber || 1));
  const totalBatches = Math.max(batchNumber, Number(payload?.totalBatches || batchNumber));
  const rowStart = Number(payload?.rowStart || 0) || null;
  const rowEnd = Number(payload?.rowEnd || 0) || null;

  if (importSessionId) {
    const saved = await kvs.get(`import-session:${importSessionId}`);
    if (!saved) throw new Error('Import recovery session was not initialised before batch submission');
    if (Number(saved.totalBatches) !== totalBatches) throw new Error('Batch count does not match the saved import recovery plan');
  }

  const res = await api.asUser().requestJira(route`/jsm/csm/api/v1/customer/profile/bulk`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'Idempotency-Key': idempotencyKey
    },
    body: JSON.stringify({ customerProfiles })
  });
  const task = await jsonResponse(res);
  const createdAt = new Date().toISOString();
  const history = {
    id: idempotencyKey,
    importSessionId,
    batchNumber,
    totalBatches,
    taskId: task.id,
    statusUrl: task.statusUrl,
    count: rows.length,
    rowStart,
    rowEnd,
    createdAt,
    type: 'CUSTOMER_PROFILE_UPSERT'
  };

  await kvs.set(`import:${history.id}`, history);

  if (importSessionId) {
    const sessionKey = `import-session:${importSessionId}`;
    const previous = await kvs.get(sessionKey);
    const priorBatches = Array.isArray(previous?.batches) ? previous.batches : [];
    const withoutCurrent = priorBatches.filter((b) => Number(b.batchNumber) !== batchNumber);
    const batches = [...withoutCurrent, {
      batchNumber,
      count: rows.length,
      taskId: task.id,
      idempotencyKey,
      rowStart,
      rowEnd,
      submittedAt: createdAt
    }].sort((a, b) => Number(a.batchNumber) - Number(b.batchNumber));
    const submittedRows = batches.reduce((sum, b) => sum + Number(b.count || 0), 0);
    const completedBatches = batches.length;
    await kvs.set(sessionKey, {
      ...previous,
      id: importSessionId,
      totalBatches,
      completedBatches,
      submittedRows,
      status: completedBatches >= totalBatches ? 'SUBMITTED' : 'IN_PROGRESS',
      updatedAt: createdAt,
      batches
    });
  }

  return { ...task, importSessionId, batchNumber, totalBatches, idempotencyKey };
});

export const handler = resolver.getDefinitions();