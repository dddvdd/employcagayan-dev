// Canonical IDs are authority. Labels only support unambiguous legacy payloads
// where neither side carries an ID; this never resolves text into a taxonomy.
const text=value=>typeof value==='string'?value.normalize('NFKC').trim().toLowerCase().replace(/\s+/gu,' '):''
const id=value=>typeof value==='string'?value.trim():''
export function findQualification(records,requirement,idKey,{label='canonical_name',code=null}={}){
 if(!requirement||typeof requirement!=='object')return null
 const rows=(Array.isArray(records)?records:[]).filter(row=>row&&typeof row==='object')
 const requiredId=id(requirement[idKey])
 let matches
 if(requiredId)matches=rows.filter(row=>id(row[idKey])===requiredId)
 else{
  const legacy=rows.filter(row=>!id(row[idKey]))
  const requiredCode=code?text(requirement[code]):''
  if(requiredCode)matches=legacy.filter(row=>text(row[code])===requiredCode)
  else{
   const requiredLabel=text(requirement[label])
   matches=requiredLabel?legacy.filter(row=>(!code||!text(row[code]))&&text(row[label])===requiredLabel):[]
  }
 }
 return matches.length===1?matches[0]:null
}
