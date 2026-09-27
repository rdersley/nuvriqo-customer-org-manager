// A fake Jira site: `site.organizations` backs the JSM organisation endpoints; every request is logged.
export const site = { organizations: [], requests: [], isAdmin: true };

export function resetSite(count = 0) {
  site.organizations = Array.from({ length: count }, (_, i) => ({ id: String(i + 1), name: `Org ${i + 1}` }));
  site.requests = [];
  site.isAdmin = true;
}

export const route = (strings, ...values) =>
  strings.reduce((out, s, i) => out + s + (i < values.length ? encodeURIComponent(values[i]) : ''), '');

const json = (body, status = 200) => ({ ok: status < 400, status, text: async () => JSON.stringify(body) });

async function requestJira(path, options = {}) {
  const method = options.method || 'GET';
  site.requests.push({ method, path });
  if (path.startsWith('/rest/api/3/mypermissions')) {
    return json({ permissions: { ADMINISTER: { havePermission: site.isAdmin } } });
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
  throw new Error(`Unexpected request ${method} ${path}`);
}

export default { asUser: () => ({ requestJira }), asApp: () => ({ requestJira }) };
