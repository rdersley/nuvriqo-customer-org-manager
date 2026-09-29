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

const organisationKey = (name) => String(name || '').trim().toLowerCase();

// Pages through every Jira organisation (in resumable resolver calls) looking for the given names.
// Throws rather than returning a partial answer, so callers never treat an unscanned org as missing.
async function lookupOrganisations(names) {
  const byKey = new Map();
  (names || []).map((n) => String(n || '').trim()).filter(Boolean)
    .forEach((n) => { if (!byKey.has(organisationKey(n))) byKey.set(organisationKey(n), n); });
  const wanted = [...byKey.values()];
  const found = new Map();
  let remaining = wanted;
  let start = 0;
  for (let calls = 0; remaining.length; calls += 1) {
    if (calls >= 500) throw new Error('Organisation lookup safety limit reached before Jira reported the final page.');
    const r = await invoke('getImportOrganizations', { names: remaining, start });
    (r.organizations || []).forEach((o) => found.set(organisationKey(o.name), o));
    remaining = remaining.filter((n) => !found.has(organisationKey(n)));
    if (r.complete) break;
    const nextStart = Number(r.nextStart);
    if (remaining.length && (!Number.isFinite(nextStart) || nextStart <= start)) {
      throw new Error('Jira organisation pagination stopped before the lookup was complete.');
    }
    start = nextStart;
  }
  return { found, missing: remaining };
}

// Finds existing organisations and creates only those a complete scan proved are missing.
async function prepareOrganisations(names) {
  const { found, missing } = await lookupOrganisations(names);
  const created = [];
  for (let i = 0; i < missing.length; i += 20) {
    const r = await invoke('createImportOrganizations', { names: missing.slice(i, i + 20) });
    created.push(...(r.created || []));
  }
  return { organizations: [...found.values(), ...created], created };
}

// Finds or creates every organisation the rows name, then returns the rows with organizationIds attached.
async function attachOrganisationIds(rows) {
  const prepared = await prepareOrganisations(rows.map((r) => r.organisation));
  const idByKey = new Map(prepared.organizations.map((o) => [organisationKey(o.name), o.id]));
  return {
    rows: rows.map((r) => {
      const key = organisationKey(r.organisation);
      return { ...r, organizationIds: idByKey.has(key) ? [idByKey.get(key)] : [] };
    }),
    created: prepared.created
  };
}

function invalidRowMap(validationResult) {
  const invalidRows = new Map();
  (validationResult?.errors || []).forEach((e) => {
    const idx = e.row - 2;
    if (!invalidRows.has(idx)) invalidRows.set(idx, []);
    invalidRows.get(idx).push(e.message);
  });
  return invalidRows;
}

