// Jira calls used by Client → Organisation sync. Each function takes a `jira` requester
// (api.asUser() from UI resolvers, api.asApp() from the issue event handler).
import { route } from '@forge/api';
import { kvs, WhereConditions } from '@forge/kvs';
import { evaluate } from './rules.js';

const ORGANISATIONS_TYPE = 'com.atlassian.servicedesk:sd-customer-organizations';
const REQUEST_TYPE_TYPE = 'com.atlassian.servicedesk:vp-origin';
const CLIENT_FIELD_TYPES = new Set([
  'com.atlassian.jira.plugin.system.customfieldtypes:select',
  'com.atlassian.jira.plugin.system.customfieldtypes:textfield'
]);

export const SYNC_CONFIG_KEY = 'sync-config';
export const SYNC_HEALTH_KEY = 'sync-health';
// Correction log entries hold issue keys and organisation ids only; they expire after 90 days.
export const SYNC_LOG_RETENTION = { ttl: { value: 90, unit: 'DAYS' } };

async function json(response, what) {
  const text = await response.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text }; }
  if (!response.ok) {
    const detail = body?.errorMessages?.join(' ') || Object.values(body?.errors || {}).join(' ') || body?.message || `HTTP ${response.status}`;
    const error = new Error(`${what} failed: ${detail}`);
    error.status = response.status;
    throw error;
  }
  return body;
}

export async function getConfig() {
  return (await kvs.get(SYNC_CONFIG_KEY)) || null;
}

// Finds the JSM Organizations and Request Type fields, and lists fields that can act as the Client field.
export async function detectFields(jira) {
  const fields = await json(await jira.requestJira(route`/rest/api/3/field`), 'Reading Jira fields');
  const custom = (fields || []).filter((f) => f?.custom && f?.schema?.custom);
  const find = (type) => custom.find((f) => f.schema.custom === type) || null;
  const organisations = find(ORGANISATIONS_TYPE);
  const requestType = find(REQUEST_TYPE_TYPE);
  return {
    organisationsField: organisations ? { id: organisations.id, name: organisations.name } : null,
    requestTypeField: requestType ? { id: requestType.id, name: requestType.name } : null,
    clientCandidates: custom
      .filter((f) => CLIENT_FIELD_TYPES.has(f.schema.custom))
      .map((f) => ({ id: f.id, name: f.name, type: f.schema.custom.endsWith(':select') ? 'select' : 'text' }))
      .sort((a, b) => a.name.localeCompare(b.name))
  };
}

function syncFieldList(config) {
  return ['project', config.clientFieldId, config.organisationsFieldId, config.requestTypeFieldId].filter(Boolean);
}

// Reduces a Jira issue to what the sync needs.
export function toSyncIssue(issue, config) {
  const fields = issue?.fields || {};
  return {
    id: String(issue?.id ?? ''),
    key: issue?.key || '',
    projectKey: fields.project?.key || '',
    requestTypeId: config.requestTypeFieldId ? String(fields[config.requestTypeFieldId]?.requestType?.id ?? '') : '',
    clientFieldValue: fields[config.clientFieldId] ?? null,
    organisationsFieldValue: fields[config.organisationsFieldId] ?? []
  };
}

export async function fetchSyncIssue(jira, issueIdOrKey, config) {
  const fields = syncFieldList(config).join(',');
  const issue = await json(await jira.requestJira(route`/rest/api/3/issue/${issueIdOrKey}?fields=${fields}`), `Reading ${issueIdOrKey}`);
  return toSyncIssue(issue, config);
}

export async function setOrganisations(jira, issueId, config, organisationIds) {
  const response = await jira.requestJira(route`/rest/api/3/issue/${issueId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ fields: { [config.organisationsFieldId]: organisationIds.map(Number) } })
  });
  if (response.status === 204) return;
  await json(response, `Updating organisations on ${issueId}`);
}

export function evaluateIssue(syncIssue, config) {
  return evaluate({
    clientFieldValue: syncIssue.clientFieldValue,
    organisationsFieldValue: syncIssue.organisationsFieldValue,
    mappings: config.mappings
  });
}

export async function logCorrection(entry) {
  const at = new Date().toISOString();
  await kvs.set(`sync-log:${at}:${entry.issueKey}`, { ...entry, at }, SYNC_LOG_RETENTION);
}

export async function recentCorrections(limit = 100) {
  const result = await kvs.query().where('key', WhereConditions.beginsWith('sync-log:')).limit(Math.min(limit, 100)).getMany();
  return (result.results || []).map((r) => r.value).sort((a, b) => String(b.at).localeCompare(String(a.at)));
}

// JQL for the tickets the sync is responsible for: selected projects, Client set.
export function scopeJql(config) {
  const projects = config.projectKeys.map((k) => `"${k}"`).join(', ');
  const cf = config.clientFieldId.replace('customfield_', '');
  return `project in (${projects}) AND cf[${cf}] IS NOT EMPTY ORDER BY key ASC`;
}

export async function searchPage(jira, config, nextPageToken) {
  const body = { jql: scopeJql(config), fields: syncFieldList(config), maxResults: 100 };
  if (nextPageToken) body.nextPageToken = nextPageToken;
  return json(await jira.requestJira(route`/rest/api/3/search/jql`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body)
  }), 'Searching tickets');
}
