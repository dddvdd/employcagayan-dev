import {seedAccount,become} from './identity-database.js'
export const payload={first_name:'Fixture',last_name:'Recruitment',email:'fixture@example.invalid',data_subject_rights_agreed:true,birthdate:'2000-01-01'}
export async function createRecruitmentFixture(db) {
 const user=await seedAccount(db,{google:true,factor:true})
 await become(db,user)
 const profile=(await db.query('SELECT * FROM public.save_jobseeker_profile($1::jsonb)',[JSON.stringify(payload)])).rows[0]
 const owner=await seedAccount(db,{role:'employer',factor:true})
 await db.exec('RESET ROLE')
 const company=(await db.query("INSERT INTO public.employers(registered_user_id,company_name,registration_status,is_active) VALUES($1,'Fixture employer','approved',true) RETURNING id",[owner.id])).rows[0].id
 const event=(await db.query("INSERT INTO public.events(event_name,event_date,location) VALUES('Fixture event','2026-10-13','Tuguegarao City') RETURNING id")).rows[0].id
 const vacancy=(await db.query("INSERT INTO public.vacancy_definitions(employer_id,company_name,position,job_description,place_of_assignment,is_active,platform_status,published_at) VALUES($1,'Fixture employer',$2,'Synthetic vacancy description with enough detail for the published job.','Tuguegarao City',true,'published',now()) RETURNING id",[company,'Fixture vacancy '+owner.id])).rows[0].id
 const offering=(await db.query('INSERT INTO public.event_vacancies(event_id,vacancy_definition_id) VALUES($1,$2) RETURNING id',[event,vacancy])).rows[0].id
 const participation=(await db.query("INSERT INTO public.event_participations(participant_id,event_id,check_in_status,check_in_time) VALUES($1,$2,'checked_in',now()) RETURNING id",[profile.participant_id,event])).rows[0].id
 await db.query("INSERT INTO public.participation_vacancies(participation_id,event_vacancy_id,preference_type) VALUES($1,$2,'local')",[participation,offering])
 return {user,profile,owner,company,event,vacancy,offering,participation}
}
