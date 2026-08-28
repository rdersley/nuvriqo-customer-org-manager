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
    if (email && seen.has(email)) {
      rowIssues.push(`Duplicate email; first appears on row ${seen.get(email)}`);
    } else if (email) {
      seen.set(email, row.rowNumber);
    }
    rowIssues.forEach((message) => issues.push({ row: row.rowNumber, message }));
    return { ...row, email, issues: rowIssues, valid: rowIssues.length === 0 };
  });
  return {
    rows: analysed,
    issues,
    total: analysed.length,
    valid: analysed.filter((row) => row.valid).length,
    invalid: analysed.filter((row) => !row.valid).length
  };
}

function csvCell(value) {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toIssueCsv(issues) {
  return ['Row,Issue', ...(issues || []).map((issue) => `${csvCell(issue.row)},${csvCell(issue.message)}`)].join('\n');
}
