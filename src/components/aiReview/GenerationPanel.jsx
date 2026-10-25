import {useEffect,useRef,useState} from 'react'
import AccessibleDialog from '../ui/AccessibleDialog.jsx'
import {extractionWorkflow} from '../../services/extractionWorkflow.js'
export default function GenerationPanel({onReady}){
 const [open,setOpen]=useState(false),[kind,setKind]=useState('jobseeker_profile'),[search,setSearch]=useState(''),[records,setRecords]=useState([])
 const [selected,setSelected]=useState(null),[source,setSource]=useState(null),[confirmed,setConfirmed]=useState(false),[run,setRun]=useState(null)
 const [busy,setBusy]=useState(false),[searching,setSearching]=useState(false),[error,setError]=useState(null)
 const sequence=useRef(0),identity=useRef(0)
 const enabled=import.meta.env.VITE_ENABLE_MANAGED_EXTRACTION==='true'
 useEffect(()=>{
  const current=++sequence.current
  if(!open||search.trim().length<2){setRecords([]);setSearching(false);return}
  setSearching(true)
  const timer=setTimeout(async()=>{
   try{const rows=await extractionWorkflow.search(kind,search);if(current===sequence.current){setRecords(rows);setError(null)}}
   catch{if(current===sequence.current){setRecords([]);setError('Unable to find available records. Try again.')}}
   finally{if(current===sequence.current)setSearching(false)}
  },250)
  return()=>{clearTimeout(timer);sequence.current++}
 },[open,kind,search])
 useEffect(()=>()=>{identity.current++;sequence.current++},[])
 function resetSelection(){identity.current++;setSelected(null);setSource(null);setRun(null);setConfirmed(false);setError(null)}
 function close(){identity.current++;setOpen(false);resetSelection();setBusy(false)}
 async function load(record){
  const current=++identity.current;setSelected(record);setSource(null);setRun(null);setConfirmed(false);setError(null);setBusy(true)
  try{const value=await extractionWorkflow.source(kind,record.id);if(current===identity.current)setSource(value)}
  catch(e){if(current===identity.current)setError(e.message)}
  finally{if(current===identity.current)setBusy(false)}
 }
 async function generate(){
  if(!enabled||!confirmed||!source?.source_text.trim()||busy)return
  const current=identity.current;setError(null);setBusy(true)
  try{const value=await extractionWorkflow.generate(source);if(current===identity.current)setRun(value)}
  catch(e){if(current===identity.current){setError(e.message);setConfirmed(false)}}
  finally{if(current===identity.current)setBusy(false)}
 }
 async function check(){
  const current=identity.current;setBusy(true);setError(null)
  try{const value=await extractionWorkflow.status(run.run_id);if(current===identity.current){setRun(value);if(value.source_changed){setConfirmed(false);setError('Employment details changed. Reload the text before continuing.')}}}
  catch(e){if(current===identity.current)setError(e.message)}
  finally{if(current===identity.current)setBusy(false)}
 }
 return <>
  <button type="button" onClick={()=>setOpen(true)} className="rounded-lg bg-indigo-700 px-4 py-2 font-semibold text-white">Prepare AI suggestions</button>
  <AccessibleDialog open={open} onClose={close} closeDisabled={busy} labelledBy="generation-title" className="w-full max-w-3xl">
   <div className="space-y-4 p-6">
    <h2 id="generation-title" className="text-xl font-bold text-slate-900">Prepare employment suggestions</h2>
    <p className="text-sm text-slate-600">Choose a record and review its employment text. Generated suggestions need human review before they are added to the profile or vacancy.</p>
    <label className="block font-semibold">Record type
     <select value={kind} disabled={busy} onChange={e=>{resetSelection();setKind(e.target.value);setSearch('')}} className="mt-1 block w-full rounded border p-2">
      <option value="jobseeker_profile">Jobseeker</option><option value="vacancy">Vacancy</option>
     </select>
    </label>
    <label className="block font-semibold">Find a record
     <input value={search} maxLength={120} disabled={busy} onChange={e=>{resetSelection();setSearch(e.target.value)}} placeholder={kind==='vacancy'?'Position or company':'First or last name'} className="mt-1 block w-full rounded border p-2"/>
    </label>
    {searching&&<p role="status">Finding available records…</p>}
    {!searching&&records.length>0&&<ul className="max-h-40 overflow-auto rounded border">{records.map(record=><li key={record.id}><button type="button" disabled={busy} onClick={()=>load(record)} className="w-full p-2 text-left hover:bg-indigo-50">{record.label}</button></li>)}</ul>}
    {selected&&<p className="font-semibold">Selected: {selected.label}</p>}
    {busy&&<p role="status">{source?'Processing…':'Preparing employment text…'}</p>}
    {source&&<>
     <label className="block font-semibold">Employment text
      <textarea readOnly rows={8} value={source.source_text} className="mt-1 block w-full rounded border p-2 font-normal"/>
     </label>
     {!source.source_text.trim()&&<p>No employment text is available. Add employment details before generating suggestions.</p>}
     <label className="flex items-start gap-2"><input type="checkbox" checked={confirmed} disabled={busy||!source.source_text.trim()} onChange={e=>setConfirmed(e.target.checked)}/><span>I have reviewed this employment text and want AI suggestions for it.</span></label>
     {!enabled&&<p role="status">Generation is unavailable right now. You can prepare and review the employment text.</p>}
    </>}
    {error&&<p role="alert" className="rounded bg-red-50 p-3 text-red-800">{error}</p>}
    {run?.status==='processing'&&<div role="status"><p>This record is already being processed.</p><button type="button" disabled={busy} onClick={check} className="underline">Check generation status</button></div>}
    {run?.status==='failed'&&<p role="alert">Generation could not be completed. Reload the text and try again.</p>}
    {run?.status==='completed'&&!run.source_changed&&<div role="status"><p>{run.suggestion_count} suggestion{run.suggestion_count===1?'':'s'} ready for review.</p><button type="button" disabled={busy} onClick={()=>{onReady({type:source.entity_type,id:source.entity_id});close()}} className="rounded bg-emerald-700 px-3 py-2 text-white">Review suggestions</button></div>}
    <div className="flex flex-wrap gap-3">
     <button type="button" disabled={busy} onClick={close} className="rounded border px-4 py-2">Cancel</button>
     {selected&&<button type="button" disabled={busy} onClick={()=>load(selected)} className="rounded border px-4 py-2">Reload employment text</button>}
     <button type="button" disabled={!enabled||busy||!confirmed||!source?.source_text.trim()||run?.status==='processing'||run?.status==='completed'} onClick={generate} className="rounded bg-indigo-700 px-4 py-2 text-white disabled:opacity-50">Generate suggestions</button>
    </div>
   </div>
  </AccessibleDialog>
 </>
}
