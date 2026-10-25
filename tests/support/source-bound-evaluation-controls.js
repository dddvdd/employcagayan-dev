import {digest,prepareDataset,caseFingerprint} from '../../scripts/lib/matching-evaluation-schema.mjs'
export function syntheticEvaluationControls(legacy){
 let dataset=structuredClone(legacy)
 dataset.dataset_version='matching-evaluation-v2';dataset.dataset_id='synthetic-source-bound-controls'
 for(const row of dataset.cases){
  const semantic=row.input.semantic
  delete row.input.semantic
  const jobHash=digest(row.input.jobseeker),vacHash=digest(row.input.vacancy)
  const [job,vacancy]=row.direction==='jobseeker_to_vacancy'?[row.query_id,row.item_id]:[row.item_id,row.query_id]
  const keyword={status:'available',reason:null,model_version:'keyword-fts-v1',text_config:'simple',
   score:row.id.includes('linked')?100:0,rank:row.id.includes('linked')?.1:0,query_term_count:1,
   matched_term_count:row.id.includes('linked')?1:0,matched_terms:row.id.includes('linked')?['synthetic']:[],qualification_credit:false,
   source_version:'matching-source-v1',jobseeker_source_hash:jobHash,vacancy_source_hash:vacHash}
  row.input.bound_signals={provenance:{kind:'synthetic_control',reference:'code-authored-protocol-control',sql_sha256:null},
   sources:{jobseeker:{version:'matching-source-v1',hash:jobHash},vacancy:{version:'matching-source-v1',hash:vacHash}},
   versions:{jobseeker:'jobseeker-semantic-v2',vacancy:'vacancy-semantic-v2'},event_alias:null,transport:'success',
   response:{jobseeker_alias:job,vacancy_alias:vacancy,event_alias:null,binding_version:'matching-signals-v1',status:'bound',
    observed_at:dataset.as_of,jobseeker_source_hash:jobHash,vacancy_source_hash:vacHash,
    knowledge_snapshot_hash:row.input.knowledge?.status==='available'?row.input.knowledge.snapshot.snapshot_hash:null,
    keyword,semantic:{status:semantic?.status??'missing',similarity:semantic?.similarity??null,
     embedding_version:'semantic-v2-authorized/jobseeker-semantic-v2+vacancy-semantic-v2'}}}
 }
 const labels=dataset.cases.map(row=>row.review)
 dataset=prepareDataset(dataset)
 dataset.cases.forEach((row,index)=>{row.review={...labels[index],input_sha256:caseFingerprint(dataset,row)}})
 return dataset
}
