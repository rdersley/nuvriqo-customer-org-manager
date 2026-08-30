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

resolver.define('health', async () => ({ ok: true, version: '0.1.3' }));

secureDefine('getServiceDesks', async () => {
  const res = await api.asUser().requestJira(route`/rest/servicedeskapi/servicedesk?limit=100`);
  return jsonResponse(res);
});

secureDefine('getCustomers', async ({ payload }) => {
  const serviceDeskId = String(payload?.serviceDeskId || '');
  const query = String(payload?.query || '');
  const start = Number(payload?.start || 0);
  if (!serviceDeskId) throw new Error('serviceDeskId is required');
  const res = await api.asUser().requestJira(
    route`/rest/servicedeskapi/servicedesk/${serviceDeskId}/customer?query=${query}&start=${start}&limit=50`
  );
  return jsonResponse(res);
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
  const result = await kvs.query().where('key', WhereConditions.beginsWith('import:')).limit(50).getMany();
  return (result.results || []).map(r => r.value).sort((a,b) => String(b.createdAt).localeCompare(String(a.createdAt)));
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

  const idempotencyKey = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
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
  const history = {
    id: idempotencyKey,
    taskId: task.id,
    statusUrl: task.statusUrl,
    count: rows.length,
    createdAt: new Date().toISOString(),
    type: 'CUSTOMER_PROFILE_UPSERT'
  };
  await kvs.set(`import:${history.createdAt}:${history.id}`, history);
  return task;
});

export const handler = resolver.getDefinitions();
