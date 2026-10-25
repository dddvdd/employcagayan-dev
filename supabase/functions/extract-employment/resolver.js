import {resolveSuggestions} from '../_shared/canonical-resolver.js'
const types={
 occupations:{table:'occupations',aliases:'occupation_aliases',key:'occupation_id'},
 skills:{table:'skills'},
 certifications:{table:'certifications'},industries:{table:'industries'},
 education_requirements:{table:'education_levels',name:'name'},
 experience_requirements:{table:'occupations',aliases:'occupation_aliases',key:'occupation_id'},
}
async function allActive(client,table,columns,ceiling){
 const rows=[],pageSize=500
 for(let offset=0;offset<=ceiling;offset+=pageSize){
  const {data,error}=await client.from(table).select(columns).eq('is_active',true).order('id').range(offset,offset+pageSize-1)
  if(error||!Array.isArray(data))throw Error('Active vocabulary unavailable')
  rows.push(...data)
  if(rows.length>ceiling)throw Error('Active vocabulary exceeds processing bound')
  if(data.length<pageSize)return rows
 }
 throw Error('Active vocabulary is incomplete')
}
export function createExtractionResolver(client){
 return async function resolve(extraction){
  const output={extraction_version:extraction.extraction_version},cache=new Map()
  for(const [category,config] of Object.entries(types)){
   if(!extraction[category]?.length){output[category]=[];continue}
   let vocabulary=cache.get(config.table)
   if(!vocabulary){
    const raw=await allActive(client,config.table,'id,'+(config.name??'canonical_name')+(config.name?'':',normalized_name'),5000)
    const entries=raw.map(row=>({...row,canonical_name:row[config.name??'canonical_name'],is_active:true}))
    const aliases=config.aliases?await allActive(client,config.aliases,'id,alias,normalized_alias,'+config.key,10000):[]
    vocabulary={entries,aliases};cache.set(config.table,vocabulary)
   }
   output[category]=resolveSuggestions(extraction[category],vocabulary.entries,vocabulary.aliases).map(item=>{
    // Keep ambiguity after bounding the displayed candidates; never pick a
    // canonical ID merely because the full candidate set is large.
    return {...item,candidate_matches:item.candidate_matches.slice(0,25)}
   })
  }
  return output
 }
}
