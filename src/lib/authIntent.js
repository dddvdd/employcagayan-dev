// Routing preference only. Authorization always comes from the bootstrap.
const KEY='employ_auth_category'
export function rememberAuthCategory(category) {
  try { localStorage.setItem(KEY,category==='partner' ? 'partner' : 'jobseeker') } catch { /* Use the default destination. */ }
}
export function readAuthCategory() {
  try { return localStorage.getItem(KEY)==='partner' ? 'partner' : 'jobseeker' } catch { return 'jobseeker' }
}
