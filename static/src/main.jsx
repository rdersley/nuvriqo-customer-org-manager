import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { invoke } from '@forge/bridge';
import { analyseRows, mapRows, parseCsv, suggestMapping, toIssueCsv } from './import-utils.js';
import './styles.css';

const tabs = ['Customers', 'Organisations', 'Import', 'Import History'];

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
  const [importStatus,setImportStatus]=useState(null);
  const [history,setHistory]=useState([]);

  useEffect(()=>{ (async()=>{ try { const r=await invoke('getServiceDesks'); setServiceDesks(r.values||[]); if(r.values?.[0]) setDesk(r.values[0].id); } catch(e){setError(e.message);} })(); },[]);
  useEffect(()=>{ if(tab==='Organisations') loadOrgs(); },[tab]);
  useEffect(()=>{ if(tab==='Customers' && desk) loadCustomers(); },[tab,desk]);
  useEffect(()=>{ if(tab==='Import History') loadHistory(); },[tab]);

  async function loadCustomers(){ setLoading(true);setError('');try{const r=await invoke('getCustomers',{serviceDeskId:desk,query:customerQuery});setCustomers(r.values||[]);}catch(e){setError(e.message);}finally{setLoading(false);} }
  async function loadOrgs(){ setLoading(true);setError('');try{const r=await invoke('getOrganizations');setOrgs(r.values||[]);}catch(e){setError(e.message);}finally{setLoading(false);} }
  async function loadHistory(){ try{ const h=await invoke('getImportHistory'); const enriched=await Promise.all(h.map(async x=>{ try{return {...x, task:await invoke('getTaskStatus',{taskId:x.taskId})};}catch{return x;} })); setHistory(enriched);}catch(e){setError(e.message);} }
  async function onFile(e){ const f=e.target.files?.[0]; if(!f)return; const parsed=parseCsv(await f.text()); setHeaders(parsed.headers); setRawRows(parsed.rows); setMapping(suggestMapping(parsed.headers)); setImportStatus(null); setError(''); }
  function downloadIssues(){ const blob=new Blob([toIssueCsv(analysis.issues)],{type:'text/csv;charset=utf-8'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download='nuvriqo-import-validation-errors.csv'; a.click(); URL.revokeObjectURL(url); }
  async function runImport(){ setLoading(true);setError('');try{ const validRows=analysis.rows.filter(r=>r.valid); const names=[...new Set(validRows.map(r=>r.organisation).filter(Boolean))]; const prepared=await invoke('prepareImportOrganizations',{names}); const allOrgs=[...orgs,...(prepared.organizations||[])]; const orgMap=new Map(allOrgs.map(o=>[String(o.name).toLowerCase(),o.id])); const mapped=validRows.map(r=>({ email:r.email, displayName:r.displayName, organizationIds:r.organisation && orgMap.has(r.organisation.toLowerCase()) ? [orgMap.get(r.organisation.toLowerCase())] : [] })); const chunks=[]; for(let i=0;i<mapped.length;i+=100) chunks.push(mapped.slice(i,i+100)); const tasks=[]; for(const chunk of chunks) tasks.push(await invoke('bulkUpsertCustomers',{rows:chunk})); setImportStatus({submitted:mapped.length,tasks,createdOrganizations:(prepared.created||[]).length}); } catch(e){setError(e.message);}finally{setLoading(false);} }

  const mappedRows=useMemo(()=>mapRows(rawRows,mapping),[rawRows,mapping]);
  const analysis=useMemo(()=>analyseRows(mappedRows),[mappedRows]);
  const filteredCustomers=useMemo(()=>{const q=customerQuery.trim().toLowerCase();if(!q)return customers;return customers.filter(c=>`${c.displayName||''} ${c.emailAddress||''} ${c.accountId||c.key||''}`.toLowerCase().includes(q));},[customers,customerQuery]);
  const filteredOrgs=useMemo(()=>{const q=orgQuery.trim().toLowerCase();if(!q)return orgs;return orgs.filter(o=>String(o.name||'').toLowerCase().includes(q));},[orgs,orgQuery]);
  const mappingReady=Boolean(mapping.email&&mapping.displayName);

  return <div className="app">
    <aside><div className="brand">Nuvriqo</div><div className="product">Customer & Organisation Manager</div>{tabs.map(t=><button key={t} className={tab===t?'active':''} onClick={()=>setTab(t)}>{t}</button>)}</aside>
    <main><header><div><h1>{tab}</h1><p>Bulk customer and organisation administration for Jira Service Management.</p></div>{tab==='Customers'&&<select value={desk} onChange={e=>setDesk(e.target.value)}>{serviceDesks.map(d=><option key={d.id} value={d.id}>{d.projectName}</option>)}</select>}</header>
      {error&&<div className="error">{error}</div>}
      {tab==='Customers'&&<section className="card"><div className="toolbar"><input value={customerQuery} onChange={e=>setCustomerQuery(e.target.value)} onKeyDown={e=>e.key==='Enter'&&loadCustomers()} placeholder="Search customers by name, email or account"/><button onClick={loadCustomers}>Search</button><button onClick={()=>{setCustomerQuery('');loadCustomers();}}>Refresh</button></div><table><thead><tr><th>Name</th><th>Email</th><th>Account</th></tr></thead><tbody>{filteredCustomers.map(c=><tr key={c.accountId||c.key}><td>{c.displayName}</td><td>{c.emailAddress||'—'}</td><td className="muted">{c.accountId||c.key}</td></tr>)}</tbody></table>{!loading&&!filteredCustomers.length&&<div className="empty">No matching customers returned for this service project.</div>}</section>}
      {tab==='Organisations'&&<section className="card"><div className="toolbar"><input value={orgQuery} onChange={e=>setOrgQuery(e.target.value)} placeholder="Search organisations"/><button onClick={loadOrgs}>Refresh</button></div><div className="grid">{filteredOrgs.map(o=><div className="org" key={o.id}><strong>{o.name}</strong><span>ID {o.id}</span></div>)}</div>{!filteredOrgs.length&&<div className="empty">No matching organisations.</div>}</section>}
      {tab==='Import'&&<><section className="card upload"><h2>Advanced customer import</h2><p>Upload almost any CSV, then confirm which columns contain email, display name and organisation before import.</p><input type="file" accept=".csv,text/csv" onChange={onFile}/></section>{headers.length>0&&<section className="card mapping"><h3>Column mapping</h3><div className="mapping-grid"><label>Email<select value={mapping.email} onChange={e=>setMapping({...mapping,email:e.target.value})}><option value="">Select column</option>{headers.map(h=><option key={h}>{h}</option>)}</select></label><label>Display name<select value={mapping.displayName} onChange={e=>setMapping({...mapping,displayName:e.target.value})}><option value="">Select column</option>{headers.map(h=><option key={h}>{h}</option>)}</select></label><label>Organisation <span className="muted">(optional)</span><select value={mapping.organisation} onChange={e=>setMapping({...mapping,organisation:e.target.value})}><option value="">None</option>{headers.map(h=><option key={h}>{h}</option>)}</select></label></div></section>}{rawRows.length>0&&<section className="stats"><div><b>{analysis.total}</b><span>Rows</span></div><div><b>{analysis.valid}</b><span>Ready</span></div><div><b>{analysis.invalid}</b><span>Invalid</span></div></section>}{rawRows.length>0&&mappingReady&&<section className="card"><h3>Import preview</h3><table><thead><tr><th>Row</th><th>Email</th><th>Name</th><th>Organisation</th><th>Status</th></tr></thead><tbody>{analysis.rows.slice(0,25).map(r=><tr key={r.rowNumber}><td>{r.rowNumber}</td><td>{r.email||'—'}</td><td>{r.displayName||'—'}</td><td>{r.organisation||'—'}</td><td className={r.valid?'ready':'invalid'}>{r.valid?'Ready':r.issues.join('; ')}</td></tr>)}</tbody></table>{analysis.rows.length>25&&<div className="empty">Showing first 25 of {analysis.rows.length} rows.</div>}</section>}{analysis.issues.length>0&&<section className="card"><div className="toolbar"><h3>Validation issues</h3><button onClick={downloadIssues}>Download error report</button></div>{analysis.issues.slice(0,30).map((e,i)=><div className="validation" key={i}>Row {e.row}: {e.message}</div>)}</section>}{rawRows.length>0&&<button className="primary" disabled={loading||!mappingReady||analysis.invalid>0||analysis.valid===0} onClick={runImport}>{loading?'Submitting…':`Import ${analysis.valid} customers`}</button>}{importStatus&&<div className="success">Submitted {importStatus.submitted} customer profiles in {importStatus.tasks.length} bulk task(s). Created {importStatus.createdOrganizations} missing organisation(s).</div>}</>}
      {tab==='Import History'&&<section className="card"><div className="toolbar"><button onClick={loadHistory}>Refresh status</button></div><table><thead><tr><th>Submitted</th><th>Rows</th><th>Status</th><th>Failures</th><th>Task</th></tr></thead><tbody>{history.map(h=><tr key={h.id}><td>{new Date(h.createdAt).toLocaleString()}</td><td>{h.count}</td><td>{h.task?.status||'Unknown'}</td><td>{h.task?.failures?.length||0}</td><td className="muted">{h.taskId}</td></tr>)}</tbody></table>{!history.length&&<div className="empty">No imports recorded yet.</div>}</section>}
    </main>
  </div>
}
createRoot(document.getElementById('root')).render(<App/>);
