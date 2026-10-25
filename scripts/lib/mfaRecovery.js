// Trusted DEV operator workflow. All authority decisions live in the database;
// Auth administration only removes factors after a verified signed admin case.
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
function result(value, label) {
  if (value.error) throw new Error(`${label} failed (${value.error.code ?? value.error.status ?? 'request'})`)
  return value.data
}
export async function recoverPartnerMfa({ actor, operator, targetUserId, verificationReference, verificationMethod, identityVerified, requestId, onPrepared = () => {} }) {
  if (!uuid.test(targetUserId)) throw new Error('Valid recovery account ID required')
  const approved = requestId
    ? result(await actor.rpc('admin_mfa_recovery_status',{p_request_id:requestId}),'Recovery status')
    : result(await actor.rpc('admin_prepare_mfa_recovery',{
      p_target_user_id:targetUserId,p_verification_reference:verificationReference,
      p_verification_method:verificationMethod,p_identity_verified:identityVerified,
    }),'Administrator preparation')
  if (!approved || approved.target_user_id !== targetUserId || !uuid.test(approved.request_id)) throw new Error('Verified recovery target mismatch')
  onPrepared(approved.request_id)
  const user = result(await operator.auth.admin.getUserById(targetUserId),'Operator target verification').user
  if (user?.id !== targetUserId) throw new Error('Operator target mismatch')
  const marker = user.app_metadata?.mfa_recovery_request_id
  if (marker && marker !== approved.request_id) throw new Error('Another recovery operator hold is present')
  if (user.banned_until && new Date(user.banned_until).getTime() > Date.now() && marker !== approved.request_id) throw new Error('An unrelated account ban requires authorized review')
  if (approved.status === 'completed') {
    // A retry can lift only this request's recent, verified operator ban.
    if (!marker) return {requestId:approved.request_id,status:'completed'}
    if (!approved.completion_recent || !approved.operator_ban_matches) throw new Error('Completed recovery needs authorized operator review')
  } else if (approved.status === 'prepared') {
    result(await operator.auth.admin.updateUserById(targetUserId,{
      ban_duration:'24h',app_metadata:{mfa_recovery_request_id:approved.request_id},
    }),'Operator recovery ban')
    const { factors } = result(await operator.auth.admin.mfa.listFactors({userId:targetUserId}),'Operator factor inventory')
    for (const factor of factors) result(await operator.auth.admin.mfa.deleteFactor({userId:targetUserId,id:factor.id}),'Operator factor removal')
    const completed = result(await actor.rpc('admin_complete_mfa_recovery',{p_request_id:approved.request_id}),'Administrator completion')
    if (completed?.status !== 'completed' || completed.target_user_id !== targetUserId || !completed.operator_ban_matches) throw new Error('Recovery completion was not verified')
  } else throw new Error('Recovery state is not supported')
  const finalStatus = result(await actor.rpc('admin_mfa_recovery_status',{p_request_id:approved.request_id}),'Final recovery status')
  if (finalStatus?.target_user_id !== targetUserId || finalStatus.status !== 'completed' || !finalStatus.completion_recent || !finalStatus.operator_ban_matches) throw new Error('Recovery ban release was not freshly authorized')
  result(await operator.auth.admin.updateUserById(targetUserId,{
    ban_duration:'none',app_metadata:{mfa_recovery_request_id:null},
  }),'Operator ban release')
  return {requestId:approved.request_id,status:'completed'}
}
