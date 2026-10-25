const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const states=['pending','approved','rejected']
const id=value=>typeof value==='string'&&uuid.test(value)
const revision=value=>Number.isSafeInteger(value)&&value>0
function fail(error,fallback){
 const e=new Error(error?.code==='55000'?'This relationship or source changed. Reload it before reviewing.':error?.code==='42501'?'Your current session cannot review this relationship. Refresh your access and try again.':fallback)
 if(error?.code)e.code=error.code
 throw e
}
function validRow(row,identityFields){return row&&id(row.id)&&identityFields.every(field=>id(row[field]))&&states.includes(row.review_status)&&revision(row.revision)}
export function knowledgeReviewState(row,{left=row.occupation,right=row.skill,kinds=['essential','optional']}={}){
 if(row.review_status!=='approved')return row.review_status==='rejected'?'Rejected':'Pending review'
 return row.is_active!==false&&left?.is_active&&right?.is_active&&row.taxonomy_source?.is_active&&row.reviewed_by&&row.reviewed_at&&row.evidence_reference?.trim()&&row.source_version?.trim()&&row.source_version.trim()===row.taxonomy_source.version?.trim()&&kinds.includes(row.relationship_type)?'Approved':'Needs source review'
}
export function createKnowledgeReviewService({getClient,table,columns,identityFields,reviewRpc,historyRpc}){
 return {
  async list(status='pending',page=0){
   if(!states.includes(status)&&status!=='all'||!Number.isSafeInteger(page)||page<0||page>10000)throw Error('Choose an available review filter.')
   const client=await getClient();let query=client.from(table).select(columns).order('id')
   if(status!=='all')query=query.eq('review_status',status)
   const {data,error}=await query.range(page*25,page*25+25)
   if(error||!Array.isArray(data)||data.length>26||data.some(row=>!validRow(row,identityFields)))fail(error,'Unable to load knowledge relationships. Try again.')
   return {rows:data.slice(0,25),hasMore:data.length>25}
  },
  async get(relationshipId){
   if(!id(relationshipId))throw Error('Choose an available relationship.')
   const client=await getClient(),{data,error}=await client.from(table).select(columns).eq('id',relationshipId).maybeSingle()
   if(error||!validRow(data,identityFields)||data.id!==relationshipId)fail(error,'Unable to reload this relationship. It may have been removed.')
   return data
  },
  async sources(){
   const client=await getClient(),rows=[]
   for(let start=0;start<=1000;start+=100){
    const {data,error}=await client.from('taxonomy_sources').select('id,code,name,version,is_active').eq('is_active',true).order('id').range(start,start+99)
    if(error||!Array.isArray(data)||data.some(row=>!row||!id(row.id)||row.is_active!==true))fail(error,'Unable to load versioned sources. Try again.')
    rows.push(...data);if(rows.length>1000)throw Error('Source catalog exceeds the review limit.')
    if(data.length<100)return rows.filter(row=>typeof row.version==='string'&&row.version.trim()).sort((a,b)=>(a.code??'').localeCompare(b.code??'')||a.id.localeCompare(b.id))
   }
   throw Error('Source catalog is incomplete.')
  },
  async review({id:relationshipId,revision:expected,action,sourceId,sourceVersion,evidence}){
   const reference=typeof evidence==='string'?evidence.trim():'',version=typeof sourceVersion==='string'?sourceVersion.trim():null
   if(!id(relationshipId)||!revision(expected)||!['approve','reject'].includes(action)||!reference||[...reference].length>1000)throw Error('Choose a decision and record a reference or reason of at most 1,000 characters.')
   if(action==='approve'&&(!id(sourceId)||!version||[...version].length>128))throw Error('Choose an active source with a published version.')
   const client=await getClient(),{data,error}=await client.rpc(reviewRpc,{p_relationship_id:relationshipId,p_expected_revision:expected,p_action:action,p_taxonomy_source_id:action==='approve'?sourceId:null,p_source_version:action==='approve'?version:null,p_evidence_reference:reference})
   if(error)fail(error,'Unable to save this review. Try again.')
   if(data?.id!==relationshipId||data.review_status!==(action==='approve'?'approved':'rejected')||!revision(data.revision)||data.revision<=expected)throw Error('Review did not return a confirmed result. Reload the relationship.')
   return data
  },
  async history(relationshipId,after=0,limit=20){
   if(!id(relationshipId)||!Number.isSafeInteger(after)||after<0||!Number.isSafeInteger(limit)||limit<1||limit>200)throw Error('Choose an available history page.')
   const client=await getClient(),{data,error}=await client.rpc(historyRpc,{p_relationship_id:relationshipId,p_after_revision:after,p_limit:limit})
   if(error||!Array.isArray(data)||data.length>limit||data.some((row,index)=>!row||row.relationship_id!==relationshipId||!revision(row.revision)||row.revision<=(index?data[index-1].revision:after)||!['baseline','INSERT','UPDATE','DELETE'].includes(row.operation)))fail(error,'Unable to load review history. Try again.')
   return data
  },
 }
}

export {id as isKnowledgeId,fail as knowledgeError}
