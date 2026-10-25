import { readFile } from 'node:fs/promises'
import { identityDatabase } from './identity-database.js'

export const PROFILE_MIGRATION='20261012081407_explicit_profile_consent_and_education.sql'
const quote=value=>`"${value.replaceAll('"','""')}"`
const load=async name=>JSON.parse(await readFile(new URL(`../../artifacts/profile-milestone-20261012/${name}`,import.meta.url),'utf8'))

export const QUALIFICATION_MIGRATION='20261012084343_qualification_provenance_guards.sql'

export async function profileDatabase({applyFix=true,applyQualificationFix=true}={}) {
  const db=await identityDatabase()
  const catalog=await load('dev-profile-catalog.json'),references=await load('dev-reference-policies.json')
  for(const table of ['education_levels','jobseeker_education','skills','jobseeker_skills','languages','jobseeker_languages','work_experiences']) {
    const columns=catalog.columns.filter(column=>column.table===table)
    await db.exec(`CREATE TABLE public.${quote(table)} (${columns.map(column=>`${quote(column.name)} ${column.type==='ARRAY' ? 'text[]' : column.type}${column.default ? ` DEFAULT ${column.default}` : ''}${column.nullable==='NO' ? ' NOT NULL' : ''}`).join(',')})`)
    if(!catalog.constraints.some(item=>item.table===table && item.definition.startsWith('PRIMARY KEY'))) await db.exec(`ALTER TABLE public.${quote(table)} ADD PRIMARY KEY(id)`)
    await db.exec(`ALTER TABLE public.${quote(table)} ENABLE ROW LEVEL SECURITY; GRANT SELECT,INSERT,UPDATE,DELETE ON public.${quote(table)} TO authenticated`)
  }
  for(const constraint of catalog.constraints.filter(item=>!item.definition.startsWith('PRIMARY KEY') || item.table!=='jobseeker_profiles')) {
    await db.exec(`ALTER TABLE public.${quote(constraint.table)} ADD CONSTRAINT ${quote(constraint.name)} ${constraint.definition}`)
  }
  for(const policy of references.policies) {
    await db.exec(`CREATE POLICY ${quote(policy.name)} ON public.${quote(policy.table)} AS ${policy.permissive} FOR ${policy.cmd} TO ${policy.roles.map(role=>role==='public' ? 'PUBLIC' : quote(role)).join(',')} ${policy.using ? `USING (${policy.using})` : ''} ${policy.check ? `WITH CHECK (${policy.check})` : ''}`)
  }
  for(const level of references.education_levels) await db.query('INSERT INTO public.education_levels(code,name,rank,is_active) VALUES($1,$2,$3,$4)',[level.code,level.name,level.rank,level.is_active])
  await db.exec(references.set_updated_at)
  for(const fn of catalog.functions.filter(item=>['registration_education_code','sync_registration_education','sync_registration_education_trigger'].includes(item.name))) await db.exec(fn.definition)
  await db.exec('CREATE UNIQUE INDEX jobseeker_education_registration_slot_key ON public.jobseeker_education(jobseeker_profile_id,registration_slot) WHERE registration_slot IS NOT NULL')
  for(const trigger of catalog.triggers) await db.exec(trigger.definition)
  for(const file of ['20261012041121_audited_admin_mfa_recovery.sql','20261012044405_recovery_explicit_session_revocation.sql',...(applyFix ? [PROFILE_MIGRATION] : []),...(applyQualificationFix ? [QUALIFICATION_MIGRATION] : [])]) await db.exec(await readFile(new URL(`../../supabase/migrations/${file}`,import.meta.url),'utf8'))
  return db
}
