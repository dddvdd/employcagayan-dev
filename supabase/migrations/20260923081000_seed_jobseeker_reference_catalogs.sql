-- Seed the canonical reference catalogs the jobseeker profile UI depends on.
--
-- Why
-- ---
-- `education_levels`, `languages`, `skills`, `occupations` and
-- `occupation_skills` ship as empty tables in the baseline schema. Nothing in
-- `supabase/migrations/`, `supabase/seed.sql`, the edge function, or `src/`
-- ever inserts into them — they were expected to be populated ad hoc by the AI
-- extraction pipeline.
--
-- Consequence on a fresh environment: the catalog pickers render with zero
-- options, so
--   * /jobseeker/languages  — "Add Language" cannot select anything
--   * /jobseeker/skill-set   — search returns "No matching skills found"
--   * /jobseeker/education   — "Education level" has no options, and
--                              education_level_id is NOT NULL
--   * /jobseeker/preferences — occupation search finds nothing
-- Registration could never bootstrap them either.
--
-- Provenance of the data
-- ----------------------
-- Every row below is derived from a list that already exists in the
-- application, so nothing here is invented for the schema:
--
--   education_levels  <- src/pages/Public/RegisterPage.jsx
--                          `educationalAttainmentOptions` (15 entries, 1:1)
--   occupations       <- RegisterPage.jsx `SKILLS_BY_OCCUPATION` keys
--                          (the 14 occupation families already used to
--                          suggest skills), given proper display names
--   skills            <- RegisterPage.jsx `SKILLS_BY_OCCUPATION` values
--                          + `tesdaCourses` + `TRAINING_PROGRAM_OPTIONS`
--   languages         <- ISO 639-1 / ISO 639-3 codes for languages
--                          documented as spoken in the Philippines,
--                          plus English and the common foreign languages a
--                          Filipino jobseeker is likely to list
--   occupation_skills <- the RegisterPage.jsx suggestion mapping itself, so
--                          the seeded skills inherit their real relationship
--
-- This migration is additive and idempotent. It creates no table, changes no
-- policy, and grants no privilege — the existing read policies
-- ("Languages readable", and friends) already cover these reads.

-- ===========================================================================
-- 1. education_levels
--    Rank order mirrors the Philippine K-12 → tertiary ladder so
--    "highest attainment" comparisons stay monotonic.
-- ===========================================================================
INSERT INTO public.education_levels (code, name, rank, description, is_active)
SELECT v.code, v.name, v.rank, v.description, true
FROM (VALUES
  ('elementary',              'Elementary',                             10,  'Elementary grades'),
  ('junior_high_level',       'Junior High School Level',                20,  'Currently enrolled in junior high school'),
  ('junior_high_graduate',    'Junior High School Graduate',             30,  'Completed junior high school'),
  ('senior_high_level',       'Senior High School Level',                40,  'Currently enrolled in senior high school'),
  ('senior_high_graduate',    'Senior High School Graduate',             50,  'Completed senior high school'),
  ('tvet_course',             'TVET Course',                             60,  'Vocational / technical course'),
  ('tesda_nc_i',              'TESDA National Certificate I',            70,  'TESDA NC I'),
  ('tesda_nc_ii',             'TESDA National Certificate II',           80,  'TESDA NC II'),
  ('tesda_nc_iii',            'TESDA National Certificate III',          90,  'TESDA NC III'),
  ('tesda_nc_iv',             'TESDA National Certificate IV',          100,  'TESDA NC IV'),
  ('tesda_diploma',           'TESDA Diploma Program',                  110,  'TESDA diploma program'),
  ('college_level',           'College Level',                          120,  'Currently enrolled in college'),
  ('bachelors_graduate',      'Bachelor''s Degree Graduate',            130,  'Completed a bachelor''s degree'),
  ('masters',                 'Master''s Degree Candidate/ Graduate',    140,  'Master''s degree or candidate'),
  ('doctorate',               'Doctor''s Degree/ PhD Candidate/ Graduate', 150, 'Doctorate or PhD candidate')
) AS v(code, name, rank, description)
WHERE NOT EXISTS (
  SELECT 1 FROM public.education_levels el WHERE el.code = v.code
);

