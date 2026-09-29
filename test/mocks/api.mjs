// A fake Jira site. `site.organizations` backs the JSM organisation endpoints; `site.issues` and
// `site.fields` back the issue, field and JQL search endpoints used by Client → Organisation sync.
// Every request is logged with who made it (`user` for asUser, `app` for asApp).
export const site = { organizations: [], requests: [], bulkRequests: [], isAdmin: true, issues: new Map(), fields: [], failIssueIds: new Set() };

export const CLIENT_FIELD = 'customfield_10050';
export const ORG_FIELD = 'customfield_10002';
export const REQUEST_TYPE_FIELD = 'customfield_10010';

export function resetSite(count = 0) {
  site.organizations = Array.from({ length: count }, (_, i) => ({ id: String(i + 1), name: `Org ${i + 1}` }));
  site.requests = [];
  site.bulkRequests = [];
  site.isAdmin = true;
  site.issues = new Map();
  site.failIssueIds = new Set();
  site.fields = [
    { id: 'summary', name: 'Summary', custom: false, schema: { system: 'summary' } },
    { id: CLIENT_FIELD, name: 'Client', custom: true, schema: { custom: 'com.atlassian.jira.plugin.system.customfieldtypes:select' } },
    { id: 'customfield_10060', name: 'Brand code', custom: true, schema: { custom: 'com.atlassian.jira.plugin.system.customfieldtypes:textfield' } },
    { id: 'customfield_10070', name: 'Story points', custom: true, schema: { custom: 'com.atlassian.jira.plugin.system.customfieldtypes:float' } },
    { id: ORG_FIELD, name: 'Organizations', custom: true, schema: { custom: 'com.atlassian.servicedesk:sd-customer-organizations' } },
    { id: REQUEST_TYPE_FIELD, name: 'Request Type', custom: true, schema: { custom: 'com.atlassian.servicedesk:vp-origin' } }
  ];
}

// Adds a ticket. `orgIds` are organisation ids already on it.
export function addIssue({ id, key, project = 'SD', client = null, orgIds = [], requestTypeId = '1' }) {
  site.issues.set(String(id), {
    id: String(id),
    key,
    fields: {
      project: { key: project },
      [CLIENT_FIELD]: client == null ? null : { value: client, id: `opt-${client}` },
      [ORG_FIELD]: orgIds.map((o) => ({ id: Number(o), name: `Org ${o}` })),
      [REQUEST_TYPE_FIELD]: { requestType: { id: requestTypeId } }
    }
  });
}

export const orgIdsOf = (id) => site.issues.get(String(id)).fields[ORG_FIELD].map((o) => String(o.id));

export const route = (strings, ...values) =>
  strings.reduce((out, s, i) => out + s + (i < values.length ? encodeURIComponent(values[i]) : ''), '');

const json = (body, status = 200) => ({ ok: status < 400, status, text: async () => JSON.stringify(body), json: async () => body });

function findIssue(idOrKey) {
  return site.issues.get(String(idOrKey)) || [...site.issues.values()].find((i) => i.key === idOrKey);
}

async function requestJira(as, path, options = {}) {
  const method = options.method || 'GET';
  site.requests.push({ as, method, path });
  if (path.startsWith('/rest/api/3/mypermissions')) {
    return json({ permissions: { ADMINISTER: { havePermission: site.isAdmin } } });
  }
  if (path === '/rest/api/3/field') return json(site.fields);
  if (path.startsWith('/rest/api/3/jql/autocompletedata/suggestions')) {
    return json({ results: [{ value: 'RYR', displayName: 'RYR' }, { value: '"Other Client"', displayName: 'Other Client' }] });
  }
  if (path === '/rest/api/3/search/jql' && method === 'POST') {
    const body = JSON.parse(options.body);
    const projects = [...body.jql.matchAll(/"([A-Z0-9_]+)"/g)].map((m) => m[1]);
    const all = [...site.issues.values()]
      .filter((i) => projects.includes(i.fields.project.key) && i.fields[CLIENT_FIELD] != null)
      .sort((a, b) => a.key.localeCompare(b.key, undefined, { numeric: true }));
    const start = Number(body.nextPageToken || 0);
    const issues = all.slice(start, start + body.maxResults).map((i) => structuredClone(i));
    const next = start + body.maxResults < all.length ? String(start + body.maxResults) : undefined;
    return json({ issues, nextPageToken: next, isLast: !next });
  }
  const issueMatch = path.match(/^\/rest\/api\/3\/issue\/([^/?]+)(\?.*)?$/);
  if (issueMatch) {
    const issue = findIssue(decodeURIComponent(issueMatch[1]));
    if (!issue) return json({ errorMessages: ['Issue does not exist'] }, 404);
    if (method === 'GET') return json(structuredClone(issue));
    if (method === 'PUT') {
      if (site.failIssueIds.has(issue.id)) return json({ errorMessages: ['You do not have permission to edit issues in this project.'] }, 403);
      const { fields } = JSON.parse(options.body);
      if (fields[ORG_FIELD]) issue.fields[ORG_FIELD] = fields[ORG_FIELD].map((id) => ({ id, name: `Org ${id}` }));
      return { ok: true, status: 204, text: async () => '' };
    }
  }
  if (path.startsWith('/rest/servicedeskapi/organization') && method === 'POST') {
    const { name } = JSON.parse(options.body);
    if (site.organizations.some((o) => o.name.toLowerCase() === name.toLowerCase())) {
      return json({ errorMessage: `Duplicate organisation ${name}` }, 400);
    }
    const org = { id: String(site.organizations.length + 1), name };
    site.organizations.push(org);
    return json(org, 201);
  }
  if (path.startsWith('/rest/servicedeskapi/organization?')) {
    const query = new URLSearchParams(path.split('?')[1]);
    const start = Number(query.get('start'));
    const limit = Number(query.get('limit'));
    const values = site.organizations.slice(start, start + limit);
    return json({ start, limit, size: values.length, values, isLastPage: start + limit >= site.organizations.length });
  }
  if (path === '/jsm/csm/api/v1/customer/profile/bulk' && method === 'POST') {
    const { customerProfiles } = JSON.parse(options.body);
    site.bulkRequests.push({ idempotencyKey: options.headers?.['Idempotency-Key'], customerProfiles });
    return json({ id: `task-${site.bulkRequests.length}`, statusUrl: `/tasks/task-${site.bulkRequests.length}` }, 202);
  }
  throw new Error(`Unexpected request ${method} ${path}`);
}

export default {
  asUser: () => ({ requestJira: (path, options) => requestJira('user', path, options) }),
  asApp: () => ({ requestJira: (path, options) => requestJira('app', path, options) })
};
