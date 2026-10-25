import {readFile,mkdir,writeFile} from 'node:fs/promises'
import {parseEnv} from 'node:util'
import {fetchPsocReference} from './lib/psoc-reference.mjs'
try{
 let local={}
 try{local=parseEnv(await readFile(new URL('../.env.psa.local',import.meta.url),'utf8'))}
 catch(error){if(error.code!=='ENOENT')throw Error('Could not read the local PSA configuration')}
 const reference=await fetchPsocReference({token:process.env.PSA_PSOC_API_TOKEN||local.PSA_PSOC_API_TOKEN})
 const dir=new URL('../artifacts/psoc-reference-2012/',import.meta.url)
 await mkdir(dir,{recursive:true})
 const filename='psoc-2012-'+reference.retrieved_at.replace(/[:.]/g,'-')+'.json'
 await writeFile(new URL(filename,dir),JSON.stringify(reference,null,2),{flag:'wx'})
 console.log(JSON.stringify({saved_reference:filename,version:reference.version,complete:reference.complete,counts:reference.groups.map(group=>({level:group.level,count:group.rows.length}))}))
}catch{
 console.error('PSOC reference download failed. Check private configuration and documented completeness; diagnostics are withheld.')
 process.exitCode=1
}