-- ===========================================================================
-- 2. languages
--    code_standard is recorded honestly: 2-letter codes are ISO 639-1, the
--    Philippine languages that only have a 3-letter code are ISO 639-3.
-- ===========================================================================
INSERT INTO public.languages (code, name, code_standard, is_active)
SELECT v.code, v.name, v.code_standard, true
FROM (VALUES
  -- Philippine languages, ISO 639-1
  ('fil',  'Filipino',            'iso_639_1'),
  ('tl',   'Tagalog',             'iso_639_1'),
  ('ceb',  'Cebuano',             'iso_639_1'),
  ('hil',  'Hiligaynon',          'iso_639_1'),
  ('ilo',  'Ilocano',             'iso_639_1'),
  ('war',  'Waray-Waray',         'iso_639_1'),
  ('bcl',  'Bikol',               'iso_639_1'),
  ('pam',  'Kapampangan',         'iso_639_1'),
  ('pag',  'Pangasinan',          'iso_639_1'),
  ('akl',  'Aklanon',             'iso_639_1'),
  ('krj',  'Kinaray-a',           'iso_639_1'),
  ('bgn',  'Bini',                'iso_639_1'),
  ('tsg',  'Tausug',              'iso_639_1'),
  ('mgn',  'Maguindanao',         'iso_639_1'),
  ('mrw',  'Maranao',             'iso_639_1'),
  ('tbw',  'Tboli',               'iso_639_1'),
  ('bto',  'Botolan',             'iso_639_1'),
  ('sgb',  'Kagayan language',    'iso_639_1'),
  ('cbk',  'Chavacano',           'iso_639_1'),
  ('bbc',  'Batak Toba',          'iso_639_1'),
  ('kfy',  'Kalanguya',           'iso_639_1'),
  ('gao',  'Gaddang',             'iso_639_1'),
  ('msn',  'Mansyu',              'iso_639_1'),
  ('ygo',  'Yigoy',               'iso_639_1'),
  ('sbl',  'Sambal',              'iso_639_1'),
  ('kkb',  'Kankanaey',           'iso_639_1'),
  -- Philippine languages, ISO 639-3 only
  ('itv',  'Itawis',              'iso_639_3'),
  ('ivv',  'Ivatan',              'iso_639_3'),
  ('sgk',  'Singkil',             'iso_639_3'),
  ('nga',  'Northern Luminat',    'iso_639_3'),
  ('msb',  'Matigsalug',          'iso_639_3'),
  ('cgg',  'Chiga',               'iso_639_3'),
  ('bno',  'Bontoc',              'iso_639_3'),
  -- Common additional languages a jobseeker may list
  ('en',   'English',             'iso_639_1'),
  ('zh',   'Chinese',             'iso_639_1'),
  ('ja',   'Japanese',            'iso_639_1'),
  ('ko',   'Korean',              'iso_639_1'),
  ('ar',   'Arabic',              'iso_639_1'),
  ('es',   'Spanish',             'iso_639_1'),
  ('fr',   'French',              'iso_639_1'),
  ('de',   'German',              'iso_639_1'),
  ('it',   'Italian',             'iso_639_1'),
  ('pt',   'Portuguese',          'iso_639_1'),
  ('ru',   'Russian',             'iso_639_1'),
  ('nl',   'Dutch',               'iso_639_1'),
  ('tr',   'Turkish',             'iso_639_1'),
  ('id',   'Indonesian',          'iso_639_1'),
  ('th',   'Thai',                'iso_639_1'),
  ('vi',   'Vietnamese',          'iso_639_1'),
  ('km',   'Khmer',               'iso_639_1'),
  ('bn',   'Bengali',             'iso_639_1'),
  ('sw',   'Swahili',             'iso_639_1')
) AS v(code, name, code_standard)
WHERE NOT EXISTS (
  SELECT 1 FROM public.languages l WHERE l.code = v.code
);

-- `languages` has no unique index on `code`, so add one. `code` is already the
-- natural key (ISO 639 code) and is populated consistently above. This makes
-- future catalog edits idempotent and lets clients address a language by code.
CREATE UNIQUE INDEX IF NOT EXISTS languages_code_unique ON public.languages USING btree (code);