function makeSessionId() {
  return globalThis.crypto?.randomUUID?.() || `import-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function sha256Hex(text) {
  if (!globalThis.crypto?.subtle) throw new Error('This browser cannot create the secure import fingerprint required for recovery.');
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
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
  const [comparisonProgress, setComparisonProgress] = useState(null);
  const [importStatus, setImportStatus] = useState(null);
  const [importProgress, setImportProgress] = useState(null);
  const [resumePlan, setResumePlan] = useState(null);
  const [history, setHistory] = useState([]);
  const [importSessions, setImportSessions] = useState([]);
  const [csvInfo, setCsvInfo] = useState(null);
  const [fileFingerprint, setFileFingerprint] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const r = await invoke('getServiceDesks');
        setServiceDesks(r.values || []);
        if (r.values?.[0]) setDesk(String(r.values[0].id));
      } catch (e) { setError(e.message); }
    })();
  }, []);

  useEffect(() => { if (tab === 'Organisations') loadOrgs(); }, [tab]);
  useEffect(() => { if (tab === 'Customers' && desk) loadCustomers(); }, [tab, desk]);
  useEffect(() => { if (tab === 'Import History') loadHistory(); }, [tab]);

  async function ensureDeskId() {
    if (desk) return String(desk);
    const existing = serviceDesks?.[0]?.id;
    if (existing !== undefined && existing !== null && String(existing)) {
      const id = String(existing);
      setDesk(id);
      return id;
    }
    const r = await invoke('getServiceDesks');
    const desks = r.values || [];
    setServiceDesks(desks);
    const id = String(desks?.[0]?.id || '');
    if (!id) throw new Error('No Jira service projects are available.');
    setDesk(id);
    return id;
  }

  async function loadCustomers(query = customerQuery) {
    setLoading(true); setError('');
    try {
      const serviceDeskId = await ensureDeskId();
      const r = await invoke('getCustomers', { serviceDeskId, query });
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
      const [h, sessions] = await Promise.all([invoke('getImportHistory'), invoke('getImportSessions')]);
      const enriched = await Promise.all(h.map(async (x) => {
        try { return { ...x, task: await invoke('getTaskStatus', { taskId: x.taskId }) }; }
        catch { return x; }
      }));
      setHistory(enriched);
      setImportSessions(sessions || []);
    } catch (e) { setError(e.message); }
  }

  async function buildPreview(parsed, validationResult) {
    if (!parsed.length) { setPreview([]); return; }
    setPreviewing(true); setError('');
    try {
      const serviceDeskId = await ensureDeskId();
      const { found: existingOrgs } = await lookupOrganisations(parsed.map((row) => row.organisation));
      const orgNames = new Set(existingOrgs.keys());
      const invalidRows = invalidRowMap(validationResult);
      const results = parsed.map((row, i) => invalidRows.has(i)
        ? { ...row, rowNumber: i + 2, action: 'ERROR', reason: invalidRows.get(i).join('; ') }
        : null);

      const validIndexes = [];
      for (let i = 0; i < parsed.length; i++) if (!invalidRows.has(i)) validIndexes.push(i);

      for (const i of validIndexes) {
        const row = parsed[i];
        try {
          const found = await invoke('getCustomers', { serviceDeskId, query: String(row.email || '').trim() });
          const exact = (found.values || []).find((c) => String(c.emailAddress || '').toLowerCase() === String(row.email || '').trim().toLowerCase());
          const orgNote = row.organisation && !orgNames.has(organisationKey(row.organisation))
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

  async function buildLargePreview(parsed, validationResult) {
    const invalidRows = invalidRowMap(validationResult);
    const pendingPreview = parsed.map((row, i) => invalidRows.has(i)
      ? { ...row, rowNumber: i + 2, action: 'ERROR', reason: invalidRows.get(i).join('; ') }
      : { ...row, rowNumber: i + 2, action: 'PENDING', reason: 'Waiting for batched Jira comparison.' });
    setPreview(pendingPreview);

    setPreviewing(true);
    setComparisonProgress({ complete: false, customersScanned: 0, batches: 0 });
    setError('');
    try {
      const serviceDeskId = await ensureDeskId();
      const byEmail = new Map();
      let start = 0;
      let complete = false;
      let batches = 0;

      while (!complete) {
        if (batches >= 200) throw new Error('Customer index safety limit reached before Jira reported the final page.');
        const batch = await invoke('getCustomerIndexBatch', { serviceDeskId, start, pages: 10 });
        (batch.customers || []).forEach((customer) => {
          const email = String(customer.emailAddress || '').trim().toLowerCase();
          if (email) byEmail.set(email, customer);
        });
        batches += 1;
        complete = Boolean(batch.complete);
        const nextStart = Number(batch.nextStart || 0);
        if (!complete && (!Number.isFinite(nextStart) || nextStart <= start)) {
          throw new Error('Jira customer pagination stopped before the comparison was complete.');
        }
        start = nextStart;
        setComparisonProgress({ complete: false, customersScanned: byEmail.size, batches });
      }

      const results = parsed.map((row, i) => {
        if (invalidRows.has(i)) return { ...row, rowNumber: i + 2, action: 'ERROR', reason: invalidRows.get(i).join('; ') };
        const email = String(row.email || '').trim().toLowerCase();
        const exact = byEmail.get(email);
        if (!exact) return { ...row, rowNumber: i + 2, action: 'CREATE', reason: 'New customer.' };
        if (String(exact.displayName || '').trim().toLowerCase() === String(row.displayName || '').trim().toLowerCase()) {
          return { ...row, rowNumber: i + 2, action: 'SKIP', reason: 'Customer already matches Jira.' };
        }
        return { ...row, rowNumber: i + 2, action: 'UPDATE', reason: `Existing Jira customer: ${exact.displayName || exact.emailAddress}.` };
      });
      setPreview(results);
      setComparisonProgress({ complete: true, customersScanned: byEmail.size, batches });
    } catch (e) {
      setError(`Large import comparison failed: ${e.message}`);
      setComparisonProgress((current) => ({ ...(current || {}), failed: true }));
    } finally {
      setPreviewing(false);
    }
  }

  async function restoreRecoveryForFile(parsedRows, fingerprint) {
    const serviceDeskId = await ensureDeskId();
    const sessions = await invoke('getImportSessions');
    setImportSessions(sessions || []);
    const session = (sessions || []).find((s) => s.fingerprint === fingerprint && String(s.serviceDeskId) === serviceDeskId && s.status !== 'SUBMITTED');
    if (!session) return;

    const rowNumbers = Array.isArray(session.actionableRowNumbers) ? session.actionableRowNumbers.map(Number) : [];
    if (!rowNumbers.length || Number(session.totalRows) !== rowNumbers.length) {
      throw new Error('A saved import session matched this file, but its recovery row plan is incomplete. Start a new import rather than guessing.');
    }

    const recoveryRows = rowNumbers.map((rowNumber) => {
      const row = parsedRows[rowNumber - 2];
      if (!row) throw new Error(`Saved recovery row ${rowNumber} is not present in this CSV.`);
      return { ...row, rowNumber };
    });
    // Recovery discovery must not change Jira: organisations are resolved (and created) only when Resume is clicked.
    const chunks = [];
    for (let i = 0; i < recoveryRows.length; i += 100) chunks.push(recoveryRows.slice(i, i + 100));
    if (chunks.length !== Number(session.totalBatches)) throw new Error('Saved recovery batch count does not match this CSV. Resume has been blocked.');

    const completed = new Set((session.batches || []).map((b) => Number(b.batchNumber)));
    let nextBatchIndex = 0;
    while (nextBatchIndex < chunks.length && completed.has(nextBatchIndex + 1)) nextBatchIndex += 1;
    if (nextBatchIndex >= chunks.length) return;
    const tasks = (session.batches || []).filter((b) => Number(b.batchNumber) <= nextBatchIndex).map((b) => ({ ...b, submittedRows: Number(b.count || 0) }));
    const plan = { sessionId: session.id, totalRows: recoveryRows.length, chunks, nextBatchIndex, tasks, recovered: true, organisationsPending: true };
    setResumePlan(plan);
    setImportProgress({
      state: 'recovered',
      sessionId: session.id,
      totalRows: recoveryRows.length,
      totalBatches: chunks.length,
      completedBatches: nextBatchIndex,
      completedRows: Number(session.submittedRows || 0),
      currentBatch: nextBatchIndex + 1,
      attempt: 1
    });
  }

  async function onFile(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    setError('');
    setComparisonProgress(null);
    setImportProgress(null);
    setResumePlan(null);
    const fileText = await f.text();
    const fingerprint = await sha256Hex(fileText);
    setFileFingerprint(fingerprint);
    const parsed = parseCsv(fileText);
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
        await buildLargePreview(parsed.rows, result);
      } else {
        const result = await invoke('validateImport', { rows: parsed.rows });
        setValidation(result);
        await buildPreview(parsed.rows, result);
      }
      await restoreRecoveryForFile(parsed.rows, fingerprint);
    } catch (err) {
      setError(`CSV validation or recovery check failed: ${err.message}`);
    }
  }

  async function submitBatchWithRetry(plan, batchIndex, existingTasks) {
    const chunk = plan.chunks[batchIndex];
    const batchNumber = batchIndex + 1;
    const idempotencyKey = `${plan.sessionId}-batch-${batchNumber}`;
    let lastError;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      setImportProgress({
        state: 'running',
        sessionId: plan.sessionId,
        totalRows: plan.totalRows,
        totalBatches: plan.chunks.length,
        completedBatches: batchIndex,
        completedRows: Math.min(batchIndex * 100, plan.totalRows),
        currentBatch: batchNumber,
        attempt
      });
      try {
        return await invoke('bulkUpsertCustomers', {
          rows: chunk,
          importSessionId: plan.sessionId,
          batchNumber,
          totalBatches: plan.chunks.length,
          idempotencyKey,
          rowStart: chunk[0]?.rowNumber || null,
          rowEnd: chunk[chunk.length - 1]?.rowNumber || null
        });
      } catch (e) {
        lastError = e;
        if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 1200));
      }
    }
    const completedRows = existingTasks.reduce((sum, task) => sum + Number(task.submittedRows || 0), 0);
    const failedPlan = { ...plan, nextBatchIndex: batchIndex, tasks: existingTasks };
    setResumePlan(failedPlan);
    setImportProgress({
      state: 'failed',
      sessionId: plan.sessionId,
      totalRows: plan.totalRows,
      totalBatches: plan.chunks.length,
      completedBatches: existingTasks.length,
      completedRows,
      currentBatch: batchNumber,
      attempt: 3,
      error: lastError?.message || 'Batch submission failed'
    });
    throw new Error(`Batch ${batchNumber} of ${plan.chunks.length} failed after 3 attempts. ${lastError?.message || ''}`.trim());
  }

  async function submitPlan(plan, startBatchIndex = 0, initialTasks = []) {
    const tasks = [...initialTasks];
    for (let i = startBatchIndex; i < plan.chunks.length; i += 1) {
      const task = await submitBatchWithRetry(plan, i, tasks);
      tasks.push({ ...task, submittedRows: plan.chunks[i].length });
      const completedRows = tasks.reduce((sum, item) => sum + Number(item.submittedRows || 0), 0);
      setImportProgress({
        state: i === plan.chunks.length - 1 ? 'complete' : 'running',
        sessionId: plan.sessionId,
        totalRows: plan.totalRows,
        totalBatches: plan.chunks.length,
        completedBatches: i + 1,
        completedRows,
        currentBatch: i + 1,
        attempt: 1
      });
    }
    setResumePlan(null);
    return tasks;
  }

  async function runImport() {
    setLoading(true); setError(''); setImportStatus(null); setResumePlan(null);
    try {
      if (preview.some((r) => r.action === 'PENDING')) {
        throw new Error('Valid rows are still waiting for Jira comparison. Error rows will be excluded automatically, but unchecked rows cannot be submitted yet.');
      }
      const actionable = preview.filter((r) => r.action === 'CREATE' || r.action === 'UPDATE');
      if (!actionable.length) throw new Error('There are no Create or Update rows to import.');
      if (!fileFingerprint) throw new Error('Import fingerprint is missing. Re-select the CSV before importing.');

      setImportProgress({ state: 'preparing', totalRows: actionable.length, totalBatches: Math.ceil(actionable.length / 100), completedBatches: 0, completedRows: 0 });
      const serviceDeskId = await ensureDeskId();
      const { rows: mapped, created } = await attachOrganisationIds(actionable);
      const chunks = [];
      for (let i = 0; i < mapped.length; i += 100) chunks.push(mapped.slice(i, i + 100));
      const sessionId = makeSessionId();
      const plan = { sessionId, totalRows: mapped.length, chunks };
      await invoke('startImportSession', {
        id: sessionId,
        fingerprint: fileFingerprint,
        serviceDeskId,
        fileName: csvInfo?.fileName || '',
        actionableRowNumbers: mapped.map((r) => r.rowNumber),
        totalRows: mapped.length,
        totalBatches: chunks.length,
        skipped: preview.filter((r) => r.action === 'SKIP').length,
        excludedErrors: preview.filter((r) => r.action === 'ERROR').length
      });
      const tasks = await submitPlan(plan);
      setImportStatus({
        submitted: mapped.length,
        tasks,
        createdOrganizations: created.length,
        skipped: preview.filter((r) => r.action === 'SKIP').length,
        excludedErrors: preview.filter((r) => r.action === 'ERROR').length,
        sessionId: plan.sessionId
      });
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }

  async function resumeImport() {
    if (!resumePlan) return;
    setLoading(true); setError('');
    try {
      let plan = resumePlan;
      let createdOrganizations = 0;
      if (plan.organisationsPending) {
        // Only the batches still to submit need organisation ids; completed batches are left untouched.
        const remaining = plan.chunks.slice(plan.nextBatchIndex);
        const { rows: mapped, created } = await attachOrganisationIds(remaining.flat());
        const remapped = [];
        let offset = 0;
        for (const chunk of remaining) { remapped.push(mapped.slice(offset, offset + chunk.length)); offset += chunk.length; }
        plan = { ...plan, chunks: [...plan.chunks.slice(0, plan.nextBatchIndex), ...remapped], organisationsPending: false };
        createdOrganizations = created.length;
      }
      const tasks = await submitPlan(plan, plan.nextBatchIndex, plan.tasks || []);
      setImportStatus({
        submitted: plan.totalRows,
        tasks,
        createdOrganizations,
        skipped: preview.filter((r) => r.action === 'SKIP').length,
        excludedErrors: preview.filter((r) => r.action === 'ERROR').length,
        sessionId: plan.sessionId,
        resumed: true
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
        {(tab === 'Customers' || tab === 'Import') && <select value={desk} onChange={(e) => setDesk(e.target.value)}>{serviceDesks.map((d) => <option key={d.id} value={d.id}>{d.projectName}</option>)}</select>}
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

        {comparisonProgress && <section className="card">
          <h3>{comparisonProgress.complete ? 'Jira comparison complete' : 'Large import Jira comparison'}</h3>
          {comparisonProgress.complete
            ? <p><strong>All valid CSV rows have now been checked against Jira.</strong> Scanned {comparisonProgress.customersScanned.toLocaleString()} existing customer email{comparisonProgress.customersScanned === 1 ? '' : 's'} in {comparisonProgress.batches} controlled batch{comparisonProgress.batches === 1 ? '' : 'es'}.</p>
            : <p>Building a safe customer index from Jira in controlled batches… {comparisonProgress.customersScanned.toLocaleString()} existing customer email{comparisonProgress.customersScanned === 1 ? '' : 's'} scanned so far.</p>}
        </section>}

        {previewSummary.PENDING > 0 && !comparisonProgress?.complete && <section className="card">
          <h3>Large import safety check</h3>
          <p><strong>{previewSummary.PENDING.toLocaleString()} valid rows are being checked.</strong>{previewSummary.ERROR > 0 ? ` ${previewSummary.ERROR.toLocaleString()} error row${previewSummary.ERROR === 1 ? '' : 's'} will be excluded automatically.` : ''}</p>
          <p>Import stays disabled until the batched Jira comparison is complete, so no unchecked rows can be submitted.</p>
        </section>}

        {rows.length > 0 && <section className="stats"><div><b>{summary.total}</b><span>Rows</span></div><div><b>{previewSummary.CREATE}</b><span>Create</span></div><div><b>{previewSummary.UPDATE}</b><span>Update</span></div><div><b>{previewSummary.SKIP}</b><span>Skip</span></div><div><b>{previewSummary.ERROR}</b><span>Excluded</span></div></section>}

        {previewing && <section className="card"><strong>Checking existing Jira customers and organisations…</strong></section>}

        {preview.length > 0 && <section className="card"><h3>Import preview</h3><table><thead><tr><th>Row</th><th>Action</th><th>Name</th><th>Email</th><th>Organisation</th><th>Reason</th></tr></thead><tbody>{preview.slice(0, 500).map((r, i) => <tr key={`${r.email}-${i}`}><td>{r.rowNumber}</td><td><strong>{r.action}</strong></td><td>{r.displayName || '—'}</td><td>{r.email || '—'}</td><td>{r.organisation || '—'}</td><td>{r.reason}</td></tr>)}</tbody></table>{preview.length > 500 && <div className="empty">Showing the first 500 of {preview.length.toLocaleString()} preview rows.</div>}</section>}

        {importProgress && <section className={`card ${importProgress.state === 'failed' ? 'error' : ''}`}>
          <h3>{importProgress.state === 'complete' ? 'Import batches submitted' : importProgress.state === 'failed' ? 'Import paused safely' : importProgress.state === 'recovered' ? 'Saved import recovered' : importProgress.state === 'preparing' ? 'Preparing import' : 'Submitting import batches'}</h3>
          {importProgress.state === 'preparing' && <p>Preparing organisations and {importProgress.totalRows.toLocaleString()} customer changes for controlled submission.</p>}
          {importProgress.state === 'recovered' && <p><strong>This exact CSV matches a saved interrupted import.</strong> {importProgress.completedRows.toLocaleString()} of {importProgress.totalRows.toLocaleString()} rows were already submitted. Recovery will continue from batch {importProgress.currentBatch} of {importProgress.totalBatches} using the original saved row plan.</p>}
          {importProgress.state !== 'preparing' && importProgress.state !== 'recovered' && <p><strong>{importProgress.completedRows.toLocaleString()} of {importProgress.totalRows.toLocaleString()} rows submitted</strong> across {importProgress.completedBatches} of {importProgress.totalBatches} batch{importProgress.totalBatches === 1 ? '' : 'es'}.</p>}
          {importProgress.state === 'running' && <p>Currently processing batch {importProgress.currentBatch} of {importProgress.totalBatches}{importProgress.attempt > 1 ? ` — retry ${importProgress.attempt} of 3` : ''}.</p>}
          {importProgress.state === 'failed' && <p>Batch {importProgress.currentBatch} failed after three attempts. Earlier batches remain recorded and the failed batch can be retried with the same idempotency key, so already accepted batches are not intentionally resubmitted.</p>}
        </section>}

        {rows.length > 0 && !resumePlan && <button className="primary" disabled={loading || previewing || previewSummary.PENDING > 0 || (previewSummary.CREATE + previewSummary.UPDATE === 0)} onClick={runImport}>{loading ? 'Submitting…' : `Import ${previewSummary.CREATE + previewSummary.UPDATE} customer changes${previewSummary.ERROR ? ` (exclude ${previewSummary.ERROR} errors)` : ''}`}</button>}
        {resumePlan && <button className="primary" disabled={loading} onClick={resumeImport}>{loading ? 'Resuming…' : `Resume saved import from batch ${resumePlan.nextBatchIndex + 1}`}</button>}

        {importStatus && <div className="success">Submitted {importStatus.submitted} customer changes in {importStatus.tasks.length} bulk task(s). Skipped {importStatus.skipped} unchanged row(s). Excluded {importStatus.excludedErrors} error row(s). Created {importStatus.createdOrganizations} missing organisation(s). Import session: {importStatus.sessionId}.</div>}
      </>}

      {tab === 'Import History' && <>
        <section className="card"><div className="toolbar"><button onClick={loadHistory}>Refresh status</button></div><h3>Import sessions</h3><table><thead><tr><th>Started</th><th>File</th><th>Progress</th><th>Status</th><th>Session</th></tr></thead><tbody>{importSessions.map((s) => <tr key={s.id}><td>{new Date(s.createdAt).toLocaleString()}</td><td>{s.fileName || '—'}</td><td>{Number(s.submittedRows || 0).toLocaleString()} / {Number(s.totalRows || 0).toLocaleString()} rows · {Number(s.completedBatches || 0)} / {Number(s.totalBatches || 0)} batches</td><td>{s.status || 'Unknown'}</td><td className="muted">{s.id}</td></tr>)}</tbody></table>{!importSessions.length && <div className="empty">No import sessions recorded yet.</div>}</section>
        <section className="card"><h3>Bulk task history</h3><table><thead><tr><th>Submitted</th><th>Batch</th><th>Rows</th><th>Status</th><th>Failures</th><th>Task</th></tr></thead><tbody>{history.map((h) => <tr key={h.id}><td>{new Date(h.createdAt).toLocaleString()}</td><td>{h.batchNumber && h.totalBatches ? `${h.batchNumber}/${h.totalBatches}` : '—'}</td><td>{h.count}</td><td>{h.task?.status || 'Unknown'}</td><td>{h.task?.failures?.length || 0}</td><td className="muted">{h.taskId}</td></tr>)}</tbody></table>{!history.length && <div className="empty">No bulk tasks recorded yet.</div>}</section>
      </>}
    </main>
  </div>;
}

createRoot(document.getElementById('root')).render(<App/>);