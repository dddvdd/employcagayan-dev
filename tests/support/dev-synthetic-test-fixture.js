import { seedAccount, become } from './identity-database.js'
import { payload } from './recruitment-fixture.js'

// Unlike the general recruitment fixture, this pair has no event offering,
// event participation, employer login, referral or provider output.
export async function createDevSyntheticTestFixture(db) {
  const user = await seedAccount(db, { google: true, factor: true })
  await become(db, user)
  const profile = (await db.query('SELECT * FROM public.save_jobseeker_profile($1::jsonb)', [JSON.stringify(payload)])).rows[0]
  await db.exec('RESET ROLE')
  const companyName = 'Fictional DEV employer ' + crypto.randomUUID()
  const company = (await db.query(`
    INSERT INTO public.employers(company_name,registration_status,is_active,registration_source)
    VALUES($1,'approved',true,'admin') RETURNING id`, [companyName])).rows[0].id
  const vacancy = (await db.query(`
    INSERT INTO public.vacancy_definitions(
      employer_id,company_name,position,job_description,place_of_assignment,
      is_active,platform_status,published_at,created_source)
    VALUES($1,$2,'Fictional DEV vacancy',
      'Fictional online-only vacancy for guarded ownership testing.',
      'Tuguegarao City',true,'published',now(),'admin') RETURNING id`,
  [company, companyName])).rows[0].id
  return { user, profile, company, vacancy }
}
