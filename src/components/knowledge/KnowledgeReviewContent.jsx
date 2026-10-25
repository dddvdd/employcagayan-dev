import {useEffect,useRef,useState} from 'react'
import AccessibleDialog from '../ui/AccessibleDialog.jsx'

const input='mt-1 w-full rounded-lg border border-slate-300 bg-white p-2 text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100'
const button='rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium disabled:opacity-50 dark:border-slate-600'
const date=value=>value?new Date(value).toLocaleString():'Not recorded'

function RelationshipDialog({api,config,row,sources,onClose,onSaved,onReload}){
 const [action,setAction]=useState('approve'),[sourceId,setSourceId]=useState(row.taxonomy_source_id??'')
 const [evidence,setEvidence]=useState(row.evidence_reference??''),[confirmed,setConfirmed]=useState(false)
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[stale,setStale]=useState(false)
 const [history,setHistory]=useState([]),[historyBusy,setHistoryBusy]=useState(true),[historyError,setHistoryError]=useState(''),[more,setMore]=useState(false)
 const source=sources.find(s=>s.id===sourceId)
 const active=config.isActive(row)
 const canSave=confirmed&&evidence.trim()&&[...evidence.trim()].length<=1000&&!busy&&!stale&&(action==='reject'||active&&source)
 useEffect(()=>{
  let current=true
  api.history(row.id).then(rows=>{if(current){setHistory(rows);setMore(rows.length===20)}})
   .catch(e=>{if(current)setHistoryError(e.message)}).finally(()=>{if(current)setHistoryBusy(false)})
  return()=>{current=false}
 },[api,row.id])
 async function loadMore(){
  setHistoryBusy(true);setHistoryError('')
  try{const rows=await api.history(row.id,history.at(-1)?.revision??0);setHistory(old=>[...old,...rows]);setMore(rows.length===20)}
  catch(e){setHistoryError(e.message)}
  finally{setHistoryBusy(false)}
 }
 async function reload(){
  setBusy(true);setError('')
  try{await onReload(row.id)}catch(e){setError(e.message);setBusy(false)}
 }
 async function save(event){
  event.preventDefault();if(!canSave)return
  setBusy(true);setError('')
  try{await api.review({id:row.id,revision:row.revision,action,sourceId:source?.id,sourceVersion:source?.version,evidence});onSaved(action)}
  catch(e){setError(e.message);if(e.code==='55000')setStale(true);setBusy(false)}
 }
 return <AccessibleDialog open onClose={onClose} closeDisabled={busy} labelledBy="relationship-review-title" className="max-w-3xl">
  <div className="flex items-start justify-between gap-4"><div><h2 id="relationship-review-title" className="text-xl font-bold">{config.reviewTitle}</h2><p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{config.label(row)}</p></div><button type="button" className={button} onClick={onClose} disabled={busy} aria-label="Close relationship review">Close</button></div>
  <dl className="mt-4 grid grid-cols-2 gap-3 text-sm"><div><dt className="text-slate-500">Relationship</dt><dd>{row.relationship_type}</dd></div><div><dt className="text-slate-500">Review state</dt><dd>{config.reviewState(row)}</dd></div><div><dt className="text-slate-500">Recorded source</dt><dd>{row.taxonomy_source?.name??row.source??'Not recorded'}{row.source_version?' · '+row.source_version:''}</dd></div><div><dt className="text-slate-500">Revision</dt><dd>{row.revision}</dd></div></dl>
  <p className="mt-4 rounded-lg bg-slate-100 p-3 text-sm dark:bg-slate-800">{config.reviewDescription}</p>
  <form onSubmit={save} className="mt-4 space-y-4">
   <label className="block text-sm font-medium">Decision<select className={input} value={action} disabled={busy||stale} onChange={e=>{setAction(e.target.value);setConfirmed(false)}}><option value="approve">Approve relationship</option><option value="reject">Reject relationship</option></select></label>
   {action==='approve'&&<><label className="block text-sm font-medium">Versioned source<select className={input} value={sourceId} disabled={busy||stale} onChange={e=>{setSourceId(e.target.value);setConfirmed(false)}}><option value="">Choose a source</option>{sources.map(s=><option key={s.id} value={s.id}>{s.name} ({s.code}, {s.version})</option>)}</select></label>
   {source&&<p className="text-sm">Selected source version: <strong>{source.version}</strong></p>}
   {(!active||sources.length===0)&&<p className="text-sm text-amber-700 dark:text-amber-300">{config.activeMessage??'Approval requires an active occupation, skill and versioned source.'}</p>}</>}
   <label className="block text-sm font-medium">{action==='approve'?'Evidence reference':'Reason for rejection'}<textarea className={input} rows={3} value={evidence} disabled={busy||stale} onChange={e=>{setEvidence(e.target.value);setConfirmed(false)}} required aria-describedby="evidence-help"/></label>
   <p id="evidence-help" className="text-xs text-slate-500">Use a public source reference or review reason. Maximum 1,000 characters. {[...evidence].length}/1,000</p>
   <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={confirmed} disabled={busy||stale} onChange={e=>setConfirmed(e.target.checked)} className="mt-1"/>{action==='approve'?'I checked this relationship against the selected source.':'I reviewed this relationship and recorded a reason.'}</label>
   {error&&<p role="alert" className="text-sm text-red-700 dark:text-red-300">{error}</p>}
   <div className="flex flex-wrap gap-2"><button type="submit" className={button+' bg-indigo-700 text-white'} disabled={!canSave}>{busy?'Saving review…':'Save review'}</button><button type="button" className={button} disabled={busy} onClick={reload}>Reload relationship</button></div>
  </form>
  <section className="mt-6 border-t border-slate-200 pt-4 dark:border-slate-700" aria-label="Relationship history"><h3 className="font-semibold">Change history</h3>
   {historyBusy&&<p role="status" className="mt-2 text-sm">Loading history…</p>}
   {historyError&&<p role="alert" className="mt-2 text-sm text-red-700">{historyError}</p>}
   <ol className="mt-3 space-y-3">{history.map(h=><li key={h.revision} className="rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-700"><p className="font-medium">Revision {h.revision} · {h.operation==='baseline'?'Initial record':h.operation==='DELETE'?'Deleted':h.operation==='INSERT'?'Created':'Updated'}</p><p>{date(h.recorded_at)}</p><p>Review: {h.snapshot?.review_status??'Not recorded'}{h.snapshot?.source_version?' · Source version '+h.snapshot.source_version:''}</p>{h.snapshot?.evidence_reference&&<p className="mt-1 whitespace-pre-wrap break-words">{h.snapshot.evidence_reference}</p>}</li>)}</ol>
   {!historyBusy&&!historyError&&!history.length&&<p className="mt-2 text-sm">No history available.</p>}
   {historyError?<button type="button" className={button+' mt-3'} onClick={loadMore} disabled={historyBusy}>Retry history</button>:more&&<button type="button" className={button+' mt-3'} onClick={loadMore} disabled={historyBusy}>Load more history</button>}
  </section>
 </AccessibleDialog>
}

