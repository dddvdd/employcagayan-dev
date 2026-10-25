import {useEffect,useState} from 'react'
import {Navigate} from 'react-router-dom'
import {useAuth} from '../../contexts/AuthContext.jsx'
import AccessibleDialog from '../../components/ui/AccessibleDialog.jsx'
import KnowledgeReviewContent from '../../components/knowledge/KnowledgeReviewContent.jsx'
import {skillRelationshipService as api,skillRelationshipReviewState} from '../../services/skillRelationshipService.js'
const input='mt-1 w-full rounded-lg border border-slate-300 bg-white p-2 text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100'
const button='rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium disabled:opacity-50 dark:border-slate-600'
const left=row=>row.source_skill?.canonical_name??'Unavailable skill'
const right=row=>row.target_skill?.canonical_name??'Unavailable skill'
const config={
 title:'Skill relationship review',reviewTitle:'Review skill relationship',
 description:'Create and review source-based related or transferable skill links. These links provide context and do not verify a person’s qualifications.',
 reviewDescription:'Related links work in both directions. Transferable links follow the displayed arrow. Approval does not verify a jobseeker’s target skill or satisfy a vacancy requirement.',
 activeMessage:'Approval requires two active skills, an active relationship and a versioned source.',
 leftName:left,rightName:right,label:row=>left(row)+(row.relationship_type==='related'?' ↔ ':' → ')+right(row),
 isActive:row=>row.is_active!==false&&!!row.source_skill?.is_active&&!!row.target_skill?.is_active,
 reviewState:skillRelationshipReviewState,
}
function SkillChoice({side,label,value,onChange,disabled}){
 const [query,setQuery]=useState(''),[rows,setRows]=useState([]),[busy,setBusy]=useState(false),[error,setError]=useState('')
 useEffect(()=>{
  let current=true
  if(value||query.trim().length<2){setRows([]);setBusy(false);setError('');return}
  setBusy(true)
  const timer=setTimeout(()=>api.searchSkills(query).then(data=>{if(current){setRows(data);setError('')}}).catch(e=>{if(current){setRows([]);setError(e.message)}}).finally(()=>{if(current)setBusy(false)}),250)
  return()=>{current=false;clearTimeout(timer)}
 },[query,value])
 const id='choose-skill-'+side
 return <div><label htmlFor={id} className="block text-sm font-medium">{label}</label><input id={id} className={input} value={query} disabled={disabled} onChange={e=>{setQuery(e.target.value);onChange(null)}} autoComplete="off" placeholder="Search active skills"/>
  {value&&<p className="mt-1 text-sm text-green-700 dark:text-green-300">Selected: {value.canonical_name}</p>}
  {busy&&<p role="status" className="mt-1 text-sm">Searching skills…</p>}
  {error&&<p role="alert" className="mt-1 text-sm text-red-700">{error}</p>}
  {!value&&rows.length>0&&<ul aria-label={label+' search results'} className="mt-2 max-h-40 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700">{rows.map(row=><li key={row.id}><button type="button" className="w-full px-3 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800" disabled={disabled} onClick={()=>{setQuery(row.canonical_name);onChange(row);setRows([])}}>{row.canonical_name}</button></li>)}</ul>}
  {!busy&&!value&&query.trim().length>=2&&!rows.length&&!error&&<p className="mt-1 text-sm text-slate-500">No active skills match this search.</p>}
 </div>
}
function CreateRelationshipDialog({onClose,onCreated}){
 const [kind,setKind]=useState('related'),[first,setFirst]=useState(null),[second,setSecond]=useState(null)
 const [confirmed,setConfirmed]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('')
 const different=first&&second&&first.id!==second.id
 async function save(event){
  event.preventDefault();if(!different||!confirmed||busy)return
  setBusy(true);setError('')
  try{onCreated(await api.create({first,second,kind}))}catch(e){setError(e.message);setBusy(false)}
 }
 return <AccessibleDialog open onClose={onClose} closeDisabled={busy} labelledBy="create-skill-link-title" className="max-w-2xl">
  <div className="flex items-start justify-between gap-3"><h2 id="create-skill-link-title" className="text-xl font-bold">Create skill relationship</h2><button type="button" className={button} disabled={busy} onClick={onClose} aria-label="Close draft creation">Close</button></div>
  <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">Save a pending draft, then review it against a versioned source. Creation does not approve the link.</p>
  <form onSubmit={save} className="mt-4 space-y-4">
   <label className="block text-sm font-medium">Relationship type<select className={input} value={kind} disabled={busy} onChange={e=>{setKind(e.target.value);setConfirmed(false)}}><option value="related">Related — two-way context</option><option value="transferable">Transferable — source to target</option></select></label>
   <SkillChoice side="first" label={kind==='related'?'First skill':'Source skill'} value={first} onChange={value=>{setFirst(value);setConfirmed(false)}} disabled={busy}/>
   <SkillChoice side="second" label={kind==='related'?'Second skill':'Target skill'} value={second} onChange={value=>{setSecond(value);setConfirmed(false)}} disabled={busy}/>
   {first&&second&&<p className="rounded-lg bg-slate-100 p-3 text-sm dark:bg-slate-800">{first.canonical_name}{kind==='related'?' ↔ ':' → '}{second.canonical_name}</p>}
   {first&&second&&!different&&<p role="alert" className="text-sm text-red-700">Choose two different skills.</p>}
   <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={confirmed} disabled={busy||!different} onChange={e=>setConfirmed(e.target.checked)}/>I want to save this relationship as a pending draft.</label>
   {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
   <button type="submit" className={button+' bg-indigo-700 text-white'} disabled={!different||!confirmed||busy}>{busy?'Saving draft…':'Save draft'}</button>
  </form>
 </AccessibleDialog>
}
function SkillRelationshipContent(){
 const [creating,setCreating]=useState(false),[created,setCreated]=useState(null),[refresh,setRefresh]=useState(0)
 return <><KnowledgeReviewContent key={refresh} api={api} config={config} initialSelection={created} initialNotice={created?'Draft saved for review.':''} headerAction={<button type="button" className={button} onClick={()=>setCreating(true)}>Create relationship</button>}/>
  {creating&&<CreateRelationshipDialog onClose={()=>setCreating(false)} onCreated={row=>{setCreating(false);setCreated(row);setRefresh(n=>n+1)}}/>}</>
}
export default function SkillRelationshipsPage(){
 const {user,profile}=useAuth()
 return profile?.role==='admin'?<SkillRelationshipContent key={user?.id}/>:<Navigate to="/" replace/>
}
