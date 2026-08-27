import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { invoke } from '@forge/bridge';
import './styles.css';

const tabs = ['Customers', 'Organisations', 'Import', 'Import History'];

function parseCsv(text) {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean);
  if (!lines.length) return [];
  const parseLine = (line) => {
    const out=[]; let cur=''; let q=false;
    for (let i=0;i<line.length;i++) { const c=line[i]; if(c==='"'){ if(q&&line[i+1]==='"'){cur+='"';i++;}else q=!q; } else if(c===','&&!q){out.push(cur.trim());cur='';}else cur+=c; }
    out.push(cur.trim()); return out;
  };
  const headers = parseLine(lines[0]).map(h => h.toLowerCase().replace(/\s+/g,''));
  return lines.slice(1).map(line => {
    const cols=parseLine(line); const obj={}; headers.forEach((h,i)=>obj[h]=cols[i]||'');
    return { email: obj.email || obj.emailaddress || '', displayName: obj.displayname || obj.fullname || obj.name || '', organisation: obj.organisation || obj.organization || '' };
  });
}

function App(){
  const [tab,setTab]=useState('Customers');
  const [serviceDesks,setServiceDesks]=useState([]);
  const [desk,setDesk]=useState('');
  const [customers,setCustomers]=useState([]);
  const [orgs,setOrgs]=useState([]);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState('');
  const [rows,setRows]=useState([]);
  const [validation,setValidation]=useState(null);
  const [importStatus,setImportStatus]=useState(null);
  const [history,setHistory]=useState([]);

  useEffect(()=>{ (async()=>{ try { const r=await invoke('getServiceDesks'); setServiceDesks(r.values||[]); if(r.values?.[0]) setDesk(r.values[0].id); } catch(e){setError(e.message);} })(); },[]);
  useEffect(()=>{ if(tab==='Organisations') loadOrgs(); },[tab]);
  useEffect(()=>{ if(tab==='Customers' && desk) loadCustomers(); },[tab,desk]);
  useEffect(()=>{ if(tab==='Import History') loadHistory(); },[tab]);

  async function loadCustomers(){ setLoading(true);setError('');try{const r=await invoke('getCustomers',{serviceDeskId:desk});setCustomers(r.values||[]);}catch(e){setError(e.message);}finally{setLoading(false);} }
  async function loadOrgs(){ setLoading(true);setError('');try{const r=await invoke('getOrganizations');setOrgs(r.values||[]);}catch(e){setError(e.message);}finally{setLoading(false);} }
  async function loadHistory(){ try{ const h=await invoke('getImportHistory'); const enriched=await Promise.all(h.map(async x=>{ try{return {...x, task:await invoke('getTaskStatus',{taskId:x.taskId})};}catch{return x;} })); setHistory(enriched);}catch(e){setError(e.message);} }
  async function onFile(e){ const f=e.target.files?.[0]; if(!f)return; const parsed=parseCsv(await f.text()); setRows(parsed); setValidation(await invoke('validateImport',{rows:parsed})); setImportStatus(null); }
  async function runImport(){ setLoading(true);setError('');try{ const names=[...new Set(rows.map(r=>r.organisation).filter(Boolean))]; const prepared=await invoke('prepareImportOrganizations',{names}); const allOrgs=[...orgs,...(prepared.organizations||[])]; const orgMap=new Map(allOrgs.map(o=>[String(o.name).toLowerCase(),o.id])); const mapped=rows.filter(r=>r.email&&r.displayName).map(r=>({ ...r, organizationIds: r.organisation && orgMap.has(r.organisation.toLowerCase()) ? [orgMap.get(r.organisation.toLowerCase())] : [] })); const chunks=[]; for(let i=0;i<mapped.length;i+=100) chunks.push(mapped.slice(i,i+100)); const tasks=[]; for(const chunk of chunks) tasks.push(await invoke('bulkUpsertCustomers',{rows:chunk})); setImportStatus({submitted:mapped.length,tasks,createdOrganizations:(prepared.created||[]).length}); } catch(e){setError(e.message);}finally{setLoading(false);} }

  const summary=useMemo(()=>({total:rows.length, valid:validation?.valid||0, errors:validation?.errors?.length||0}),[rows,validation]);

  return <div className="app">
    <aside><div className="brand">Nuvriqo</div><div className="product">Customer & Organisation Manager</div>{tabs.map(t=><button key={t} className={tab===t?'active':''} onClick={()=>setTab(t)}>{t}</button>)}</aside>
    <main><header><div><h1>{tab}</h1><p>Bulk customer and organisation administration for Jira Service Management.</p></div>{tab==='Customers'&&<select value={desk} onChange={e=>setDesk(e.target.value)}>{serviceDesks.map(d=><option key={d.id} value={d.id}>{d.projectName}</option>)}</select>}</header>
      {error&&<div className="error">{error}</div>}
      {tab==='Customers'&&<section className="card"><div className="toolbar"><input placeholder="Search customers (coming next)"/><button onClick={loadCustomers}>Refresh</button></div><table><thead><tr><th>Name</th><th>Email</th><th>Account</th></tr></thead><tbody>{customers.map(c=><tr key={c.accountId||c.key}><td>{c.displayName}</td><td>{c.emailAddress||'—'}</td><td className="muted">{c.accountId||c.key}</td></tr>)}</tbody></table>{!loading&&!customers.length&&<div className="empty">No customers returned for this service project.</div>}</section>}
      {tab==='Organisations'&&<section className="card"><div className="toolbar"><input placeholder="Search organisations"/><button onClick={loadOrgs}>Refresh</button></div><div className="grid">{orgs.map(o=><div className="org" key={o.id}><strong>{o.name}</strong><span>ID {o.id}</span></div>)}</div></section>}
      {tab==='Import'&&<><section className="card upload"><h2>Advanced customer import</h2><p>CSV headers supported now: Email, Full Name/Display Name, Organisation.</p><input type="file" accept=".csv,text/csv" onChange={onFile}/></section>{rows.length>0&&<section className="stats"><div><b>{summary.total}</b><span>Rows</span></div><div><b>{summary.valid}</b><span>Ready</span></div><div><b>{summary.errors}</b><span>Errors</span></div></section>}{validation?.errors?.length>0&&<section className="card"><h3>Validation issues</h3>{validation.errors.slice(0,20).map((e,i)=><div className="validation" key={i}>Row {e.row}: {e.message}</div>)}</section>}{rows.length>0&&<button className="primary" disabled={loading||summary.errors>0} onClick={runImport}>{loading?'Submitting…':`Import ${summary.valid} customers`}</button>}{importStatus&&<div className="success">Submitted {importStatus.submitted} customer profiles in {importStatus.tasks.length} bulk task(s). Created {importStatus.createdOrganizations} missing organisation(s).</div>}</>}
      {tab==='Import History'&&<section className="card"><div className="toolbar"><button onClick={loadHistory}>Refresh status</button></div><table><thead><tr><th>Submitted</th><th>Rows</th><th>Status</th><th>Failures</th><th>Task</th></tr></thead><tbody>{history.map(h=><tr key={h.id}><td>{new Date(h.createdAt).toLocaleString()}</td><td>{h.count}</td><td>{h.task?.status||'Unknown'}</td><td>{h.task?.failures?.length||0}</td><td className="muted">{h.taskId}</td></tr>)}</tbody></table>{!history.length&&<div className="empty">No imports recorded yet.</div>}</section>}
    </main>
  </div>
}
createRoot(document.getElementById('root')).render(<App/>);
