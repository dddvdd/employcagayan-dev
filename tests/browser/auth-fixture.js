// Synthetic identities and unsigned JWT-shaped fixtures. They are accepted
// only by this intercepted browser, never sent to a Supabase service.
const USER_ID = '10000000-0000-4000-8000-000000000001'
export const PARTICIPANT_ID = '20000000-0000-4000-8000-000000000001'
const FACTOR_ID = '30000000-0000-4000-8000-000000000001'
const EMPLOYER_ID = '40000000-0000-4000-8000-000000000001'
const ACCREDITATION_ID = '50000000-0000-4000-8000-000000000001'
const encode = object => Buffer.from(JSON.stringify(object)).toString('base64url')

export async function mockAccount(context, options = {}) {
  const fixture = {
    userId: USER_ID,
    role: options.role || 'staff', level: options.level || 'aal1', method: options.method || 'password',
    active: options.active !== false, hasProfile: options.hasProfile !== false,
    employerAssociation: options.employerAssociation || (options.role === 'employer' && !options.unlinked), bootstrapFails: false,
    employerStatus: options.employerStatus || (options.role === 'employer' ? 'approved' : 'pending'),
    employerActive: options.employerActive !== false, associationCount: options.associationCount,
    applications: [], company: { id: EMPLOYER_ID, company_name:'Fixture Company',contact_person:'Fixture Person',contact_number:'09123456789',business_structure:'corporation',osh_classification:'low_risk',employer_type:'local_direct',address:'Fixture address' },
    requirements: ['letter_of_intent','company_profile','business_permit','bir_2303','sec_registration','philhealth_registration','pagibig_registration','sss_registration','dole_rule_1020','bosh_certificate','philjobnet_certificate'].map((key,index)=>({id:`60000000-0000-4000-8000-${String(index+1).padStart(12,'0')}`,requirement_key:key,status:'not_submitted'})),
    wrongBootstrapId: false, rejectCode: false, requests: [], deletedFactors: [],
    factors: options.enrolled === false ? [] : [{
      id: FACTOR_ID, factor_type: 'totp', status: 'verified', friendly_name: 'Fixture authenticator',
    }],
  }
  const user = () => ({
    id: fixture.userId, aud: 'authenticated', role: 'authenticated', email: 'fixture@example.invalid',
    email_confirmed_at: '2026-01-01T00:00:00Z', created_at: '2026-01-01T00:00:00Z',
    app_metadata: { provider: fixture.method === 'oauth' ? 'google' : 'email', providers: ['email', 'google'] },
    user_metadata: { role: options.metadataRole || 'applicant', name: 'Fixture Person', registration_intent: options.registrationIntent },
    identities: [{ provider: fixture.method === 'oauth' ? 'google' : 'email', user_id: fixture.userId }],
    factors: fixture.factors,
  })
  const session = () => ({
    access_token: `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({
      sub: fixture.userId, aud: 'authenticated', role: 'authenticated',
      session_id: `70000000-0000-4000-8000-${fixture.userId.slice(-12)}`,
      iss: 'https://cdmkzzmaswwiryymtycn.supabase.co/auth/v1',
      exp: Math.floor(Date.now() / 1000) + 3600, iat: Math.floor(Date.now() / 1000),
      aal: fixture.level, amr: [...(fixture.level==='aal2' ? [{method:'totp',timestamp:Math.floor(Date.now()/1000)}] : []),{ method: fixture.method, timestamp: Math.floor(Date.now() / 1000) }],
    })}.${Buffer.from('unsigned-fixture').toString('base64url')}`,
    token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600,
    refresh_token: 'unused-fixture-refresh', user: user(),
  })
  await context.addInitScript(category=>localStorage.setItem('employ_auth_category',category),options.authCategory || ((options.employerAssociation || options.registrationIntent==='employer' || options.role==='employer') ? 'partner' : 'jobseeker'))
  if (!options.signedOut) await context.addInitScript(value => {
    localStorage.setItem('sb-cdmkzzmaswwiryymtycn-auth-token', JSON.stringify(value))
  }, session())
  fixture.session = session
  await context.routeWebSocket(/supabase/, socket => socket.close())
  await context.route('**/*', async route => {
    const request = route.request()
    const url = new URL(request.url())
    if (['localhost', '127.0.0.1'].includes(url.hostname)) return route.continue()
    fixture.requests.push({ path: url.pathname, query: url.search, method: request.method() })
    const respond = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
    if (url.pathname === '/auth/v1/user') return respond(user())
    if (url.pathname === '/auth/v1/token') return respond(session())
    if (url.pathname === '/auth/v1/logout') return route.fulfill({ status: 204 })
    if (url.pathname === '/rest/v1/rpc/auth_account_bootstrap') {
      if (fixture.bootstrapFails) return respond({ code: 'FIXTURE', message: 'fixture failure' }, 503)
      return respond({ id: fixture.wrongBootstrapId ? 'other' : fixture.userId, role: fixture.role, is_active: fixture.active, full_name: 'Fixture Person',
        is_provincial: options.isProvincial === true, jurisdiction: options.jurisdiction || null,
        employer_association_count: fixture.associationCount ?? (fixture.employerAssociation ? 1 : 0),
        employer_application: fixture.employerAssociation ? {id:EMPLOYER_ID,registration_status:fixture.employerStatus,is_active:fixture.employerActive} : null,
        partner_authorized: ['staff','supervisor','admin','medical'].includes(fixture.role) || (fixture.role==='employer' && fixture.employerAssociation && fixture.employerStatus==='approved' && fixture.employerActive),
        jobseeker_authorized: fixture.role==='applicant' && fixture.method==='oauth' && !(fixture.employerAssociation && fixture.employerStatus==='approved'),
        mfa_required: ['staff','supervisor','admin','employer'].includes(fixture.role),
        mfa_satisfied: options.bootstrapMfaSatisfied ?? (!['staff','supervisor','admin','employer'].includes(fixture.role) || (fixture.level==='aal2' && fixture.factors.some(factor=>factor.factor_type==='totp' && factor.status==='verified'))),
        employer_mfa_satisfied: fixture.level==='aal2' && fixture.factors.some(factor=>factor.factor_type==='totp' && factor.status==='verified'),
      })
    }
    if (url.pathname === '/auth/v1/factors' && request.method() === 'POST') {
      const body = request.postDataJSON()
      fixture.factors.push({ id: FACTOR_ID, factor_type: 'totp', status: 'unverified', friendly_name: body.friendly_name })
      return respond({ id: FACTOR_ID, type: 'totp', totp: {
        qr_code: '<svg xmlns="http://www.w3.org/2000/svg" width="220" height="220"><rect width="220" height="220" fill="white"/><rect x="20" y="20" width="60" height="60" fill="black"/></svg>',
        secret: 'FIXTURE-ONLY-SETUP-KEY', uri: 'otpauth://totp/fixture?secret=FIXTURE',
      } })
    }
    if (url.pathname.endsWith('/challenge')) return respond({ id: 'fixture-challenge', type: 'totp', expires_at: Math.floor(Date.now() / 1000) + 60 })
    if (url.pathname.endsWith('/verify')) {
      if (fixture.rejectCode) return respond({ code: 'mfa_verification_failed', msg: 'Invalid authenticator code' }, 422)
      fixture.level = 'aal2'
      fixture.factors.forEach(factor => { factor.status = 'verified' })
      return respond(session())
    }
    if (url.pathname.startsWith('/auth/v1/factors/') && request.method() === 'DELETE') {
      fixture.deletedFactors.push(url.pathname.split('/').at(-1))
      fixture.factors = fixture.factors.filter(factor => factor.id !== fixture.deletedFactors.at(-1))
      return respond({ id: fixture.deletedFactors.at(-1) })
    }
    if (url.pathname === '/rest/v1/rpc/register_employer_application') {
      const body=request.postDataJSON().p_application
      fixture.applications.push(body)
      fixture.employerAssociation=true; fixture.employerStatus='pending'
      fixture.company={...fixture.company,...body,id:EMPLOYER_ID}
      return respond(EMPLOYER_ID)
    }
    if (url.pathname === '/rest/v1/employers') {
      if (request.method()==='PATCH') { fixture.company={...fixture.company,...request.postDataJSON()}; return respond([]) }
      return respond(fixture.employerAssociation ? [{...fixture.company,registration_status:fixture.employerStatus,registered_user_id:fixture.userId,is_active:fixture.employerActive}] : [])
    }
    if (url.pathname === '/rest/v1/employer_accreditation') return respond([{id:ACCREDITATION_ID,employer_id:EMPLOYER_ID,status:'pending',employer_accreditation_requirements:fixture.requirements}])
    if (url.pathname.startsWith('/storage/v1/object/accreditation-documents/')) return respond({Key:url.pathname.split('/object/')[1],Id:'fixture-upload'})
    if (url.pathname === '/rest/v1/rpc/submit_accreditation_document') {
      const body=request.postDataJSON()
      const requirement=fixture.requirements.find(row=>row.id===body.p_requirement_id)
      if(!requirement) return respond({code:'42501',message:'Requirement not found'},403)
      requirement.status='submitted'; requirement.document_path=body.p_path; requirement.original_filename=body.p_filename
      return respond(null)
    }
    if (url.pathname === '/rest/v1/participants') return respond(fixture.hasProfile ? [{ id: PARTICIPANT_ID, auth_user_id: USER_ID }] : [])
    if (url.pathname === '/rest/v1/rpc/get_or_create_participant') return respond({ id: PARTICIPANT_ID, auth_user_id: USER_ID, public_pass_id: 'fixture-pass' })
    if (url.pathname === '/rest/v1/jobseeker_profiles') return respond(fixture.hasProfile ? [{ participant_id: PARTICIPANT_ID, first_name: 'Fixture', last_name: 'Person' }] : [])
    return respond([])
  })
  return fixture
}
