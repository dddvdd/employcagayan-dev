import {randomUUID} from 'node:crypto'
import {createRecruitmentFixture} from './recruitment-fixture.js'
export async function intelligenceFixture(db){
 const f=await createRecruitmentFixture(db);await db.exec('RESET ROLE')
 const skill=(await db.query('INSERT INTO public.skills(canonical_name,normalized_name) VALUES($1,$2) RETURNING id',['Synthetic skill '+randomUUID(),'synthetic '+randomUUID()])).rows[0].id
 const certification=(await db.query('INSERT INTO public.certifications(canonical_name,normalized_name) VALUES($1,$2) RETURNING id',['Synthetic certification '+randomUUID(),'synthetic '+randomUUID()])).rows[0].id
 const run=(await db.query("INSERT INTO public.ai_extraction_runs(entity_type,entity_id,extraction_type,provider,model,input_hash) VALUES('jobseeker_profile',$1,'profile','mock','synthetic',$2) RETURNING id",[f.profile.participant_id,randomUUID()])).rows[0].id
 const suggestion=(await db.query("INSERT INTO public.ai_extraction_suggestions(run_id,entity_type,entity_id,suggestion_type,raw_term,canonical_id,canonical_name) VALUES($1,'jobseeker_profile',$2,'skill','Synthetic skill',$3,'Synthetic skill') RETURNING id",[run,f.profile.participant_id,skill])).rows[0].id
 const hasRevision=(await db.query("SELECT to_regprocedure('public.get_embedding_source_revision(public.entity_type,uuid)') IS NOT NULL AS present")).rows[0].present
 const revision=hasRevision?(await db.query("SELECT public.get_embedding_source_revision('jobseeker_profile',$1) AS revision",[f.profile.participant_id])).rows[0].revision:0
 const embedding=(await db.query("INSERT INTO public.employment_embeddings(entity_type,entity_id,embedding_type,source_text,source_hash,embedding,status"+(hasRevision?",source_revision":"")+") VALUES('jobseeker_profile',$1,'jobseeker_match_profile','Synthetic evidence',$2,'[0.1]','current'"+(hasRevision?",$3":"")+") RETURNING id",[f.profile.participant_id,randomUUID(),...(hasRevision?[revision]:[])])).rows[0].id
 return {...f,skill,certification,run,suggestion,embedding}
}
