import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { invoke } from '@forge/bridge';
import { analyseRows, mapRows, parseCsv, planImportRows, suggestMapping, toIssueCsv } from './import-utils.js';
import './styles.css';

const tabs = ['Customers', 'Organisations', 'Import', 'Import History'];

function downloadText(filename, text, type = 'text/csv;charset=utf-8') {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function App(){
  const [tab,setTab]=useState('Customers');
  const [serviceDesks,setServiceDesks]=useState([]);
  const [desk,setDesk]=useState('');
  const [customers,setCustomers]=useState([]);
  const [customerQuery,setCustomerQuery]=useState('');
  const [orgs,setOrgs]=useState([]);
  const [orgQuery,setOrgQuery]=useState('');
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState('');
  const [headers,setHeaders]=useState([]);
  const [rawRows,setRawRows]=useState([]);
  const [mapping,setMapping]=useState({email:'',displayName:'',organisation:''});
  const [importMode,setImportMode]=useState('create-new');
  const [existingCheck,setExistingCheck]=useState(null);
  const [importStatus,setImportStatus]=useState(null);
  const [history,setHistory]=useState([]);

  useEffect(()=>{ (async()=>{ try { const r=await invoke('getServiceDesks'); setServiceDesks(r.values||[]); if(r.values?.[0]) setDesk(r.values[0].id); } catch(e){setError(e.message);} })(); },[]);
  useEffect(()=>{ if(tab==='Organisations') loadOrgs(); },[tab]);
  useEffect(()=>{ if(tab==='Customers' && desk) loadCustomers(); },[tab,desk]);
  useEffect(()=>{ if(tab==='Import History') loadHistory(); },[tab]);
  useEffect(()=>{ setExistingCheck(null); },[desk,rawRows,mapping]);

  async function loadCustomers(){ setLoading(true);setError('');try{const r=await invoke('getCustomers',{serviceDeskId:desk,query:customerQuery});setCustomers(r.values||[]);}catch(e){setError(e.message);}finally{setLoading(false);} }
  async function loadOrgs(){ setLoading(true);setError('');try{const r=await invoke('getOrganizations');setOrgs(r.values||[]);}catch(e){setError(e.message);}finally{setLoading(false);} }
  async function loadHistory(){ try{ const h=await invoke('getImportHistory'); const enriched=await Promise.all(h.map(async x=>{ try{return {...x, task:await invoke('getTaskStatus',{taskId:x.taskId})};}catch{return x;} })); setHistory(enriched);}catch(e){setError(e.message);} }
  async function onFile(e){ const f=e.target.files?.[0]; if(!f)return; const parsed=parseCsv(await f.text()); setHeaders(parsed.headers); setRawRows(parsed.rows); setMapping(suggestMapping(parsed.headers)); setExistingCheck(null); setImportStatus(null); setError(''); }

  const mappedRows=useMemo(()=>mapRows(rawRows,mapping),[rawRows,mapping]);
  const analysis=useMemo(()=>analyseRows(mappedRows),[mappedRows]);
  const plan=useMemo(()=>planImportRows(analysis.rows,existingCheck?.existingEmails||[],importMode),[analysis.rows,existingCheck,importMode]);
  const filteredCustomers=useMemo(()=>{const q=customerQuery.trim().toLowerCase();if(!q)return customers;return customers.filter(c=>`${c.displayName||''} ${c.emailAddress||''} ${c.accountId||c.key||''}`.toLowerCase().includes(q));},[customers,customerQuery]);
  const filteredOrgs=useMemo(()=>{const q=orgQuery.trim().toLowerCase();if(!q)return orgs;return orgs.filter(o=>String(o.name||'').toLowerCase().includes(q));},[orgs,orgQuery]);
  const mappingReady=Boolean(mapping.email&&mapping.displayName);

  async function checkExisting(){
    if(!desk) { setError('Select a Jira Service Management project first.'); return; }
    const emails=analysis.rows.filter(r=>r.valid).map(r=>r.email);
    if(!emails.length) { setError('There are no valid customer rows to check.'); return; }
    setLoading(true); setError(''); setImportStatus(null);
    try {
      const result=await invoke('checkExistingCustomers',{serviceDeskId:desk,emails});
      setExistingCheck(result);
      if(result.truncated) setError('Existing-customer scan reached the safety limit. Review the result before importing.');
    } catch(e){ setError(e.message); }
    finally{ setLoading(false); }
  }

  async function runImport(){
    if(!existingCheck){setError('Check existing Jira customers before importing.');return;}
    const eligibleRows=plan.rows.filter(r=>r.eligible);
    if(!eligibleRows.length){setError('There are no rows to import with the selected import behaviour.');return;}
    setLoading(true);setError('');
    try{
      const names=[...new Set(eligibleRows.map(r=>r.organisation).filter(Boolean))];
      const prepared=await invoke('prepareImportOrganizations',{names});
      const allOrgs=[...orgs,...(prepared.organizations||[])];
      const orgMap=new Map(allOrgs.map(o=>[String(o.name).toLowerCase(),o.id]));
      const mapped=eligibleRows.map(r=>({ email:r.email, displayName:r.displayName, organizationIds:r.organisation && orgMap.has(r.organisation.toLowerCase()) ? [orgMap.get(r.organisation.toLowerCase())] : [] }));
      const chunks=[]; for(let i=0;i<mapped.length;i+=100) chunks.push(mapped.slice(i,i+100));
      const tasks=[]; for(const chunk of chunks) tasks.push(await invoke('bulkUpsertCustomers',{rows:chunk}));
      setImportStatus({submitted:mapped.length,tasks,createdOrganizations:(prepared.created||[]).length,created:plan.create,updated:plan.update,skipped:plan.skip});
    } catch(e){setError(e.message);}finally{setLoading(false);} 
  }

  return <div className="app">
    <aside><div className="brand">Nuvriqo</div><div className="product">Customer & Organisation Manager</div>{tabs.map(t=><button key={t} className={tab===t?'active':''} onClick={()=>setTab(t)}>{t}</button>)}</aside>
    <main><header><div><h1>{tab}</h1><p>Bulk customer and organisation administration for Jira Service Management.</p></div>{(tab==='Customers'||tab==='Import')&&<select value={desk} onChange={e=>setDesk(e.target.value)}>{serviceDesks.map(d=><option key={d.id} value={d.id}>{d.projectName}</option>)}</select>}</header>
      {error&&<div className="error">{error}</div>}
      {tab==='Customers'&&<section className="card"><div className="toolbar"><input value={customerQuery} onChange={e=>setCustomerQuery(e.target.value)} onKeyDown={e=>e.key==='Enter'&&loadCustomers()} placeholder="Search customers by name, email or account"/><button onClick={loadCustomers}>Search</button><button onClick={()=>{setCustomerQuery('');loadCustomers();}}>Refresh</button></div><table><thead><tr><th>Name</th><th>Email</th><th>Account</th></tr></thead><tbody>{filteredCustomers.map(c=><tr key={c.accountId||c.key}><td>{c.displayName}</td><td>{c.emailAddress||'—'}</td><td className="muted">{c.accountId||c.key}</td></tr>)}</tbody></table>{!loading&&!filteredCustomers.length&&<div className="empty">No matching customers returned for this service project.</div>}</section>}
      {tab==='Organisations'&&<section className="card"><div className="toolbar"><input value={orgQuery} onChange={e=>setOrgQuery(e.target.value)} placeholder="Search organisations"/><button onClick={loadOrgs}>Refresh</button></div><div className="grid">{filteredOrgs.map(o=><div className="org" key={o.id}><strong>{o.name}</strong><span>ID {o.id}</span></div>)}</div>{!filteredOrgs.length&&<div className="empty">No matching organisations.</div>}</section>}
      {tab==='Import'&&<>
        <section className="card upload"><h2>Advanced customer import</h2><p>Upload almost any CSV, map its columns, validate every row and check existing Jira customers before anything is submitted.</p><input type="file" accept=".csv,text/csv" onChange={onFile}/></section>
        {headers.length>0&&<section className="card mapping"><h3>Column mapping</h3><div className="mapping-grid"><label>Email<select value={mapping.email} onChange={e=>setMapping({...mapping,email:e.target.value})}><option value="">Select column</option>{headers.map(h=><option key={h}>{h}</option>)}</select></label><label>Display name<select value={mapping.displayName} onChange={e=>setMapping({...mapping,displayName:e.target.value})}><option value="">Select column</option>{headers.map(h=><option key={h}>{h}</option>)}</select></label><label>Organisation <span className="muted">(optional)</span><select value={mapping.organisation} onChange={e=>setMapping({...mapping,organisation:e.target.value})}><option value="">None</option>{headers.map(h=><option key={h}>{h}</option>)}</select></label></div></section>}
        {rawRows.length>0&&<section className="stats"><div><b>{analysis.total}</b><span>Rows</span></div><div><b>{analysis.valid}</b><span>Valid</span></div><div><b>{analysis.invalid}</b><span>Invalid</span></div>{existingCheck&&<><div><b>{plan.create}</b><span>Create</span></div><div><b>{plan.update}</b><span>Update</span></div><div><b>{plan.skip}</b><span>Skip</span></div></>}</section>}
        {analysis.issues.length>0&&<section className="card"><div className="toolbar"><h3>Validation issues</h3><button onClick={()=>downloadText('nuvriqo-import-errors.csv',toIssueCsv(analysis.issues))}>Download error report</button></div>{analysis.issues.slice(0,30).map((e,i)=><div className="validation" key={i}>Row {e.row}: {e.message}</div>)}</section>}
        {rawRows.length>0&&mappingReady&&<section className="card"><h3>Import behaviour</h3><div className="mapping-grid"><label>Existing Jira customers<select value={importMode} onChange={e=>setImportMode(e.target.value)}><option value="create-new">Create new only — skip existing</option><option value="update-existing">Update existing only — skip new</option><option value="upsert">Create new and update existing</option></select></label></div><p className="muted">No customer is submitted until the existing-customer check is complete. This makes create, update and skip behaviour explicit before import.</p><button onClick={checkExisting} disabled={loading||analysis.invalid>0||analysis.valid===0}>{loading?'Checking…':'Check existing Jira customers'}</button>{existingCheck&&<div className="success">Checked {existingCheck.scanned} Jira customer record(s). Found {existingCheck.existingEmails.length} matching email address(es).</div>}</section>}
        {rawRows.length>0&&mappingReady&&<section className="card"><h3>Import preview</h3><table><thead><tr><th>Row</th><th>Email</th><th>Name</th><th>Organisation</th><th>Jira</th><th>Action</th></tr></thead><tbody>{plan.rows.slice(0,25).map(r=><tr key={r.rowNumber}><td>{r.rowNumber}</td><td>{r.email||'—'}</td><td>{r.displayName||'—'}</td><td>{r.organisation||'—'}</td><td>{existingCheck?(r.existsInJira?'Existing':'New'):'Not checked'}</td><td className={r.action==='INVALID'?'invalid':r.action==='SKIP'?'muted':'ready'}>{existingCheck?r.action:(r.valid?'Pending check':'INVALID')}</td></tr>)}</tbody></table>{plan.rows.length>25&&<div className="empty">Showing first 25 of {plan.rows.length} rows.</div>}</section>}
        {rawRows.length>0&&<button className="primary" disabled={loading||!mappingReady||analysis.invalid>0||!existingCheck||plan.eligible===0} onClick={runImport}>{loading?'Submitting…':`Run import — ${plan.eligible} customer${plan.eligible===1?'':'s'}`}</button>}
        {importStatus&&<div className="success">Submitted {importStatus.submitted} customer profiles in {importStatus.tasks.length} bulk task(s): {importStatus.created} create, {importStatus.updated} update, {importStatus.skipped} skipped. Created {importStatus.createdOrganizations} missing organisation(s).</div>}
      </>}
      {tab==='Import History'&&<section className="card"><div className="toolbar"><button onClick={loadHistory}>Refresh status</button></div><table><thead><tr><th>Submitted</th><th>Rows</th><th>Status</th><th>Failures</th><th>Task</th></tr></thead><tbody>{history.map(h=><tr key={h.id}><td>{new Date(h.createdAt).toLocaleString()}</td><td>{h.count}</td><td>{h.task?.status||'Unknown'}</td><td>{h.task?.failures?.length||0}</td><td className="muted">{h.taskId}</td></tr>)}</tbody></table>{!history.length&&<div className="empty">No imports recorded yet.</div>}</section>}
    </main>
  </div>
}
createRoot(document.getElementById('root')).render(<App/>);
