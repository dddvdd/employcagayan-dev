// Shared recorded-evidence interpretation for eligibility and scoring.
// Calendar-month evidence is inclusive; overlapping intervals count once.
export const DEFAULT_EDUCATION_RANKS = Object.freeze({
 elementary:10, elementary_grad:20, junior_high:30, junior_high_grad:40,
 senior_high:50, senior_high_grad:60, vocational:65, associate:70,
 bachelor:80, postgraduate:85, master:90, doctorate:100,
})
export function finiteNonNegative(value) {
 if(value==null||!['string','number'].includes(typeof value)||typeof value==='string'&&value.trim()==='')return null
 const number=Number(value)
 return Number.isFinite(number)&&number>=0?number:null
}
export function evidenceNeedsVerification(record) {
 return record?.verification_status!=null&&record.verification_status!=='verified'
}
export function educationEvidence(candidate={}) {
 const records=Array.isArray(candidate.education)?candidate.education:[]
 let rank=null,best=null,incomplete=false
 for(const row of records){
  const value=finiteNonNegative(row.rank??DEFAULT_EDUCATION_RANKS[row.level_code])
  if(value==null||value===0||!['graduated','completed',undefined,null].includes(row.status)){
   incomplete=true;continue
  }
  if(rank==null||value>rank){rank=value;best=row}
 }
 if(!records.length){
  const text=String(candidate.highest_educational_attainment||'').trim().toLowerCase()
  const legacy={
   'elementary graduate':20,'junior high school graduate':40,'high school graduate':40,
   'senior high school graduate':60,'vocational graduate':65,'tvet graduate':65,
   "associate's degree":70,'associate degree':70,'college graduate':80,
   "bachelor's degree":80,"bachelor's degree graduate":80,'bachelor degree':80,
   'postgraduate degree':85,"master's degree":90,'master degree':90,
   'doctorate':100,'doctoral degree':100,'phd':100,
  }
  rank=legacy[text]??null
 }
 return {rank,best,incomplete,unverified:evidenceNeedsVerification(best)}
}
const monthIndex=value=>{
 if(typeof value!=='string'||!/^\d{4}-\d{2}(?:-\d{2})?$/.test(value))return null
 const date=new Date(value.length===7?value+'-01T00:00:00Z':value+'T00:00:00Z')
 if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,value.length)!==value)return null
 return date.getUTCFullYear()*12+date.getUTCMonth()
}
export function experienceEvidence(candidate={}, {occupationId,industryId,currentDate}={}) {
 const date=new Date(currentDate??Date.now())
 if(!Number.isFinite(date.getTime()))throw new TypeError('A valid evaluation date is required')
 const today=date.getUTCFullYear()*12+date.getUTCMonth()
 const records=Array.isArray(candidate.work_experiences)?candidate.work_experiences:[]
 const intervals=[]
 let incomplete=false,classified=false,unverified=false
 for(const row of records){
  if((occupationId&&!row.occupation_id)||(industryId&&!row.industry_id)){incomplete=true;continue}
  classified=true
  if((occupationId&&row.occupation_id!==occupationId)||(industryId&&row.industry_id!==industryId))continue
  unverified ||= evidenceNeedsVerification(row)
  const start=monthIndex(row.start_date)
  const end=row.is_current===true?today:monthIndex(row.end_date)
  if(start==null||end==null||end<start||start>today){incomplete=true;continue}
  intervals.push([start,Math.min(end,today)])
 }
 intervals.sort((a,b)=>a[0]-b[0])
 let months=0,lastEnd=null
 for(const [start,end] of intervals){
  const first=lastEnd==null?start:Math.max(start,lastEnd+1)
  if(first<=end)months+=end-first+1
  lastEnd=lastEnd==null?end:Math.max(lastEnd,end)
 }
 if(intervals.length||classified&&!incomplete)return {months,incomplete,unverified}
 const legacy=finiteNonNegative(candidate.years_of_experience)
 if(!records.length&&!occupationId&&!industryId&&legacy!=null)return {months:legacy*12,incomplete:false,unverified:false}
 return {months:null,incomplete:true,unverified}
}
export function certificationValidity(record,currentDate) {
 if(record.is_valid===false)return false
 if(record.does_not_expire===true||record.is_valid===true)return true
 if(!record.expiration_date)return null
 const expires=new Date(record.expiration_date)
 if(!Number.isFinite(expires.getTime())||expires.toISOString().slice(0,10)!==record.expiration_date)return null
 // A date-only expiration remains valid through its calendar day.
 const date=new Date(currentDate)
 return record.expiration_date>=date.toISOString().slice(0,10)
}