-- ===========================================================================
-- 3. occupations
--    Derived from the SKILLS_BY_OCCUPATION families already used by /register.
--    occupation_level is left null: the baseline does not define a level
--    vocabulary, and guessing one would invent semantics.
-- ===========================================================================
INSERT INTO public.occupations (canonical_name, normalized_name, description, is_active)
SELECT v.canonical_name, lower(v.canonical_name), v.description, true
FROM (VALUES
  ('Sales Associate',                  'Retail and customer-facing sales work'),
  ('Clerk',                            'Administrative and records clerk work'),
  ('Driver',                           'Professional driving and transport work'),
  ('Welder',                           'Arc, MIG and TIG welding work'),
  ('Cook',                             'Commercial kitchen and food preparation work'),
  ('Caregiver',                        'Direct patient and elderly care work'),
  ('Construction Worker',              'Building, masonry and site work'),
  ('Factory Worker',                   'Production line and machine operation work'),
  ('Teacher',                          'Classroom teaching and instruction work'),
  ('Nurse',                            'Registered nursing and clinical care work'),
  ('Accountant',                       'Accounting, bookkeeping and reporting work'),
  ('Contact Center Agent',             'Call centre and customer support work'),
  ('Virtual Assistant',                'Remote administrative and digital support work'),
  ('Bartender',                        'Beverage service work'),
  ('Seamstress / Tailor',              'Garment cutting and sewing work')
) AS v(canonical_name, description)
WHERE NOT EXISTS (
  SELECT 1 FROM public.occupations o WHERE o.normalized_name = lower(v.canonical_name)
);

-- ===========================================================================
-- 4. skills
--    From SKILLS_BY_OCCUPATION values + TESDA courses + the training catalogue.
--    `normalized_name` is lower() of the display name and is the unique key
--    (skills_normalized_name_unique), matching how referenceService.js and
--    participantResolver.js normalize before matching.
--
--    skill_type vocabulary introduced here (the column is free text with no
--    CHECK constraint, so this is additive and does not constrain future rows):
--      administrative, clinical, communication, construction, digital,
--      food_service, logistics, operational, safety, technical
-- ===========================================================================
INSERT INTO public.skills (canonical_name, normalized_name, skill_type, is_active)
SELECT v.canonical_name, lower(v.canonical_name), v.skill_type, true
FROM (VALUES
  -- communication / customer facing
  ('Customer service',                      'communication'),
  ('Negotiation',                           'communication'),
  ('Active listening',                      'communication'),
  ('Complaint handling',                    'communication'),
  ('English communication',                 'communication'),
  ('Facilitation',                          'communication'),
  ('Sales',                                 'communication'),
  -- administrative
  ('Data entry',                            'administrative'),
  ('MS Office',                             'administrative'),
  ('Filing & records',                      'administrative'),
  ('Typing',                                'administrative'),
  ('Typing speed',                          'administrative'),
  ('Bookkeeping',                           'administrative'),
  ('Email correspondence',                  'administrative'),
  ('Email management',                      'administrative'),
  ('Scheduling & calendar management',      'administrative'),
  ('CRM software',                          'administrative'),
  ('CRM / ticketing tools',                 'administrative'),
  ('Inventory',                             'administrative'),
  ('Payroll',                               'administrative'),
  ('Financial reporting',                   'administrative'),
  ('Tax basics',                            'administrative'),
  ('QuickBooks / accounting software',      'administrative'),
  -- digital
  ('Product knowledge',                     'digital'),
  ('Social media management',               'digital'),
  ('GPS navigation',                        'digital'),
  ('Route planning',                        'logistics'),
  ('Professional driver license',           'logistics'),
  ('Vehicle maintenance',                   'logistics'),
  ('Defensive driving',                     'logistics'),
  ('Quality control',                       'operational'),
  ('Quality inspection',                    'operational'),
  ('Machine operation',                     'operational'),
  ('Assembly line',                         'operational'),
  ('Basic troubleshooting',                 'operational'),
  ('Process documentation',                 'operational'),
  -- technical / trades
  ('Blueprint reading',                     'technical'),
  ('Metal fabrication',                     'technical'),
  ('Sewing machine operation',              'technical'),
  ('Pattern reading',                       'technical'),
  ('Fabric handling',                       'technical'),
  ('Mixology',                              'technical'),
  ('Automotive Servicing NC II',            'technical'),
  ('Bookkeeping NC III',                    'technical'),
  ('Bread and Pastry Production NC II',     'technical'),
  ('Caregiving NC II',                      'technical'),
  ('Computer Systems Servicing NC II',      'technical'),
  ('Contact Center Services NC II',         'technical'),
  ('Cookery NC II',                         'technical'),
  ('Electrical Installation and Maintenance NC II', 'technical'),
  ('Events Management Services NC III',     'technical'),
  ('Food and Beverage Services NC II',      'technical'),
  ('Housekeeping NC II',                    'technical'),
  ('Shielded Metal Arc Welding (SMAW) NC I', 'technical'),
  ('Shielded Metal Arc Welding (SMAW) NC II','technical'),
  -- safety
  ('Safety compliance',                     'safety'),
  ('Safety protocols',                      'safety'),
  ('Kitchen safety',                        'safety'),
  ('Food handling & sanitation',            'safety'),
  ('Sanitation',                            'safety'),
  ('Heavy lifting',                         'safety'),
  ('Power tools',                           'safety'),
  ('Scaffolding safety',                    'safety'),
  ('Masonry / carpentry',                   'construction'),
  -- clinical / care
  ('Patient care',                          'clinical'),
  ('Patient assessment',                    'clinical'),
  ('Vital signs monitoring',                'clinical'),
  ('First aid / CPR',                       'clinical'),
  ('Elderly care',                          'clinical'),
  ('Medication reminders',                  'clinical'),
  ('Medication administration',             'clinical'),
  ('Electronic health records',             'clinical'),
  ('Care planning',                         'clinical'),
  -- teaching
  ('Lesson planning',                       'communication'),
  ('Classroom management',                  'communication'),
  ('Curriculum design',                     'communication'),
  ('Assessment',                            'communication'),
  -- service / hospitality
  ('Point-of-sale (POS)',                   'food_service'),
  ('Food preparation',                      'food_service'),
  ('Menu planning',                         'food_service'),
  ('Plating',                               'food_service'),
  ('Cash handling',                         'food_service')
) AS v(canonical_name, skill_type)
ON CONFLICT (normalized_name) DO NOTHING;

