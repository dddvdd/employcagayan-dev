import {readFile} from 'node:fs/promises'
import {knowledgeDatabase} from './knowledge-database.js'
export const SKILL_GRAPH_MIGRATION='20261015033337_reviewed_skill_relationship_knowledge.sql'
export const SKILL_GRAPH_PRIVACY_MIGRATION='20261015035526_skill_relationship_curation_privacy.sql'
export async function skillGraphDatabase(){
 const db=await knowledgeDatabase()
 try{await db.exec(await readFile(new URL('../../supabase/migrations/'+SKILL_GRAPH_MIGRATION,import.meta.url),'utf8'));await db.exec(await readFile(new URL('../../supabase/migrations/'+SKILL_GRAPH_PRIVACY_MIGRATION,import.meta.url),'utf8'));return db}
 catch(e){await db.close();throw e}
}
