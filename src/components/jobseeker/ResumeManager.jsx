import {useEffect,useRef,useState} from 'react'
import {toast} from 'sonner'
import {participantService} from '../../services/participantService'
import {resumeStorage} from '../../services/resumeStorage'
import ConfirmActionDialog from '../ui/ConfirmActionDialog.jsx'
export default function ResumeManager({userId,initialPath}) {
 const [path,setPath]=useState(initialPath||null),[busy,setBusy]=useState(false),[removeOpen,setRemoveOpen]=useState(false),[cleanup,setCleanup]=useState([])
 const input=useRef(null)
 useEffect(()=>{setPath(initialPath||null)},[initialPath])
 async function cleanupFile(previous) {
  if(!previous)return
  try {await resumeStorage.removeResume(previous)}
  catch {setCleanup(old=>[...new Set([...old,previous])])}
 }
 async function upload(event) {
  const file=event.target.files?.[0];event.target.value=''
  if(!file || busy)return
  setBusy(true);let uploaded
  try {
   uploaded=await resumeStorage.uploadResume({userId,file})
   const saved=await participantService.setResume(uploaded,path)
   setPath(saved.resume_path)
   await cleanupFile(saved.previous_resume_path)
   toast.success('Resume saved')
  } catch(error) {
   if(uploaded)await cleanupFile(uploaded)
   toast.error(uploaded?'Your resume could not be saved. Reload the profile and try again.':error.message||'Could not upload your resume')
  } finally {setBusy(false)}
 }
 async function remove() {
  setBusy(true)
  try {
   const saved=await participantService.setResume(null,path)
   setPath(null);setRemoveOpen(false);await cleanupFile(saved.previous_resume_path)
   toast.success('Resume removed from your profile')
  } catch {throw new Error('Your resume could not be removed. Reload the profile and try again.')}
  finally {setBusy(false)}
 }
 async function download() {
  setBusy(true)
  try {await resumeStorage.downloadResumeFile(path)}
  catch {toast.error('Your resume could not be downloaded. Please try again.')}
  finally {setBusy(false)}
 }
 async function retryCleanup() {
  setBusy(true);const remaining=[]
  for(const old of cleanup){try{await resumeStorage.removeResume(old)}catch{remaining.push(old)}}
  setCleanup(remaining);setBusy(false)
 }
 return <section aria-labelledby="resume-title" className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800">
  <h2 id="resume-title" className="text-sm font-bold text-slate-900 dark:text-slate-100">Resume (optional)</h2>
  <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">PDF, up to 5 MB. Approved employers can download it while you have an active application with them. PESO access follows its authorized scope.</p>
  <p role="status" className="mt-2 text-sm font-medium text-slate-700 dark:text-slate-200">{busy?'Working on your resume…':path?'A resume is attached to your profile.':'No resume attached.'}</p>
  <input ref={input} aria-label="Choose PDF resume" type="file" accept="application/pdf,.pdf" onChange={upload} disabled={busy} className="sr-only" />
  <div className="mt-3 flex flex-wrap gap-2">
   <button type="button" onClick={()=>input.current?.click()} disabled={busy} className="min-h-11 rounded-lg bg-blue-700 px-4 text-sm font-semibold text-white disabled:opacity-50">{path?'Replace resume':'Upload resume'}</button>
   {path&&<><button type="button" onClick={download} disabled={busy} className="min-h-11 rounded-lg border border-slate-400 px-4 text-sm font-semibold text-slate-800 disabled:opacity-50 dark:text-slate-100">Download resume</button><button type="button" onClick={()=>setRemoveOpen(true)} disabled={busy} className="min-h-11 rounded-lg border border-red-400 px-4 text-sm font-semibold text-red-700 disabled:opacity-50 dark:text-red-300">Remove resume</button></>}
  </div>
  {cleanup.length>0&&<div role="alert" className="mt-3 text-sm text-amber-800 dark:text-amber-200"><p>A previous upload still needs cleanup. Your profile reflects the saved resume above.</p><button type="button" onClick={retryCleanup} disabled={busy} className="min-h-11 font-semibold underline">Retry file cleanup</button></div>}
  <ConfirmActionDialog open={removeOpen} onClose={()=>setRemoveOpen(false)} onConfirm={remove} confirmLabel="Remove" title="Remove your resume?" description="This removes the resume from your profile and attempts to delete your uploaded file. You can upload another resume later." itemLabel="your resume" />
 </section>
}
