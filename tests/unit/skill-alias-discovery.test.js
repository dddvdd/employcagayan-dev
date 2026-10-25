import test from 'node:test'
import assert from 'node:assert/strict'
import {resolveSkillCandidates, normalizeSkillTerm} from '../../src/domain/skillAliasDiscovery.js'

const welding = {id:'skill-welding',canonical_name:'Welding',skill_type:'technical'}
const dataEntry = {id:'skill-data',canonical_name:'Supervise data entry',skill_type:'technical'}
const alias = (text, skill = welding, extra = {}) => ({
  skill_id:skill.id,canonical_name:skill.canonical_name,skill_type:skill.skill_type,
  alias_text:text,alias_normalized_name:normalizeSkillTerm(text),
  alias_type:'tesda_term',source_code:'TESDA',source_version:'2024',
  alias_id:'synthetic-alias-id',evidence_reference:'official-training-regulation#unit',
  review_status:'approved',...extra,
})

test('canonical exact ID has priority and reviewed exact terminology suggests that same ID', () => {
  assert.equal(resolveSkillCandidates(' ＷＥＬＤＩＮＧ ',[welding],[alias('Welding')])[0].discovery_kind,'canonical_exact')
  const result=resolveSkillCandidates('MMAW',[welding],[alias('MMAW')])
  assert.deepEqual(result.map(row=>row.id),[welding.id])
  assert.equal(result[0].discovery_kind,'approved_alias')
  assert.equal(result[0].selectable,true)
  assert.equal(result[0].provenance.alias_id,'synthetic-alias-id')
})

test('pending and rejected aliases never resolve; collisions require review', () => {
  for(const status of ['pending','rejected']) {
    assert.deepEqual(resolveSkillCandidates('SMAW',[],[alias('SMAW',welding,{review_status:status})]),[])
  }
  const other={id:'other',canonical_name:'Other welding process',skill_type:'technical'}
  const rows=resolveSkillCandidates('SMAW',[],[alias('SMAW'),alias('SMAW',other)])
  assert.equal(rows.length,2)
  assert.ok(rows.every(row=>row.discovery_kind==='ambiguous_alias'&&!row.selectable))
})

test('query coverage and Jaccard only generate unapproved suggestions', () => {
  const rows=resolveSkillCandidates('complaint resolution',[],[
    alias('complaint resolution management',welding),
  ])
  assert.equal(rows[0].discovery_kind,'fuzzy_suggestion')
  assert.equal(rows[0].suggestion_status,'unapproved')
  assert.equal(rows[0].selectable,false)
  assert.equal(rows[0].queryCoverage,1)
  assert.equal(rows[0].jaccard,2/3)
})

test('specialization and acronym traps never auto-resolve', () => {
  const cases=[
    ['arc welding','weld underwater'],
    ['Data entry','supervise data entry'],
    ['Call handling','CALL'],
  ]
  for(const [query,text] of cases) {
    const rows=resolveSkillCandidates(query,[],[alias(text)])
    assert.ok(rows.every(row=>!row.selectable),query)
    assert.ok(rows.every(row=>row.discovery_kind!=='approved_alias'),query)
  }
  const suggestions=resolveSkillCandidates('Data entry',[dataEntry],[])
  assert.equal(suggestions[0].discovery_kind,'canonical_suggestion')
  assert.equal(suggestions[0].selectable,false)
  assert.equal(suggestions[0].expandable,true)
})

test('ESCO candidates require pinned version, valid URI and review', () => {
  const concept='http://data.europa.eu/esco/skill/27d26fd6-5795-4f0a-884e-112df7c68314'
  const esco=alias('apply arc welding techniques',welding,{
    alias_type:'esco_preferred',source_code:'ESCO',source_version:'1.2.1',
    external_concept_uri:concept,
  })
  assert.equal(resolveSkillCandidates('apply arc welding techniques',[],[esco]).length,1)
  assert.deepEqual(resolveSkillCandidates('apply arc welding techniques',[],[{
    ...esco,source_version:'1.10',
  }]),[])
  assert.deepEqual(resolveSkillCandidates('apply arc welding techniques',[],[{
    ...esco,external_concept_uri:'http://data.europa.eu/esco/skill/not-a-uuid',
  }]),[])
})
