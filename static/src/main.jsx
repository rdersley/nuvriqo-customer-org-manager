import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { invoke } from '@forge/bridge';
import './styles.css';

const tabs = ['Customers', 'Organisations', 'Import', 'Import History'];

function parseCsv(text) {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean);
  if (!lines.length) return { rows: [], headers: [], missingHeaders: ['Email', 'Full Name/Display Name'] };

  const parseLine = (line) => {
    const out = [];
    let cur = '';
    let q = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        if (q && line[i + 1] === '"') { cur += '"'; i++; }
        else q = !q;
      } else if (c === ',' && !q) {
        out.push(cur.trim());
        cur = '';
      } else cur += c;
    }
    out.push(cur.trim());
    return out;
  };

  const rawHeaders = parseLine(lines[0]);
  const headers = rawHeaders.map((h) => h.toLowerCase().replace(/\s+/g, ''));
  const missingHeaders = [];
  if (!headers.some((h) => h === 'email' || h === 'emailaddress')) missingHeaders.push('Email');
  if (!headers.some((h) => h === 'displayname' || h === 'fullname' || h === 'name')) missingHeaders.push('Full Name/Display Name');

  const rows = lines.slice(1).map((line) => {
    const cols = parseLine(line);
    const obj = {};
    headers.forEach((h, i) => { obj[h] = cols[i] || ''; });
    return {
      email: obj.email || obj.emailaddress || '',
      displayName: obj.displayname || obj.fullname || obj.name || '',
      organisation: obj.organisation || obj.organization || ''
    };
  });

  return { rows, headers: rawHeaders, missingHeaders };
}

function validateRowsLocally(rows) {
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
  const invalidRowCount = new Set(errors.map((e) => e.row)).size;
  return { total: rows.length, valid: Math.max(0, rows.length - invalidRowCount), errors };
}

