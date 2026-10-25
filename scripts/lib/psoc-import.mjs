// Prepare a pinned, additive import from a verified official API snapshot. No network/database adapter.
import {createHash} from 'node:crypto'
import {validatePsocGroup, PSOC_GROUPS} from './psoc-reference.mjs'
import {normalizeTerm} from '../../src/domain/canonicalResolver.js'
const hash = text => createHash('sha256').update(text).digest('hex')
const counts = Object.freeze({major:10, 'sub-major':43, minor:130, unit:466})
const sourceCode = 'PSOC_2022'
// Captured from the authenticated official download and independently rechecked before DEV import.
export const PSOC_2022_RECORD_HASHES = Object.freeze({
 major:'a19d82e2fdda0b20a83ca3e88effba18d441e0ba8a15f08fead95ab483b1b105',
 'sub-major':'60cf101b9d27c0939192d10929270d9e53ffb5b9ad3f16ec31377154bdd0c550',
 minor:'330e2b31a7d246a1b3b6aca2b24cb2b5899a496fbaeba66ca60a47e853883e72',
 unit:'e6df1b2b47efc9925c0b85733510f1504911c20d2ba201b228112feb96744eeb',
})
export function preparePsocImport(snapshot, {snapshotSha256} = {}) {
 if (snapshot?.format !== 'psa-reference-staging-v1' || snapshot.catalog !== 'psoc' || snapshot.version !== '2022' ||
  snapshot.source_origin !== 'https://classification.psa.gov.ph' || snapshot.download_complete !== true ||
  !/^[a-f0-9]{64}$/.test(snapshotSha256 ?? '') || !Array.isArray(snapshot.levels) || snapshot.levels.length !== 4)
  throw Error('Verified PSOC 2022 API snapshot required')
 const rows = [], seen = new Set()
 for (const spec of PSOC_GROUPS) {
  const matches = snapshot.levels.filter(level => level.level === spec.endpoint)
  if (matches.length !== 1) throw Error('PSOC reference levels are incomplete')
  const level = matches[0]
  if (level.download_complete !== true || level.declared_count !== counts[spec.endpoint] ||
   level.records_sha256 !== PSOC_2022_RECORD_HASHES[spec.endpoint] ||
   level.records_sha256 !== hash(JSON.stringify(level.records))) throw Error('PSOC reference count/hash mismatch')
  let offset = 0
  if (!Array.isArray(level.pages) || !level.pages.length) throw Error('PSOC pagination evidence required')
  for (let index=0; index<level.pages.length; index++) {
   const page=level.pages[index]
   if (page.page !== index+1 || !Number.isSafeInteger(page.count) || page.count < 0 || page.count > 1000 ||
    page.records_sha256 !== hash(JSON.stringify(level.records.slice(offset,offset+page.count)))) throw Error('PSOC page evidence mismatch')
   offset += page.count
  }
  if (offset !== level.records.length) throw Error('PSOC pagination is incomplete')
  const normalized = validatePsocGroup(level.records,{...spec,expected:counts[spec.endpoint]},'2022')
  for (let index=0; index<normalized.length; index++) {
   const row=normalized[index], original=level.records[index]
   for (const ancestor of PSOC_GROUPS.filter(group=>group.width<spec.width)) {
    if (!/^\d+$/.test(String(original[ancestor.field])) ||
     String(original[ancestor.field]).padStart(ancestor.width,'0') !== row.code.slice(0,ancestor.width))
     throw Error('PSOC explicit parent disagrees with its code')
   }
   if (seen.has(row.code)) throw Error('Duplicate PSOC code')
   seen.add(row.code)
   rows.push({...row,level:spec.width,normalized_name:normalizeTerm(row.title)})
  }
 }
 if (rows.some(row=>row.parent_code!==null&&!seen.has(row.parent_code))) throw Error('PSOC parent missing')
 const byCode=new Map(rows.map(row=>[row.code,row]))
 if (byCode.get('2121')?.title!=='MATHEMATICIANS' || byCode.get('2123')?.title!=='ACTUARIES' ||
  byCode.get('2124')?.title!=='DATA SCIENTIST' || !byCode.has('0110')) throw Error('Expected PSOC release markers missing')
 rows.sort((a,b)=>a.level-b.level||a.code.localeCompare(b.code,'en'))
 const payload=JSON.stringify(rows), payloadHash=hash(payload)
 const metadata={namespace:'PSOC',base_classification:'2012',api_release:'2022',
  provenance_status:'official_api_pagination_and_hierarchy_verified',
  source_snapshot_sha256:snapshotSha256,source_payload_sha256:payloadHash,
  retrieved_at:snapshot.retrieved_at,source_documentation:'https://psa.gov.ph/classifications-api/psoc',
  technical_notes:'https://psa.gov.ph/classification/psoc/technical-notes',
  documentation_count_conflict:{documented_units:456,api_units:466,status:'unresolved_published_text_difference'},
  counts,import_method:'additive_existing_canonical_tables_v1',
  mapping_basis:'same_source_entry_identity_not_inferred_job_title_equivalence',
  canonical_name_uniqueness:'normalized_name_within_hierarchy_level_legacy_null_equals_zero'}
 const delimiter='$psoc2022_'+payloadHash.slice(0,16)+'$'
 if (payload.includes(delimiter)) throw Error('Unsafe import literal')
 const metadataText=JSON.stringify(metadata).replaceAll("'","''")
 const sql=`-- DEV-only additive official PSOC 2022 API reference import.
-- Source counts are API 10/43/130/466; the 456-unit documentation conflict is retained in metadata.
-- No existing occupation/source/mapping is relabeled or deleted. No ACL/RLS/function change.
-- Repeated PSOC group names at different levels are distinct canonical nodes.
DO $import$
DECLARE
 v_raw text := ${delimiter}${payload}${delimiter};
 v_rows jsonb; v_source uuid; v_expected integer:=649; v_existing integer;
BEGIN
 IF current_user <> 'postgres' OR session_user <> 'postgres' OR current_database() <> 'postgres' THEN
  RAISE EXCEPTION 'Verified DEV management identity required' USING ERRCODE='42501';
 END IF;
 IF encode(sha256(convert_to(v_raw,'UTF8')),'hex') <> '${payloadHash}' THEN
  RAISE EXCEPTION 'Pinned PSOC payload hash mismatch' USING ERRCODE='22023';
 END IF;
 v_rows:=v_raw::jsonb;
 IF jsonb_array_length(v_rows)<>v_expected THEN RAISE EXCEPTION 'PSOC row count mismatch'; END IF;
 CREATE TEMP TABLE psoc_2022_stage(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),code text UNIQUE NOT NULL,parent_code text,
  title text NOT NULL,normalized_name text NOT NULL,description text NOT NULL,level smallint NOT NULL,
  version text NOT NULL,source_id text
 ) ON COMMIT DROP;
 INSERT INTO psoc_2022_stage(code,parent_code,title,normalized_name,description,level,version,source_id)
 SELECT code,parent_code,title,normalized_name,description,level,version,source_id
 FROM jsonb_to_recordset(v_rows) AS r(code text,parent_code text,title text,normalized_name text,
  description text,level smallint,version text,source_id text);
 IF EXISTS(SELECT 1 FROM psoc_2022_stage s WHERE version<>'2022' OR level NOT BETWEEN 1 AND 4
  OR length(code)<>level OR code!~'^[0-9]+$' OR btrim(title)='' OR btrim(normalized_name)=''
  OR (level=1 AND parent_code IS NOT NULL)
  OR (level>1 AND (parent_code IS DISTINCT FROM left(code,level-1)
    OR NOT EXISTS(SELECT 1 FROM psoc_2022_stage p WHERE p.code=s.parent_code AND p.level=s.level-1))))
  OR (SELECT count(*) FROM psoc_2022_stage WHERE level=1)<>10
  OR (SELECT count(*) FROM psoc_2022_stage WHERE level=2)<>43
  OR (SELECT count(*) FROM psoc_2022_stage WHERE level=3)<>130
  OR (SELECT count(*) FROM psoc_2022_stage WHERE level=4)<>466 THEN
  RAISE EXCEPTION 'PSOC hierarchy validation failed' USING ERRCODE='22023';
 END IF;
 SELECT id INTO v_source FROM public.taxonomy_sources WHERE code='${sourceCode}' FOR UPDATE;
 IF v_source IS NOT NULL THEN
  IF NOT EXISTS(SELECT 1 FROM public.taxonomy_sources WHERE id=v_source AND version='2022' AND is_active
   AND metadata->>'source_payload_sha256'='${payloadHash}') THEN
   RAISE EXCEPTION 'PSOC source conflicts with prepared import' USING ERRCODE='55000';
  END IF;
  SELECT count(*) INTO v_existing FROM public.taxonomy_mappings WHERE taxonomy_source_id=v_source;
  IF v_existing<>v_expected OR EXISTS(
   SELECT 1 FROM psoc_2022_stage s WHERE (
    SELECT count(*) FROM public.taxonomy_mappings m JOIN public.occupations o ON o.id=m.entity_id
    LEFT JOIN public.occupations p ON p.id=o.parent_id
    LEFT JOIN public.taxonomy_mappings pm ON pm.taxonomy_source_id=v_source AND pm.entity_id=p.id AND pm.entity_type='occupation'
    WHERE m.taxonomy_source_id=v_source AND m.entity_type='occupation' AND m.external_code=s.code
     AND m.mapping_type='exact' AND m.is_primary AND m.external_name=s.title
     AND o.canonical_name=s.title AND o.normalized_name=s.normalized_name AND o.description=s.description
     AND o.occupation_level=s.level AND o.is_active
     AND pm.external_code IS NOT DISTINCT FROM s.parent_code)<>1)
   OR (SELECT count(*) FROM public.occupation_aliases WHERE source='${sourceCode}' AND alias_type='external_code')<>466
   OR EXISTS(SELECT 1 FROM psoc_2022_stage s WHERE s.level=4 AND NOT EXISTS(
    SELECT 1 FROM public.occupation_aliases a JOIN public.taxonomy_mappings m ON m.entity_id=a.occupation_id
     AND m.taxonomy_source_id=v_source AND m.entity_type='occupation' AND m.external_code=s.code
    WHERE a.source='${sourceCode}' AND a.alias_type='external_code' AND a.alias=s.code AND a.normalized_alias=s.code AND a.is_active)) THEN
   RAISE EXCEPTION 'Existing PSOC import changed; no overwrite allowed' USING ERRCODE='55000';
  END IF;
  RETURN;
 END IF;
 IF to_regclass('public.occupations_normalized_name_level_unique') IS NULL
  OR to_regclass('public.occupations_normalized_name_unique') IS NOT NULL THEN
  RAISE EXCEPTION 'Occupation hierarchy index migration must be applied first' USING ERRCODE='55000';
 END IF;
 INSERT INTO public.taxonomy_sources(code,name,version,source_type,country_code,source_url,is_active,metadata)
 VALUES('${sourceCode}','2022 Updates to the 2012 Philippine Standard Occupational Classification (PSA API)',
  '2022','national','PH','https://classification.psa.gov.ph/psoc/2022',true,'${metadataText}'::jsonb)
 RETURNING id INTO v_source;
 INSERT INTO public.occupations(id,canonical_name,normalized_name,description,occupation_level,parent_id,is_active)
 SELECT s.id,s.title,s.normalized_name,s.description,s.level,p.id,true
 FROM psoc_2022_stage s LEFT JOIN psoc_2022_stage p ON p.code=s.parent_code;
 INSERT INTO public.taxonomy_mappings(taxonomy_source_id,entity_type,entity_id,external_code,external_id,external_name,
  mapping_type,confidence,is_primary,metadata)
 SELECT v_source,'occupation',s.id,s.code,s.source_id,s.title,'exact',NULL,true,
  jsonb_build_object('namespace','PSOC','release','2022','level',s.level,'parent_code',s.parent_code,
   'source_payload_sha256','${payloadHash}','identity_mapping',true)
 FROM psoc_2022_stage s;
 INSERT INTO public.occupation_aliases(occupation_id,alias,normalized_alias,alias_type,language_code,source,is_active)
 SELECT id,code,code,'external_code',NULL,'${sourceCode}',true FROM psoc_2022_stage WHERE level=4;
 IF (SELECT count(*) FROM public.taxonomy_mappings WHERE taxonomy_source_id=v_source)<>649 THEN
  RAISE EXCEPTION 'PSOC import was incomplete';
 END IF;
END $import$;
`
 return {rows,metadata,payload_sha256:payloadHash,sql}
}
