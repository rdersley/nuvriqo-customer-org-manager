export function parseCsvLine(line) {
  const out = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === ',' && !quoted) {
      out.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  out.push(current.trim());
  return out;
}

export function normaliseHeader(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function parseCsv(text) {
  const lines = String(text || '').replace(/^\uFEFF/, '').split(/\r?\n/).filter((line) => line.trim());
  if (!lines.length) return { headers: [], rows: [] };
  const headers = parseCsvLine(lines[0]);
  const rows = lines.slice(1).map((line, index) => {
    const values = parseCsvLine(line);
    const raw = {};
    headers.forEach((header, columnIndex) => { raw[header] = values[columnIndex] || ''; });
    return { rowNumber: index + 2, raw };
  });
  return { headers, rows };
}

export function suggestMapping(headers) {
  const normalized = new Map(headers.map((header) => [normaliseHeader(header), header]));
  const find = (...candidates) => candidates.map((candidate) => normalized.get(candidate)).find(Boolean) || '';
  return {
    email: find('email', 'emailaddress', 'customeremail', 'mail'),
    displayName: find('displayname', 'fullname', 'name', 'customername'),
    organisation: find('organisation', 'organization', 'organisationname', 'organizationname', 'company')
  };
}

export function mapRows(parsedRows, mapping) {
  return parsedRows.map(({ rowNumber, raw }) => ({
    rowNumber,
    email: String(raw[mapping.email] || '').trim(),
    displayName: String(raw[mapping.displayName] || '').trim(),
    organisation: String(raw[mapping.organisation] || '').trim()
  }));
}

export function analyseRows(rows) {
  const seen = new Map();
  const issues = [];
  const analysed = rows.map((row) => {
    const rowIssues = [];
    const email = row.email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(email)) rowIssues.push('Valid email required');
    if (!row.displayName.trim()) rowIssues.push('Display name required');
    if (email && seen.has(email)) rowIssues.push(`Duplicate email; first appears on row ${seen.get(email)}`);
    else if (email) seen.set(email, row.rowNumber);
    rowIssues.forEach((message) => issues.push({ row: row.rowNumber, message }));
    return { ...row, email, issues: rowIssues, valid: rowIssues.length === 0 };
  });
  return { rows: analysed, issues, total: analysed.length, valid: analysed.filter((row) => row.valid).length, invalid: analysed.filter((row) => !row.valid).length };
}

export function planImportRows(rows, existingEmails = [], mode = 'create-new') {
  const existing = new Set(existingEmails.map((email) => String(email || '').trim().toLowerCase()).filter(Boolean));
  const planned = rows.map((row) => {
    if (!row.valid) return { ...row, existsInJira: false, action: 'INVALID', eligible: false };
    const existsInJira = existing.has(String(row.email || '').trim().toLowerCase());
    let action = 'SKIP';
    if (mode === 'upsert') action = existsInJira ? 'UPDATE' : 'CREATE';
    if (mode === 'create-new') action = existsInJira ? 'SKIP' : 'CREATE';
    if (mode === 'update-existing') action = existsInJira ? 'UPDATE' : 'SKIP';
    return { ...row, existsInJira, action, eligible: action === 'CREATE' || action === 'UPDATE' };
  });
  return { rows: planned, create: planned.filter((row) => row.action === 'CREATE').length, update: planned.filter((row) => row.action === 'UPDATE').length, skip: planned.filter((row) => row.action === 'SKIP').length, invalid: planned.filter((row) => row.action === 'INVALID').length, eligible: planned.filter((row) => row.eligible).length };
}

function csvCell(value) {
  const text = String(value ?? '');
  if (!/[",\n\r]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

export function toIssueCsv(issues) {
  return ['Row,Issue', ...(issues || []).map((issue) => `${csvCell(issue.row)},${csvCell(issue.message)}`)].join('\n');
}

export function taskFailures(task) {
  if (!task || typeof task !== 'object') return [];
  const candidates = [task.failures, task.errors, task.result?.failures, task.result?.errors, task.results?.failures];
  return candidates.find(Array.isArray) || [];
}

export function taskStatus(task) {
  return String(task?.status || task?.state || task?.taskStatus || 'Unknown');
}

export function importHistoryCsv(history = []) {
  const rows = ['Submitted,Rows,Status,Failures,Task'];
  for (const item of history) {
    rows.push([
      item.createdAt || '',
      item.count ?? '',
      taskStatus(item.task),
      taskFailures(item.task).length,
      item.taskId || ''
    ].map(csvCell).join(','));
  }
  return rows.join('\n');
}

export function failureReportCsv(history = []) {
  const rows = ['Submitted,Task,Failure'];
  for (const item of history) {
    for (const failure of taskFailures(item.task)) {
      const message = typeof failure === 'string' ? failure : failure?.message || failure?.errorMessage || JSON.stringify(failure);
      rows.push([item.createdAt || '', item.taskId || '', message].map(csvCell).join(','));
    }
  }
  return rows.join('\n');
}