function App() {
  const [tab, setTab] = useState('Customers');
  const [serviceDesks, setServiceDesks] = useState([]);
  const [desk, setDesk] = useState('');
  const [customers, setCustomers] = useState([]);
  const [orgs, setOrgs] = useState([]);
  const [customerQuery, setCustomerQuery] = useState('');
  const [orgQuery, setOrgQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [rows, setRows] = useState([]);
  const [validation, setValidation] = useState(null);
  const [preview, setPreview] = useState([]);
  const [previewing, setPreviewing] = useState(false);
  const [importStatus, setImportStatus] = useState(null);
  const [history, setHistory] = useState([]);
  const [csvInfo, setCsvInfo] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const r = await invoke('getServiceDesks');
        setServiceDesks(r.values || []);
        if (r.values?.[0]) setDesk(r.values[0].id);
      } catch (e) { setError(e.message); }
    })();
  }, []);

  useEffect(() => { if (tab === 'Organisations') loadOrgs(); }, [tab]);
  useEffect(() => { if (tab === 'Customers' && desk) loadCustomers(); }, [tab, desk]);
  useEffect(() => { if (tab === 'Import History') loadHistory(); }, [tab]);

  async function loadCustomers(query = customerQuery) {
    setLoading(true); setError('');
    try {
      const r = await invoke('getCustomers', { serviceDeskId: desk, query });
      setCustomers(r.values || []);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }

  async function loadOrgs() {
    setLoading(true); setError('');
    try {
      const r = await invoke('getOrganizations');
      setOrgs(r.values || []);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }

  async function loadHistory() {
    try {
      const h = await invoke('getImportHistory');
      const enriched = await Promise.all(h.map(async (x) => {
        try { return { ...x, task: await invoke('getTaskStatus', { taskId: x.taskId }) }; }
        catch { return x; }
      }));
      setHistory(enriched);
    } catch (e) { setError(e.message); }
  }

  async function buildPreview(parsed, validationResult) {
    if (!desk || !parsed.length) { setPreview([]); return; }
    setPreviewing(true); setError('');
    try {
      let currentOrgs = orgs;
      if (!currentOrgs.length) {
        const r = await invoke('getOrganizations');
        currentOrgs = r.values || [];
        setOrgs(currentOrgs);
      }
      const orgNames = new Set(currentOrgs.map((o) => String(o.name || '').toLowerCase()));
      const invalidRows = new Map();
      (validationResult?.errors || []).forEach((e) => {
        const idx = e.row - 2;
        if (!invalidRows.has(idx)) invalidRows.set(idx, []);
        invalidRows.get(idx).push(e.message);
      });

      const results = parsed.map((row, i) => invalidRows.has(i)
        ? { ...row, rowNumber: i + 2, action: 'ERROR', reason: invalidRows.get(i).join('; ') }
        : null);

      const validIndexes = [];
      for (let i = 0; i < parsed.length; i++) if (!invalidRows.has(i)) validIndexes.push(i);

      for (const i of validIndexes) {
        const row = parsed[i];
        try {
          const found = await invoke('getCustomers', { serviceDeskId: desk, query: String(row.email || '').trim() });
          const exact = (found.values || []).find((c) => String(c.emailAddress || '').toLowerCase() === String(row.email || '').trim().toLowerCase());
          const orgNote = row.organisation && !orgNames.has(String(row.organisation).toLowerCase())
            ? `Organisation “${row.organisation}” will be created.` : '';
          results[i] = !exact
            ? { ...row, rowNumber: i + 2, action: 'CREATE', reason: orgNote || 'New customer.' }
            : String(exact.displayName || '').trim().toLowerCase() === String(row.displayName || '').trim().toLowerCase()
              ? { ...row, rowNumber: i + 2, action: 'SKIP', reason: orgNote ? `Customer already matches. ${orgNote}` : 'Customer already matches Jira.' }
              : { ...row, rowNumber: i + 2, action: 'UPDATE', reason: `Existing Jira customer: ${exact.displayName || exact.emailAddress}. ${orgNote}`.trim() };
        } catch (e) {
          results[i] = { ...row, rowNumber: i + 2, action: 'ERROR', reason: `Jira lookup failed: ${e.message}` };
        }
      }
      setPreview(results.filter(Boolean));
    } catch (e) {
      setError(`Preview failed: ${e.message}`);
      setPreview([]);
    } finally { setPreviewing(false); }
  }

  async function onFile(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    setError('');
    const parsed = parseCsv(await f.text());
    setCsvInfo({ fileName: f.name, headers: parsed.headers, missingHeaders: parsed.missingHeaders });
    setRows(parsed.rows);
    setImportStatus(null);

    if (parsed.missingHeaders.length) {
      const reason = `Required CSV column missing: ${parsed.missingHeaders.join(', ')}`;
      setValidation({ valid: 0, errors: parsed.rows.map((_, i) => ({ row: i + 2, message: reason })) });
      setPreview(parsed.rows.map((r, i) => ({ ...r, rowNumber: i + 2, action: 'ERROR', reason })));
      return;
    }

    try {
      if (parsed.rows.length > 500) {
        const result = validateRowsLocally(parsed.rows);
        setValidation(result);
        const invalidRows = new Map();
        (result.errors || []).forEach((err) => {
          const idx = err.row - 2;
          if (!invalidRows.has(idx)) invalidRows.set(idx, []);
          invalidRows.get(idx).push(err.message);
        });
        setPreview(parsed.rows.map((row, i) => invalidRows.has(i)
          ? { ...row, rowNumber: i + 2, action: 'ERROR', reason: invalidRows.get(i).join('; ') }
          : { ...row, rowNumber: i + 2, action: 'PENDING', reason: 'Large import detected. Jira comparison is deferred to the server-side batch preview workflow.' }));
        return;
      }
      const result = await invoke('validateImport', { rows: parsed.rows });
      setValidation(result);
      await buildPreview(parsed.rows, result);
    } catch (err) {
      setError(`CSV validation failed: ${err.message}`);
      setPreview([]);
    }
  }

  async function runImport() {
    setLoading(true); setError('');
    try {
      if (preview.some((r) => r.action === 'PENDING')) {
        throw new Error('Valid rows are still waiting for Jira comparison. Error rows will be excluded automatically, but unchecked rows cannot be submitted yet.');
      }
      const actionable = preview.filter((r) => r.action === 'CREATE' || r.action === 'UPDATE');
      if (!actionable.length) throw new Error('There are no Create or Update rows to import.');

      const names = [...new Set(actionable.map((r) => r.organisation).filter(Boolean))];
      const prepared = await invoke('prepareImportOrganizations', { names });
      const allOrgs = [...orgs, ...(prepared.organizations || [])];
      const orgMap = new Map(allOrgs.map((o) => [String(o.name).toLowerCase(), o.id]));
      const mapped = actionable.map((r) => ({
        ...r,
        organizationIds: r.organisation && orgMap.has(r.organisation.toLowerCase()) ? [orgMap.get(r.organisation.toLowerCase())] : []
      }));
      const chunks = [];
      for (let i = 0; i < mapped.length; i += 100) chunks.push(mapped.slice(i, i + 100));
      const tasks = [];
      for (const chunk of chunks) tasks.push(await invoke('bulkUpsertCustomers', { rows: chunk }));
      setImportStatus({
        submitted: mapped.length,
        tasks,
        createdOrganizations: (prepared.created || []).length,
        skipped: preview.filter((r) => r.action === 'SKIP').length,
        excludedErrors: preview.filter((r) => r.action === 'ERROR').length
      });
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }

  const summary = useMemo(() => ({ total: rows.length, valid: validation?.valid || 0, errors: validation?.errors?.length || 0 }), [rows, validation]);
  const previewSummary = useMemo(() => preview.reduce((a, r) => {
    a[r.action] = (a[r.action] || 0) + 1;
    return a;
  }, { CREATE: 0, UPDATE: 0, SKIP: 0, ERROR: 0, PENDING: 0 }), [preview]);
  const filteredOrgs = useMemo(() => {
    const q = orgQuery.trim().toLowerCase();
    return q ? orgs.filter((o) => String(o.name || '').toLowerCase().includes(q)) : orgs;
  }, [orgs, orgQuery]);
  const errorReasons = useMemo(() => {
    const m = new Map();
    preview.filter((r) => r.action === 'ERROR').forEach((r) => m.set(r.reason, (m.get(r.reason) || 0) + 1));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [preview]);

  return <div className="app">
    <aside>
      <div className="brand">Nuvriqo</div>
      <div className="product">Customer & Organisation Manager</div>
      {tabs.map((t) => <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>{t}</button>)}
    </aside>
    <main>
      <header>
        <div><h1>{tab}</h1><p>Bulk customer and organisation administration for Jira Service Management.</p></div>
        {tab === 'Customers' && <select value={desk} onChange={(e) => setDesk(e.target.value)}>{serviceDesks.map((d) => <option key={d.id} value={d.id}>{d.projectName}</option>)}</select>}
      </header>
      {error && <div className="error">{error}</div>}

      {tab === 'Customers' && <section className="card">
        <div className="toolbar"><input value={customerQuery} onChange={(e) => setCustomerQuery(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') loadCustomers(e.currentTarget.value); }} placeholder="Search customers by name or email"/><button onClick={() => loadCustomers(customerQuery)}>Search</button><button onClick={() => { setCustomerQuery(''); loadCustomers(''); }}>Reset</button></div>
        <table><thead><tr><th>Name</th><th>Email</th><th>Account</th></tr></thead><tbody>{customers.map((c) => <tr key={c.accountId || c.key}><td>{c.displayName}</td><td>{c.emailAddress || '—'}</td><td className="muted">{c.accountId || c.key}</td></tr>)}</tbody></table>
        {!loading && !customers.length && <div className="empty">No customers returned for this service project.</div>}
      </section>}

      {tab === 'Organisations' && <section className="card">
        <div className="toolbar"><input value={orgQuery} onChange={(e) => setOrgQuery(e.target.value)} placeholder="Search organisations"/><button onClick={loadOrgs}>Refresh</button></div>
        <div className="grid">{filteredOrgs.map((o) => <div className="org" key={o.id}><strong>{o.name}</strong><span>ID {o.id}</span></div>)}</div>
        {!loading && !filteredOrgs.length && <div className="empty">No organisations match your search.</div>}
      </section>}

      {tab === 'Import' && <>
        <section className="card upload"><h2>Advanced customer import</h2><p>CSV headers: Email, Full Name/Display Name, Organisation. The preview checks Jira before anything is changed.</p><input type="file" accept=".csv,text/csv" onChange={onFile}/></section>

        {previewSummary.ERROR > 0 && <section className="card error">
          <h3>{previewSummary.ERROR.toLocaleString()} row{previewSummary.ERROR === 1 ? ' will' : 's will'} be excluded from this import</h3>
          {csvInfo?.missingHeaders?.length > 0 && <p><strong>CSV format problem:</strong> Missing required column{csvInfo.missingHeaders.length > 1 ? 's' : ''}: <strong>{csvInfo.missingHeaders.join(', ')}</strong>. Detected headers: {csvInfo.headers.length ? csvInfo.headers.join(', ') : 'none'}.</p>}
          {csvInfo?.missingHeaders?.length === 0 && <p>The valid rows can continue. These error rows will not be sent to Jira and can be corrected and imported separately later.</p>}
          {errorReasons.slice(0, 5).map(([reason, count]) => <div key={reason}><strong>{count.toLocaleString()} row{count === 1 ? '' : 's'}:</strong> {reason}</div>)}
        </section>}

        {previewSummary.PENDING > 0 && <section className="card">
          <h3>Large import safety check</h3>
          <p><strong>{previewSummary.PENDING.toLocaleString()} valid rows will continue.</strong>{previewSummary.ERROR > 0 ? ` ${previewSummary.ERROR.toLocaleString()} error row${previewSummary.ERROR === 1 ? '' : 's'} will be excluded automatically.` : ''}</p>
          <p>No per-row Jira lookups were started because this file is too large for the interactive preview path. Import remains disabled only until the valid rows complete the server-side Jira comparison.</p>
        </section>}

        {rows.length > 0 && <section className="stats"><div><b>{summary.total}</b><span>Rows</span></div><div><b>{previewSummary.CREATE}</b><span>Create</span></div><div><b>{previewSummary.UPDATE}</b><span>Update</span></div><div><b>{previewSummary.SKIP}</b><span>Skip</span></div><div><b>{previewSummary.ERROR}</b><span>Excluded</span></div></section>}

        {previewing && <section className="card"><strong>Checking existing Jira customers and organisations…</strong></section>}

        {preview.length > 0 && <section className="card"><h3>Import preview</h3><table><thead><tr><th>Row</th><th>Action</th><th>Name</th><th>Email</th><th>Organisation</th><th>Reason</th></tr></thead><tbody>{preview.slice(0, 500).map((r, i) => <tr key={`${r.email}-${i}`}><td>{r.rowNumber}</td><td><strong>{r.action}</strong></td><td>{r.displayName || '—'}</td><td>{r.email || '—'}</td><td>{r.organisation || '—'}</td><td>{r.reason}</td></tr>)}</tbody></table>{preview.length > 500 && <div className="empty">Showing the first 500 of {preview.length.toLocaleString()} preview rows.</div>}</section>}

        {rows.length > 0 && <button className="primary" disabled={loading || previewing || previewSummary.PENDING > 0 || (previewSummary.CREATE + previewSummary.UPDATE === 0)} onClick={runImport}>{loading ? 'Submitting…' : `Import ${previewSummary.CREATE + previewSummary.UPDATE} customer changes${previewSummary.ERROR ? ` (exclude ${previewSummary.ERROR} errors)` : ''}`}</button>}

        {importStatus && <div className="success">Submitted {importStatus.submitted} customer changes in {importStatus.tasks.length} bulk task(s). Skipped {importStatus.skipped} unchanged row(s). Excluded {importStatus.excludedErrors} error row(s). Created {importStatus.createdOrganizations} missing organisation(s).</div>}
      </>}

      {tab === 'Import History' && <section className="card"><div className="toolbar"><button onClick={loadHistory}>Refresh status</button></div><table><thead><tr><th>Submitted</th><th>Rows</th><th>Status</th><th>Failures</th><th>Task</th></tr></thead><tbody>{history.map((h) => <tr key={h.id}><td>{new Date(h.createdAt).toLocaleString()}</td><td>{h.count}</td><td>{h.task?.status || 'Unknown'}</td><td>{h.task?.failures?.length || 0}</td><td className="muted">{h.taskId}</td></tr>)}</tbody></table>{!history.length && <div className="empty">No imports recorded yet.</div>}</section>}
    </main>
  </div>;
}

createRoot(document.getElementById('root')).render(<App/>);