export default function KnowledgeReviewContent({api,config,headerAction,initialSelection=null,initialNotice=''}){
 const [status,setStatus]=useState('pending'),[page,setPage]=useState(0),[refresh,setRefresh]=useState(0)
 const [rows,setRows]=useState([]),[sources,setSources]=useState([]),[more,setMore]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState(''),[notice,setNotice]=useState(initialNotice)
 const [selected,setSelected]=useState(initialSelection?{row:initialSelection,serial:0}:null);const serial=useRef(0)
 useEffect(()=>{
  let current=true;setLoading(true);setRows([]);setError('')
  Promise.all([api.list(status,page),api.sources()]).then(([result,activeSources])=>{if(current){setRows(result.rows);setMore(result.hasMore);setSources(activeSources)}})
   .catch(e=>{if(current)setError(e.message)}).finally(()=>{if(current)setLoading(false)})
  return()=>{current=false}
 },[api,status,page,refresh])
 async function reloadRelationship(id){
  const [row,activeSources]=await Promise.all([api.get(id),api.sources()])
  setSources(activeSources);setSelected({row,serial:++serial.current})
 }
 return <main className="mx-auto max-w-6xl p-4 text-slate-900 dark:text-slate-100 sm:p-6">
  <div className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-2xl font-bold">{config.title}</h1>{headerAction}</div><p className="mt-2 max-w-3xl text-sm text-slate-600 dark:text-slate-300">{config.description}</p>
  <div className="my-5 flex flex-wrap items-end gap-3"><label className="text-sm font-medium">Review filter<select className={input} value={status} onChange={e=>{setStatus(e.target.value);setPage(0);setNotice('')}}><option value="pending">Pending review</option><option value="approved">Approved</option><option value="rejected">Rejected</option><option value="all">All relationships</option></select></label><button type="button" className={button} onClick={()=>setRefresh(n=>n+1)} disabled={loading}>Reload list</button></div>
  {notice&&<p role="status" className="mb-3 text-sm text-green-700 dark:text-green-300">{notice}</p>}
  {loading&&<p role="status">Loading relationships…</p>}
  {error&&<div role="alert"><p>{error}</p><button type="button" className={button+' mt-2'} onClick={()=>setRefresh(n=>n+1)}>Try again</button></div>}
  {!loading&&!error&&!rows.length&&<p>No relationships match this filter.</p>}
  <div className="space-y-3">{rows.map(row=><article key={row.id} className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900"><div className="min-w-0"><h2 className="break-words font-semibold">{config.leftName(row)} → {config.rightName(row)}</h2><p className="mt-1 text-sm">{config.reviewState(row)} · {row.relationship_type} · Revision {row.revision}</p><p className="text-sm text-slate-500">Source: {row.taxonomy_source?.name??row.source??'Not recorded'}{row.source_version?' · '+row.source_version:''}</p></div><button type="button" className={button} onClick={()=>{setNotice('');setSelected({row,serial:++serial.current})}} aria-label={'Review '+config.leftName(row)+' to '+config.rightName(row)}>Review relationship</button></article>)}</div>
  <nav aria-label="Relationship pages" className="mt-5 flex items-center gap-3"><button type="button" className={button} disabled={loading||page===0} onClick={()=>setPage(n=>n-1)}>Previous page</button><span className="text-sm">Page {page+1}</span><button type="button" className={button} disabled={loading||!more||!!error} onClick={()=>setPage(n=>n+1)}>Next page</button></nav>
  {selected&&<RelationshipDialog key={selected.serial} api={api} config={config} row={selected.row} sources={sources} onClose={()=>setSelected(null)} onReload={reloadRelationship} onSaved={action=>{setSelected(null);setNotice(action==='approve'?'Relationship approved.':'Relationship rejected.');setRefresh(n=>n+1)}}/>}
 </main>
}