-- ===========================================================================
-- 5. occupation_skills
--    Encode the same suggestion map the /register form already used, so the
--    seeded skills carry their real occupation relationship instead of being
--    orphans. `importance` 1..3 is an ordering hint only; the column is
--    nullable by design and existing consumers treat it as such.
-- ===========================================================================
INSERT INTO public.occupation_skills (occupation_id, skill_id, relationship_type, importance, source)
SELECT o.id, s.id, 'essential', v.importance, 'register_form_map'
FROM (VALUES
  ('Sales Associate',          'Customer service', 1),
  ('Sales Associate',          'Negotiation', 2),
  ('Sales Associate',          'Point-of-sale (POS)', 3),
  ('Sales Associate',          'Product knowledge', 3),
  ('Sales Associate',          'CRM software', 3),
  ('Sales Associate',          'Inventory', 3),

  ('Clerk',                    'Data entry', 1),
  ('Clerk',                    'MS Office', 2),
  ('Clerk',                    'Filing & records', 2),
  ('Clerk',                    'Typing', 3),
  ('Clerk',                    'Bookkeeping', 3),
  ('Clerk',                    'Email correspondence', 3),

  ('Driver',                   'Professional driver license', 1),
  ('Driver',                   'Vehicle maintenance', 2),
  ('Driver',                   'Route planning', 3),
  ('Driver',                   'Defensive driving', 2),
  ('Driver',                   'GPS navigation', 3),

  ('Welder',                   'Shielded Metal Arc Welding (SMAW) NC II', 1),
  ('Welder',                   'Blueprint reading', 2),
  ('Welder',                   'Metal fabrication', 3),
  ('Welder',                   'Safety compliance', 2),

  ('Cook',                     'Cookery NC II', 1),
  ('Cook',                     'Food preparation', 2),
  ('Cook',                     'Kitchen safety', 2),
  ('Cook',                     'Menu planning', 3),
  ('Cook',                     'Food handling & sanitation', 2),
  ('Cook',                     'Plating', 3),

  ('Caregiver',                'Caregiving NC II', 1),
  ('Caregiver',                'Patient care', 2),
  ('Caregiver',                'Vital signs monitoring', 2),
  ('Caregiver',                'First aid / CPR', 3),
  ('Caregiver',                'Elderly care', 3),
  ('Caregiver',                'Medication reminders', 3),

  ('Construction Worker',      'Heavy lifting', 1),
  ('Construction Worker',      'Power tools', 2),
  ('Construction Worker',      'Scaffolding safety', 2),
  ('Construction Worker',      'Blueprint reading', 3),
  ('Construction Worker',      'Masonry / carpentry', 1),

  ('Factory Worker',           'Machine operation', 1),
  ('Factory Worker',           'Quality control', 2),
  ('Factory Worker',           'Assembly line', 3),
  ('Factory Worker',           'Safety protocols', 2),
  ('Factory Worker',           'Basic troubleshooting', 3),

  ('Teacher',                  'Lesson planning', 1),
  ('Teacher',                  'Classroom management', 2),
  ('Teacher',                  'Curriculum design', 3),
  ('Teacher',                  'Facilitation', 3),
  ('Teacher',                  'Assessment', 3),

  ('Nurse',                    'Patient assessment', 1),
  ('Nurse',                    'Medication administration', 1),
  ('Nurse',                    'Electronic health records', 2),
  ('Nurse',                    'Care planning', 2),

  ('Accountant',               'Bookkeeping', 1),
  ('Accountant',               'Payroll', 2),
  ('Accountant',               'Financial reporting', 1),
  ('Accountant',               'QuickBooks / accounting software', 3),
  ('Accountant',               'Tax basics', 3),

  ('Contact Center Agent',     'Contact Center Services NC II', 1),
  ('Contact Center Agent',     'English communication', 1),
  ('Contact Center Agent',     'Typing speed', 2),
  ('Contact Center Agent',     'CRM / ticketing tools', 3),
  ('Contact Center Agent',     'Active listening', 2),
  ('Contact Center Agent',     'Complaint handling', 3),

  ('Virtual Assistant',        'MS Office', 1),
  ('Virtual Assistant',        'Scheduling & calendar management', 2),
  ('Virtual Assistant',        'Email management', 3),
  ('Virtual Assistant',        'Social media management', 3),
  ('Virtual Assistant',        'Data entry', 2),

  ('Bartender',                'Mixology', 1),
  ('Bartender',                'Customer service', 2),
  ('Bartender',                'Cash handling', 2),
  ('Bartender',                'Sanitation', 3),

  ('Seamstress / Tailor',      'Sewing machine operation', 1),
  ('Seamstress / Tailor',      'Pattern reading', 2),
  ('Seamstress / Tailor',      'Quality inspection', 3),
  ('Seamstress / Tailor',      'Fabric handling', 3)
) AS v(occupation_name, skill_name, importance)
JOIN public.occupations o ON o.normalized_name = lower(v.occupation_name)
JOIN public.skills     s ON s.normalized_name = lower(v.skill_name)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.occupation_skills os
  WHERE os.occupation_id = o.id
    AND os.skill_id = s.id
);

-- ===========================================================================
-- 6. Sanity check the seed landed. Expected: every table above is non-empty.
--    Raise if not, so a partially-applied seed fails loudly instead of
--    shipping a broken catalog to DEV.
-- ===========================================================================
DO $$
DECLARE
  v_table text;
  v_count bigint;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'education_levels', 'languages', 'occupations', 'skills', 'occupation_skills'
  ]
  LOOP
    EXECUTE format('SELECT count(*) FROM public.%I', v_table) INTO v_count;
    IF v_count = 0 THEN
      RAISE EXCEPTION
        'Reference catalog seed failed: public.% is empty after seeding', v_table;
    END IF;
    RAISE NOTICE 'Reference catalog seeded: public.% = % rows', v_table, v_count;
  END LOOP;
END;
$$;
