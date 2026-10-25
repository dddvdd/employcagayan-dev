import {upload as storageUpload,remove as storageRemove,download as storageDownload,STORAGE_BUCKETS} from '../storage/storageService'
export const RESUME_MAX_BYTES=5*1024*1024
export async function uploadResume({userId,file}) {
 if(!userId || !file || !Number.isFinite(file.size) || file.size<5 || file.size>RESUME_MAX_BYTES) throw new Error('Choose a PDF no larger than 5 MB')
 if(file.type && file.type!=='application/pdf') throw new Error('Choose a PDF resume')
 const signature=await file.slice(0,5).text()
 if(signature!=='%PDF-') throw new Error('Choose a valid PDF resume')
 const path=userId+'/'+crypto.randomUUID()+'.pdf'
 await storageUpload(STORAGE_BUCKETS.RESUMES,path,file,{contentType:'application/pdf',cacheControl:'0',upsert:false})
 return path
}
export async function removeResume(path) {
 if(path)await storageRemove(STORAGE_BUCKETS.RESUMES,[path])
}
export async function rollbackResume(path) {return removeResume(path).catch(()=>{})}
export function downloadResume(path) {return storageDownload(STORAGE_BUCKETS.RESUMES,path)}
export async function downloadResumeFile(path) {
 const blob=await downloadResume(path)
 const url=URL.createObjectURL(blob),link=document.createElement('a')
 link.href=url;link.download='resume.pdf';document.body.appendChild(link);link.click();link.remove()
 setTimeout(()=>URL.revokeObjectURL(url),60000)
}
export const resumeStorage={uploadResume,removeResume,rollbackResume,downloadResume,downloadResumeFile}
