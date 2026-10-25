const VERSION_ID = '93000000-0000-4000-8000-000000000001'

const units = [
  { official_code: '0201500000', name: 'Cagayan', parent_code: '0200000000', structural_kind: 'Prov' },
  { official_code: '0203100000', name: 'Isabela', parent_code: '0200000000', structural_kind: 'Prov' },
  { official_code: '0201529000', name: 'Tuguegarao City', parent_code: '0201500000', structural_kind: 'City' },
  { official_code: '0201501000', name: 'Abulug', parent_code: '0201500000', structural_kind: 'Mun' },
  { official_code: '0203129000', name: 'Ilagan City', parent_code: '0203100000', structural_kind: 'City' },
  { official_code: '0201529001', name: 'Annafunan East', parent_code: '0201529000', structural_kind: 'Bgy' },
  { official_code: '0201501010', name: 'Libertad', parent_code: '0201501000', structural_kind: 'Bgy' },
  { official_code: '0203129001', name: 'Alibagu', parent_code: '0203129000', structural_kind: 'Bgy' },
]

export async function mockGeography(context) {
  const requests = []
  await context.route('https://psgc.cloud/**', route => route.abort('blockedbyclient'))
  await context.route('https://psgc.gitlab.io/**', route => route.abort('blockedbyclient'))
  await context.route('**/rest/v1/geography_reference_versions?**', route => {
    requests.push(new URL(route.request().url()))
    return route.fulfill({ status: 200, json: { id: VERSION_ID } })
  })
  await context.route('**/rest/v1/geography_units?**', route => {
    const url = new URL(route.request().url())
    requests.push(url)
    const kindFilter = url.searchParams.get('structural_kind') || ''
    const parentCode = url.searchParams.get('parent_code')?.replace(/^eq\./, '')
    const rows = units.filter(row => kindFilter.includes(row.structural_kind) && (!parentCode || row.parent_code === parentCode))
    return route.fulfill({ status: 200, json: rows.map(({ structural_kind, ...row }) => row) })
  })
  return requests
}
