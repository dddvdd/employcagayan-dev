import {findQualification} from './qualificationIdentity.js'
import {reviewVacancyRequirements} from './vacancyRequirementReadiness.js'
import {DEFAULT_EDUCATION_RANKS,educationEvidence,experienceEvidence,certificationValidity,evidenceNeedsVerification,finiteNonNegative} from './qualificationEvidence.js'
export {DEFAULT_EDUCATION_RANKS} from './qualificationEvidence.js'
export const ELIGIBILITY_RULES_VERSION='eligibility-v3-canonical'

// Deterministic Eligibility Engine (Phase 3A)
// Pure, explainable, rule-based gatekeeper.
// NO weighted scores, NO semantic vectors, NO LLM inference.

export const ELIGIBILITY_STATUS = {
  ELIGIBLE: 'eligible',
  CONDITIONALLY_ELIGIBLE: 'conditionally_eligible',
  INELIGIBLE: 'ineligible',
}

export const CHECK_STATUS = {
  PASS: 'pass',
  FAIL: 'fail',
  WARNING: 'warning',
  UNKNOWN: 'unknown',
}

export const CHECK_CATEGORY = {
  VACANCY_STATUS: 'vacancy_status',
  APPLICATION_DEADLINE: 'application_deadline',
  EDUCATION: 'education',
  EXPERIENCE: 'experience',
  SKILLS: 'skills',
  CERTIFICATIONS: 'certifications',
  LANGUAGES: 'languages',
  EMPLOYMENT_TYPE: 'employment_type',
  WORK_ARRANGEMENT: 'work_arrangement',
  LOCATION: 'location',
  SALARY: 'salary',
  AVAILABILITY: 'availability',
  REQUIREMENT_REVIEW: 'requirement_review',
}

export const IMPORTANCE = {
  REQUIRED: 'required',
  PREFERRED: 'preferred',
  NICE_TO_HAVE: 'nice_to_have',
  COMPATIBILITY: 'compatibility',
  INFORMATIONAL: 'informational',
}

export const REASON_CODES = {
  // Vacancy
  VACANCY_ACTIVE: 'VACANCY_ACTIVE',
  VACANCY_INACTIVE: 'VACANCY_INACTIVE',
  VACANCY_TEXT_REQUIREMENT_UNRESOLVED: 'VACANCY_TEXT_REQUIREMENT_UNRESOLVED',
  APPLICATION_DEADLINE_VALID: 'APPLICATION_DEADLINE_VALID',
  APPLICATION_DEADLINE_PASSED: 'APPLICATION_DEADLINE_PASSED',

  // Education
  EDUCATION_REQUIRED_MET: 'EDUCATION_REQUIRED_MET',
  EDUCATION_REQUIRED_NOT_MET: 'EDUCATION_REQUIRED_NOT_MET',
  EDUCATION_FIELD_OF_STUDY_REVIEW: 'EDUCATION_FIELD_OF_STUDY_REVIEW',
  EDUCATION_DATA_MISSING: 'EDUCATION_DATA_MISSING',
  EDUCATION_PREFERRED_MET: 'EDUCATION_PREFERRED_MET',
  EDUCATION_PREFERRED_NOT_MET: 'EDUCATION_PREFERRED_NOT_MET',

  // Experience
  EXPERIENCE_REQUIRED_MET: 'EXPERIENCE_REQUIRED_MET',
  EXPERIENCE_REQUIRED_NOT_MET: 'EXPERIENCE_REQUIRED_NOT_MET',
  EXPERIENCE_DATA_MISSING: 'EXPERIENCE_DATA_MISSING',
  EXPERIENCE_PREFERRED_MET: 'EXPERIENCE_PREFERRED_MET',
  EXPERIENCE_PREFERRED_NOT_MET: 'EXPERIENCE_PREFERRED_NOT_MET',

  // Skills
  REQUIRED_SKILL_PRESENT: 'REQUIRED_SKILL_PRESENT',
  REQUIRED_SKILL_MISSING: 'REQUIRED_SKILL_MISSING',
  SKILL_PROFICIENCY_BELOW_MINIMUM: 'SKILL_PROFICIENCY_BELOW_MINIMUM',
  SKILL_PROFICIENCY_UNKNOWN: 'SKILL_PROFICIENCY_UNKNOWN',
  SKILL_EXPERIENCE_BELOW_MINIMUM: 'SKILL_EXPERIENCE_BELOW_MINIMUM',
  SKILL_EXPERIENCE_UNKNOWN: 'SKILL_EXPERIENCE_UNKNOWN',
  PREFERRED_SKILL_PRESENT: 'PREFERRED_SKILL_PRESENT',
  PREFERRED_SKILL_MISSING: 'PREFERRED_SKILL_MISSING',

  // Certifications
  REQUIRED_CERTIFICATION_PRESENT: 'REQUIRED_CERTIFICATION_PRESENT',
  REQUIRED_CERTIFICATION_MISSING: 'REQUIRED_CERTIFICATION_MISSING',
  CERTIFICATION_EXPIRED: 'CERTIFICATION_EXPIRED',
  PREFERRED_CERTIFICATION_PRESENT: 'PREFERRED_CERTIFICATION_PRESENT',
  PREFERRED_CERTIFICATION_MISSING: 'PREFERRED_CERTIFICATION_MISSING',

  // Languages
  LANGUAGE_REQUIREMENT_MET: 'LANGUAGE_REQUIREMENT_MET',
  LANGUAGE_REQUIREMENT_NOT_MET: 'LANGUAGE_REQUIREMENT_NOT_MET',
  LANGUAGE_PROFICIENCY_UNKNOWN: 'LANGUAGE_PROFICIENCY_UNKNOWN',
  LANGUAGE_DATA_MISSING: 'LANGUAGE_DATA_MISSING',
  QUALIFICATION_UNVERIFIED: 'QUALIFICATION_UNVERIFIED',
  CERTIFICATION_VALIDITY_UNKNOWN: 'CERTIFICATION_VALIDITY_UNKNOWN',
  LANGUAGE_PREFERRED_MET: 'LANGUAGE_PREFERRED_MET',
  LANGUAGE_PREFERRED_NOT_MET: 'LANGUAGE_PREFERRED_NOT_MET',

  // Compatibility (Soft)
  EMPLOYMENT_TYPE_MATCH: 'EMPLOYMENT_TYPE_MATCH',
  EMPLOYMENT_TYPE_MISMATCH: 'EMPLOYMENT_TYPE_MISMATCH',
  EMPLOYMENT_TYPE_NEUTRAL: 'EMPLOYMENT_TYPE_NEUTRAL',

  WORK_ARRANGEMENT_MATCH: 'WORK_ARRANGEMENT_MATCH',
  WORK_ARRANGEMENT_MISMATCH: 'WORK_ARRANGEMENT_MISMATCH',
  WORK_ARRANGEMENT_NEUTRAL: 'WORK_ARRANGEMENT_NEUTRAL',

  LOCATION_MATCH: 'LOCATION_MATCH',
  LOCATION_PROVINCE_MATCH: 'LOCATION_PROVINCE_MATCH',
  LOCATION_MISMATCH: 'LOCATION_MISMATCH',
  RELOCATION_ACCEPTED: 'RELOCATION_ACCEPTED',
  LOCATION_NO_PREFERENCE: 'LOCATION_NO_PREFERENCE',

  SALARY_COMPATIBLE: 'SALARY_COMPATIBLE',
  SALARY_EXPECTATION_ABOVE_RANGE: 'SALARY_EXPECTATION_ABOVE_RANGE',
  SALARY_COMPARISON_UNKNOWN: 'SALARY_COMPARISON_UNKNOWN',

  AVAILABLE: 'AVAILABLE',
  AVAILABILITY_MISMATCH: 'AVAILABILITY_MISMATCH',
  AVAILABILITY_UNKNOWN: 'AVAILABILITY_UNKNOWN',
}

export const SKILL_PROFICIENCY_MAP = {
  beginner: 1,
  intermediate: 2,
  advanced: 3,
  expert: 4,
}

export const LANGUAGE_PROFICIENCY_MAP = {
  none: 0,
  elementary: 1,
  intermediate: 2,
  advanced: 3,
  fluent: 4,
  native: 5,
}

/**
 * Pure deterministic eligibility evaluator.
 * Determines whether jobseeker qualifies for vacancy based on explicit structured facts.
 * 
 * @param {Object} jobseeker Structured jobseeker profile
 * @param {Object} vacancy Structured vacancy definition with requirements
 * @param {Object} [options] Optional evaluation options (currentDate, application_deadline override)
 * @returns {Object} Result { status, checks, blocking_reasons, warnings, passed_checks, unknown_checks }
 */
export function evaluateEligibility(jobseeker = {}, vacancy = {}, options = {}) {
  const checks = []
  const currentDate = options.currentDate ? new Date(options.currentDate) : new Date()

  // -------------------------------------------------------------
  // 1. VACANCY STATUS & DEADLINE (Hard blockers)
  // -------------------------------------------------------------
  if (vacancy.is_active === false) {
    checks.push({
      category: CHECK_CATEGORY.VACANCY_STATUS,
      status: CHECK_STATUS.FAIL,
      importance: IMPORTANCE.REQUIRED,
      code: REASON_CODES.VACANCY_INACTIVE,
      message: 'Vacancy is marked inactive',
    })
  } else {
    checks.push({
      category: CHECK_CATEGORY.VACANCY_STATUS,
      status: CHECK_STATUS.PASS,
      importance: IMPORTANCE.REQUIRED,
      code: REASON_CODES.VACANCY_ACTIVE,
      message: 'Vacancy is active',
    })
  }

  const deadlineVal = options.application_deadline || vacancy.application_deadline
  if (deadlineVal) {
    const deadline = new Date(deadlineVal)
    if (!Number.isNaN(deadline.getTime()) && deadline.getTime() < currentDate.getTime()) {
      checks.push({
        category: CHECK_CATEGORY.APPLICATION_DEADLINE,
        status: CHECK_STATUS.FAIL,
        importance: IMPORTANCE.REQUIRED,
        code: REASON_CODES.APPLICATION_DEADLINE_PASSED,
        message: `Application deadline passed on ${deadline.toISOString().slice(0, 10)}`,
        details: { deadline: deadlineVal },
      })
    } else {
      checks.push({
        category: CHECK_CATEGORY.APPLICATION_DEADLINE,
        status: CHECK_STATUS.PASS,
        importance: IMPORTANCE.REQUIRED,
        code: REASON_CODES.APPLICATION_DEADLINE_VALID,
        message: 'Application deadline is open',
      })
    }
  }

  // -------------------------------------------------------------
  // 2. EDUCATION REQUIREMENTS
  // -------------------------------------------------------------
  const eduReqs = Array.isArray(vacancy.education_requirements) ? vacancy.education_requirements : []
  for (const req of eduReqs) {
    const isRequired = (req.importance || IMPORTANCE.REQUIRED) === IMPORTANCE.REQUIRED
    const reqRank = req.rank ?? DEFAULT_EDUCATION_RANKS[req.level_code] ?? 0

    const education = educationEvidence(jobseeker)
    const highestRank = education.rank
    const bestEdu = education.best
    if (isRequired && education.unverified) {
      checks.push({category:CHECK_CATEGORY.EDUCATION,status:CHECK_STATUS.UNKNOWN,importance:IMPORTANCE.REQUIRED,
        code:REASON_CODES.QUALIFICATION_UNVERIFIED,message:'Education verification requires review',details:{required_rank:reqRank,candidate_rank:highestRank}})
      continue
    }
    if (highestRank == null || (education.incomplete && highestRank < reqRank)) {
      checks.push({
        category: CHECK_CATEGORY.EDUCATION,
        status: isRequired ? CHECK_STATUS.UNKNOWN : CHECK_STATUS.WARNING,
        importance: req.importance || IMPORTANCE.REQUIRED,
        code: REASON_CODES.EDUCATION_DATA_MISSING,
        message: isRequired
          ? `Education evidence needs review (requires ${req.level_name || 'education level'})`
          : `Candidate has no record for preferred education: ${req.level_name || 'level'}`,
        details: { required_rank: reqRank, candidate_rank: highestRank },
      })
    } else if (highestRank < reqRank) {
      checks.push({
        category: CHECK_CATEGORY.EDUCATION,
        status: isRequired ? CHECK_STATUS.FAIL : CHECK_STATUS.WARNING,
        importance: req.importance || IMPORTANCE.REQUIRED,
        code: isRequired ? REASON_CODES.EDUCATION_REQUIRED_NOT_MET : REASON_CODES.EDUCATION_PREFERRED_NOT_MET,
        message: `${isRequired ? 'Required' : 'Preferred'} education level '${req.level_name || 'level'}' not met (candidate highest rank: ${highestRank} < ${reqRank})`,
        details: { required_rank: reqRank, candidate_rank: highestRank },
      })
    } else {
      // Rank is met. Verify field of study if specified
      if (req.field_of_study && req.field_of_study.trim()) {
        const reqFos = req.field_of_study.trim().toLowerCase()
        const candFos = ((bestEdu?.field_of_study || bestEdu?.course_program || '') + '').trim().toLowerCase()

        if (!candFos) {
          checks.push({
            category: CHECK_CATEGORY.EDUCATION,
            status: isRequired ? CHECK_STATUS.UNKNOWN : CHECK_STATUS.WARNING,
            importance: req.importance || IMPORTANCE.REQUIRED,
            code: isRequired ? REASON_CODES.EDUCATION_FIELD_OF_STUDY_REVIEW : REASON_CODES.EDUCATION_PREFERRED_NOT_MET,
            message: `Education level met, but field of study requires review (vacancy specifies '${req.field_of_study}', candidate unspecified)`,
            details: { required_field: req.field_of_study, candidate_field: null },
          })
        } else if (candFos.includes(reqFos) || reqFos.includes(candFos)) {
          checks.push({
            category: CHECK_CATEGORY.EDUCATION,
            status: CHECK_STATUS.PASS,
            importance: req.importance || IMPORTANCE.REQUIRED,
            code: isRequired ? REASON_CODES.EDUCATION_REQUIRED_MET : REASON_CODES.EDUCATION_PREFERRED_MET,
            message: `Education requirement satisfied with matching field of study: ${req.field_of_study}`,
            details: { required_field: req.field_of_study, candidate_field: bestEdu?.field_of_study },
          })
        } else {
          checks.push({
            category: CHECK_CATEGORY.EDUCATION,
            status: isRequired ? CHECK_STATUS.UNKNOWN : CHECK_STATUS.PASS,
            importance: req.importance || IMPORTANCE.REQUIRED,
            code: isRequired ? REASON_CODES.EDUCATION_FIELD_OF_STUDY_REVIEW : REASON_CODES.EDUCATION_PREFERRED_MET,
            message: isRequired
              ? `Candidate holds ${req.level_name || 'degree'} in '${bestEdu?.field_of_study || bestEdu?.course_program}', vacancy specifies '${req.field_of_study}' (requires review)`
              : `Education level met (${bestEdu?.field_of_study || 'general'})`,
            details: { required_field: req.field_of_study, candidate_field: bestEdu?.field_of_study },
          })
        }
      } else {
        checks.push({
          category: CHECK_CATEGORY.EDUCATION,
          status: CHECK_STATUS.PASS,
          importance: req.importance || IMPORTANCE.REQUIRED,
          code: isRequired ? REASON_CODES.EDUCATION_REQUIRED_MET : REASON_CODES.EDUCATION_PREFERRED_MET,
          message: `${isRequired ? 'Required' : 'Preferred'} education level satisfied: ${req.level_name || 'education'}`,
          details: { required_rank: reqRank, candidate_rank: highestRank },
        })
      }
    }
  }

  // -------------------------------------------------------------
  // 3. EXPERIENCE REQUIREMENTS
  // -------------------------------------------------------------
  const expReqs = Array.isArray(vacancy.experience_requirements) ? vacancy.experience_requirements : []
  for (const req of expReqs) {
    const isRequired = (req.importance || IMPORTANCE.REQUIRED) === IMPORTANCE.REQUIRED
    const minMonths = req.minimum_months ?? 0

    if (minMonths === 0) {
      checks.push({
        category: CHECK_CATEGORY.EXPERIENCE,
        status: CHECK_STATUS.PASS,
        importance: req.importance || IMPORTANCE.REQUIRED,
        code: isRequired ? REASON_CODES.EXPERIENCE_REQUIRED_MET : REASON_CODES.EXPERIENCE_PREFERRED_MET,
        message: 'No previous experience required',
        details: { minimum_months: 0 },
      })
      continue
    }

    const experience = experienceEvidence(jobseeker, {occupationId:req.occupation_id,industryId:req.industry_id,currentDate})
    const candMonths = experience.months
    if (candMonths == null || (experience.incomplete && candMonths < minMonths) || isRequired && experience.unverified) {
      checks.push({category:CHECK_CATEGORY.EXPERIENCE,status:isRequired?CHECK_STATUS.UNKNOWN:CHECK_STATUS.WARNING,
        importance:req.importance||IMPORTANCE.REQUIRED,code:REASON_CODES.EXPERIENCE_DATA_MISSING,
        message:'Experience evidence needs review before the stated minimum can be confirmed',
        details:{minimum_months:minMonths,candidate_months:candMonths,incomplete:experience.incomplete}})
      continue
    }

    if (candMonths >= minMonths) {
      checks.push({
        category: CHECK_CATEGORY.EXPERIENCE,
        status: CHECK_STATUS.PASS,
        importance: req.importance || IMPORTANCE.REQUIRED,
        code: isRequired ? REASON_CODES.EXPERIENCE_REQUIRED_MET : REASON_CODES.EXPERIENCE_PREFERRED_MET,
        message: `Experience requirement met: ${candMonths} months (minimum ${minMonths} months)`,
        details: { minimum_months: minMonths, candidate_months: candMonths },
      })
    } else {
      checks.push({
        category: CHECK_CATEGORY.EXPERIENCE,
        status: isRequired ? CHECK_STATUS.FAIL : CHECK_STATUS.WARNING,
        importance: req.importance || IMPORTANCE.REQUIRED,
        code: isRequired ? REASON_CODES.EXPERIENCE_REQUIRED_NOT_MET : REASON_CODES.EXPERIENCE_PREFERRED_NOT_MET,
        message: `${isRequired ? 'Required' : 'Preferred'} experience not met: ${candMonths} months < ${minMonths} months required`,
        details: { minimum_months: minMonths, candidate_months: candMonths },
      })
    }
  }

  // -------------------------------------------------------------
  // 4. SKILLS
  // -------------------------------------------------------------
  const vacSkills = Array.isArray(vacancy.skills) ? vacancy.skills : []
  const candSkills = Array.isArray(jobseeker.skills) ? jobseeker.skills : []

  for (const vs of vacSkills) {
    const isRequired = (vs.importance || IMPORTANCE.REQUIRED) === IMPORTANCE.REQUIRED
    const candSkill = findQualification(candSkills,vs,'skill_id')

    if (!candSkill) {
      checks.push({
        category: CHECK_CATEGORY.SKILLS,
        status: isRequired ? CHECK_STATUS.UNKNOWN : CHECK_STATUS.WARNING,
        importance: vs.importance || IMPORTANCE.REQUIRED,
        code: isRequired ? REASON_CODES.REQUIRED_SKILL_MISSING : REASON_CODES.PREFERRED_SKILL_MISSING,
        message: `${isRequired ? 'Required' : 'Preferred'} skill missing: ${vs.canonical_name}`,
        details: { skill_id: vs.skill_id, skill_name: vs.canonical_name },
      })
      continue
    }

    if (isRequired && evidenceNeedsVerification(candSkill)) {
      checks.push({category:CHECK_CATEGORY.SKILLS,status:CHECK_STATUS.UNKNOWN,importance:IMPORTANCE.REQUIRED,
        code:REASON_CODES.QUALIFICATION_UNVERIFIED,message:'Recorded skill verification requires review',
        details:{skill_id:vs.skill_id,skill_name:vs.canonical_name,verification_status:candSkill.verification_status}})
      continue
    }
    let profPass = true
    let profUnknown = false
    if (vs.minimum_proficiency) {
      const reqProfRank = SKILL_PROFICIENCY_MAP[vs.minimum_proficiency.toLowerCase()] ?? null
      const candProfRank = candSkill.proficiency_level
        ? (SKILL_PROFICIENCY_MAP[candSkill.proficiency_level.toLowerCase()] ?? null)
        : null

      if (candProfRank === null || reqProfRank === null) {
        profUnknown = true
      } else if (candProfRank < reqProfRank) {
        profPass = false
      }
    }

    let expPass = true
    let expUnknown = false
    if (vs.minimum_years_experience != null) {
      if (finiteNonNegative(candSkill.years_experience) == null) {
        expUnknown = true
      } else if (Number(candSkill.years_experience) < Number(vs.minimum_years_experience)) {
        expPass = false
      }
    }

    if (!profPass) {
      checks.push({
        category: CHECK_CATEGORY.SKILLS,
        status: isRequired ? CHECK_STATUS.FAIL : CHECK_STATUS.WARNING,
        importance: vs.importance || IMPORTANCE.REQUIRED,
        code: REASON_CODES.SKILL_PROFICIENCY_BELOW_MINIMUM,
        message: `Skill '${vs.canonical_name}' proficiency '${candSkill.proficiency_level}' below required '${vs.minimum_proficiency}'`,
        details: { skill_id: vs.skill_id, skill_name: vs.canonical_name },
      })
    } else if (!expPass) {
      checks.push({
        category: CHECK_CATEGORY.SKILLS,
        status: isRequired ? CHECK_STATUS.FAIL : CHECK_STATUS.WARNING,
        importance: vs.importance || IMPORTANCE.REQUIRED,
        code: REASON_CODES.SKILL_EXPERIENCE_BELOW_MINIMUM,
        message: `Skill '${vs.canonical_name}' experience (${candSkill.years_experience} yrs) below required (${vs.minimum_years_experience} yrs)`,
        details: { skill_id: vs.skill_id, skill_name: vs.canonical_name },
      })
    } else if (profUnknown) {
      checks.push({
        category: CHECK_CATEGORY.SKILLS,
        status: isRequired ? CHECK_STATUS.UNKNOWN : CHECK_STATUS.WARNING,
        importance: vs.importance || IMPORTANCE.REQUIRED,
        code: REASON_CODES.SKILL_PROFICIENCY_UNKNOWN,
        message: `Skill '${vs.canonical_name}' proficiency unspecified; vacancy requires '${vs.minimum_proficiency}' (requires review)`,
        details: { skill_id: vs.skill_id, skill_name: vs.canonical_name },
      })
    } else if (expUnknown) {
      checks.push({
        category: CHECK_CATEGORY.SKILLS,
        status: isRequired ? CHECK_STATUS.UNKNOWN : CHECK_STATUS.WARNING,
        importance: vs.importance || IMPORTANCE.REQUIRED,
        code: REASON_CODES.SKILL_EXPERIENCE_UNKNOWN,
        message: `Skill '${vs.canonical_name}' years of experience unspecified`,
        details: { skill_id: vs.skill_id, skill_name: vs.canonical_name },
      })
    } else {
      checks.push({
        category: CHECK_CATEGORY.SKILLS,
        status: CHECK_STATUS.PASS,
        importance: vs.importance || IMPORTANCE.REQUIRED,
        code: isRequired ? REASON_CODES.REQUIRED_SKILL_PRESENT : REASON_CODES.PREFERRED_SKILL_PRESENT,
        message: `Skill present: ${vs.canonical_name}${candSkill.proficiency_level ? ` (${candSkill.proficiency_level})` : ''}`,
        details: { skill_id: vs.skill_id, skill_name: vs.canonical_name },
      })
    }
  }

  // -------------------------------------------------------------
  // 5. CERTIFICATIONS
  // -------------------------------------------------------------
  const certReqs = Array.isArray(vacancy.certification_requirements) ? vacancy.certification_requirements : []
  const candCerts = Array.isArray(jobseeker.certifications) ? jobseeker.certifications : []

  for (const vc of certReqs) {
    const isRequired = (vc.importance || IMPORTANCE.REQUIRED) === IMPORTANCE.REQUIRED
    const candCert = findQualification(candCerts,vc,'certification_id')

    if (!candCert) {
      checks.push({
        category: CHECK_CATEGORY.CERTIFICATIONS,
        status: isRequired ? CHECK_STATUS.UNKNOWN : CHECK_STATUS.WARNING,
        importance: vc.importance || IMPORTANCE.REQUIRED,
        code: isRequired ? REASON_CODES.REQUIRED_CERTIFICATION_MISSING : REASON_CODES.PREFERRED_CERTIFICATION_MISSING,
        message: `${isRequired ? 'Required' : 'Preferred'} certification missing: ${vc.canonical_name || 'Certification'}`,
        details: { certification_id: vc.certification_id, canonical_name: vc.canonical_name },
      })
      continue
    }

    const validity = certificationValidity(candCert,currentDate)
    if (isRequired && evidenceNeedsVerification(candCert) || vc.must_be_valid && validity == null) {
      checks.push({category:CHECK_CATEGORY.CERTIFICATIONS,status:isRequired?CHECK_STATUS.UNKNOWN:CHECK_STATUS.WARNING,
        importance:vc.importance||IMPORTANCE.REQUIRED,
        code:evidenceNeedsVerification(candCert)?REASON_CODES.QUALIFICATION_UNVERIFIED:REASON_CODES.CERTIFICATION_VALIDITY_UNKNOWN,
        message:'Certification evidence needs review before its validity can be confirmed',
        details:{certification_id:vc.certification_id,canonical_name:vc.canonical_name}})
      continue
    }
    if (vc.must_be_valid && validity === false) {
      checks.push({
        category: CHECK_CATEGORY.CERTIFICATIONS,
        status: isRequired ? CHECK_STATUS.FAIL : CHECK_STATUS.WARNING,
        importance: vc.importance || IMPORTANCE.REQUIRED,
        code: REASON_CODES.CERTIFICATION_EXPIRED,
        message: `Certification '${vc.canonical_name || 'Certification'}' is expired or invalid`,
        details: { certification_id: vc.certification_id, canonical_name: vc.canonical_name },
      })
    } else {
      checks.push({
        category: CHECK_CATEGORY.CERTIFICATIONS,
        status: CHECK_STATUS.PASS,
        importance: vc.importance || IMPORTANCE.REQUIRED,
        code: isRequired ? REASON_CODES.REQUIRED_CERTIFICATION_PRESENT : REASON_CODES.PREFERRED_CERTIFICATION_PRESENT,
        message: `Certification held: ${vc.canonical_name || 'Certification'}`,
        details: { certification_id: vc.certification_id, canonical_name: vc.canonical_name },
      })
    }
  }

  // -------------------------------------------------------------
  // 6. LANGUAGES
  // -------------------------------------------------------------
  const langReqs = Array.isArray(vacancy.language_requirements) ? vacancy.language_requirements : []
  const candLangs = Array.isArray(jobseeker.languages) ? jobseeker.languages : []

  for (const vl of langReqs) {
    const isRequired = (vl.importance || IMPORTANCE.REQUIRED) === IMPORTANCE.REQUIRED
    const candLang = findQualification(candLangs,vl,'language_id',{label:'name',code:'code'})

    if (!candLang) {
      checks.push({
        category: CHECK_CATEGORY.LANGUAGES,
        status: isRequired ? CHECK_STATUS.UNKNOWN : CHECK_STATUS.WARNING,
        importance: vl.importance || IMPORTANCE.REQUIRED,
        code: REASON_CODES.LANGUAGE_DATA_MISSING,
        message: `${isRequired ? 'Required' : 'Preferred'} language missing: ${vl.name || vl.code}`,
        details: { language_id: vl.language_id, name: vl.name },
      })
      continue
    }

    if (isRequired && evidenceNeedsVerification(candLang)) {
      checks.push({category:CHECK_CATEGORY.LANGUAGES,status:CHECK_STATUS.UNKNOWN,importance:IMPORTANCE.REQUIRED,
        code:REASON_CODES.QUALIFICATION_UNVERIFIED,message:'Recorded language verification requires review',details:{language_id:vl.language_id,name:vl.name}})
      continue
    }
    const dims = [
      { name: 'speaking', req: vl.minimum_speaking, cand: candLang.speaking_proficiency },
      { name: 'reading', req: vl.minimum_reading, cand: candLang.reading_proficiency },
      { name: 'writing', req: vl.minimum_writing, cand: candLang.writing_proficiency },
    ]

    let langPass = true
    let langUnknown = false
    let failDim = ''

    for (const d of dims) {
      if (d.req) {
        const reqRank = LANGUAGE_PROFICIENCY_MAP[d.req.toLowerCase()] ?? null
        if (!d.cand || reqRank == null || LANGUAGE_PROFICIENCY_MAP[d.cand.toLowerCase()] == null) {
          langUnknown = true
        } else {
          const candRank = LANGUAGE_PROFICIENCY_MAP[d.cand.toLowerCase()] || 0
          if (candRank < reqRank) {
            langPass = false
            failDim = d.name
            break
          }
        }
      }
    }

    if (!langPass) {
      checks.push({
        category: CHECK_CATEGORY.LANGUAGES,
        status: isRequired ? CHECK_STATUS.FAIL : CHECK_STATUS.WARNING,
        importance: vl.importance || IMPORTANCE.REQUIRED,
        code: isRequired ? REASON_CODES.LANGUAGE_REQUIREMENT_NOT_MET : REASON_CODES.LANGUAGE_PREFERRED_NOT_MET,
        message: `Language '${vl.name}' ${failDim} proficiency below required (${vl[`minimum_${failDim}`]})`,
        details: { language_id: vl.language_id, name: vl.name },
      })
    } else if (langUnknown && isRequired) {
      checks.push({
        category: CHECK_CATEGORY.LANGUAGES,
        status: CHECK_STATUS.UNKNOWN,
        importance: IMPORTANCE.REQUIRED,
        code: REASON_CODES.LANGUAGE_PROFICIENCY_UNKNOWN,
        message: `Language '${vl.name}' proficiency level unspecified (requires review)`,
        details: { language_id: vl.language_id, name: vl.name },
      })
    } else {
      checks.push({
        category: CHECK_CATEGORY.LANGUAGES,
        status: CHECK_STATUS.PASS,
        importance: vl.importance || IMPORTANCE.REQUIRED,
        code: isRequired ? REASON_CODES.LANGUAGE_REQUIREMENT_MET : REASON_CODES.LANGUAGE_PREFERRED_MET,
        message: `Language requirement satisfied: ${vl.name}`,
        details: { language_id: vl.language_id, name: vl.name },
      })
    }
  }

  // -------------------------------------------------------------
  // 7. EMPLOYMENT TYPE COMPATIBILITY (Soft)
  // -------------------------------------------------------------
  if (vacancy.employment_type_id) {
    const candPrefs = Array.isArray(jobseeker.employment_type_preferences)
      ? jobseeker.employment_type_preferences.map(p => p.employment_type_id || p)
      : []

    if (candPrefs.length > 0) {
      if (candPrefs.includes(vacancy.employment_type_id)) {
        checks.push({
          category: CHECK_CATEGORY.EMPLOYMENT_TYPE,
          status: CHECK_STATUS.PASS,
          importance: IMPORTANCE.COMPATIBILITY,
          code: REASON_CODES.EMPLOYMENT_TYPE_MATCH,
          message: `Employment type matches candidate preference: ${vacancy.employment_type_name || 'matched'}`,
        })
      } else {
        checks.push({
          category: CHECK_CATEGORY.EMPLOYMENT_TYPE,
          status: CHECK_STATUS.WARNING,
          importance: IMPORTANCE.COMPATIBILITY,
          code: REASON_CODES.EMPLOYMENT_TYPE_MISMATCH,
          message: `Vacancy employment type (${vacancy.employment_type_name || 'type'}) differs from candidate preference`,
        })
      }
    } else {
      checks.push({
        category: CHECK_CATEGORY.EMPLOYMENT_TYPE,
        status: CHECK_STATUS.PASS,
        importance: IMPORTANCE.INFORMATIONAL,
        code: REASON_CODES.EMPLOYMENT_TYPE_NEUTRAL,
        message: 'No specific employment type preference',
      })
    }
  }

  // -------------------------------------------------------------
  // 8. WORK ARRANGEMENT COMPATIBILITY (Soft)
  // -------------------------------------------------------------
  if (vacancy.work_arrangement_id) {
    const candPrefs = Array.isArray(jobseeker.work_arrangement_preferences)
      ? jobseeker.work_arrangement_preferences.map(p => p.work_arrangement_id || p)
      : []

    if (candPrefs.length > 0) {
      if (candPrefs.includes(vacancy.work_arrangement_id)) {
        checks.push({
          category: CHECK_CATEGORY.WORK_ARRANGEMENT,
          status: CHECK_STATUS.PASS,
          importance: IMPORTANCE.COMPATIBILITY,
          code: REASON_CODES.WORK_ARRANGEMENT_MATCH,
          message: `Work arrangement matches candidate preference: ${vacancy.work_arrangement_name || 'matched'}`,
        })
      } else {
        checks.push({
          category: CHECK_CATEGORY.WORK_ARRANGEMENT,
          status: CHECK_STATUS.WARNING,
          importance: IMPORTANCE.COMPATIBILITY,
          code: REASON_CODES.WORK_ARRANGEMENT_MISMATCH,
          message: `Vacancy arrangement (${vacancy.work_arrangement_name || 'arrangement'}) differs from candidate preference`,
        })
      }
    } else {
      checks.push({
        category: CHECK_CATEGORY.WORK_ARRANGEMENT,
        status: CHECK_STATUS.PASS,
        importance: IMPORTANCE.INFORMATIONAL,
        code: REASON_CODES.WORK_ARRANGEMENT_NEUTRAL,
        message: 'No specific work arrangement preference',
      })
    }
  }

  // -------------------------------------------------------------
  // 9. LOCATION COMPATIBILITY (Soft)
  // -------------------------------------------------------------
  if (vacancy.province || vacancy.municipality_city) {
    const vacProv = (vacancy.province || '').trim().toLowerCase()
    const vacCity = (vacancy.municipality_city || '').trim().toLowerCase()

    const candLocs = Array.isArray(jobseeker.location_preferences)
      ? jobseeker.location_preferences.map(l => ({
          province: (l.province || '').trim().toLowerCase(),
          city: (l.municipality_city || '').trim().toLowerCase(),
        }))
      : []

    if (candLocs.length === 0 && (jobseeker.province || jobseeker.municipality_city)) {
      candLocs.push({
        province: (jobseeker.province || '').trim().toLowerCase(),
        city: (jobseeker.municipality_city || '').trim().toLowerCase(),
      })
    }

    if (candLocs.length > 0) {
      const exactMatch = candLocs.some(l => (!vacProv || l.province === vacProv) && (!vacCity || l.city === vacCity))
      const provMatch = candLocs.some(l => vacProv && l.province === vacProv)

      if (exactMatch) {
        checks.push({
          category: CHECK_CATEGORY.LOCATION,
          status: CHECK_STATUS.PASS,
          importance: IMPORTANCE.COMPATIBILITY,
          code: REASON_CODES.LOCATION_MATCH,
          message: `Location matched: ${vacancy.municipality_city || ''}, ${vacancy.province || ''}`.replace(/^,\s*/, ''),
        })
      } else if (provMatch) {
        checks.push({
          category: CHECK_CATEGORY.LOCATION,
          status: CHECK_STATUS.PASS,
          importance: IMPORTANCE.COMPATIBILITY,
          code: REASON_CODES.LOCATION_PROVINCE_MATCH,
          message: `Location in same province: ${vacancy.province}`,
        })
      } else if (jobseeker.willing_to_relocate) {
        checks.push({
          category: CHECK_CATEGORY.LOCATION,
          status: CHECK_STATUS.PASS,
          importance: IMPORTANCE.COMPATIBILITY,
          code: REASON_CODES.RELOCATION_ACCEPTED,
          message: 'Location differs but candidate is willing to relocate',
        })
      } else {
        checks.push({
          category: CHECK_CATEGORY.LOCATION,
          status: CHECK_STATUS.WARNING,
          importance: IMPORTANCE.COMPATIBILITY,
          code: REASON_CODES.LOCATION_MISMATCH,
          message: `Location differs (${vacancy.municipality_city || ''}, ${vacancy.province || ''}) and candidate not marked willing to relocate`,
        })
      }
    } else {
      checks.push({
        category: CHECK_CATEGORY.LOCATION,
        status: CHECK_STATUS.PASS,
        importance: IMPORTANCE.INFORMATIONAL,
        code: REASON_CODES.LOCATION_NO_PREFERENCE,
        message: 'No location preference specified',
      })
    }
  }

  // -------------------------------------------------------------
  // 10. SALARY COMPATIBILITY (Soft)
  // -------------------------------------------------------------
  if (vacancy.salary_min != null || vacancy.salary_max != null) {
    const vacMax = vacancy.salary_max != null ? Number(vacancy.salary_max) : null
    const candMin = jobseeker.desired_salary_min != null ? Number(jobseeker.desired_salary_min) : null
    const vacPeriod = (vacancy.salary_period || 'monthly').toLowerCase()
    const candPeriod = (jobseeker.desired_salary_period || 'monthly').toLowerCase()

    if (candMin == null) {
      checks.push({
        category: CHECK_CATEGORY.SALARY,
        status: CHECK_STATUS.PASS,
        importance: IMPORTANCE.INFORMATIONAL,
        code: REASON_CODES.SALARY_COMPARISON_UNKNOWN,
        message: 'Candidate salary expectation not specified',
      })
    } else if (vacPeriod !== candPeriod) {
      checks.push({
        category: CHECK_CATEGORY.SALARY,
        status: CHECK_STATUS.WARNING,
        importance: IMPORTANCE.COMPATIBILITY,
        code: REASON_CODES.SALARY_COMPARISON_UNKNOWN,
        message: `Salary period differs (${candPeriod} vs ${vacPeriod})`,
      })
    } else if (vacMax != null && candMin > vacMax && !vacancy.salary_negotiable) {
      checks.push({
        category: CHECK_CATEGORY.SALARY,
        status: CHECK_STATUS.WARNING,
        importance: IMPORTANCE.COMPATIBILITY,
        code: REASON_CODES.SALARY_EXPECTATION_ABOVE_RANGE,
        message: `Candidate desired minimum (${candMin}) exceeds vacancy maximum (${vacMax})`,
        details: { candidate_min: candMin, vacancy_max: vacMax },
      })
    } else {
      checks.push({
        category: CHECK_CATEGORY.SALARY,
        status: CHECK_STATUS.PASS,
        importance: IMPORTANCE.COMPATIBILITY,
        code: REASON_CODES.SALARY_COMPATIBLE,
        message: 'Salary expectations compatible',
      })
    }
  }

  // -------------------------------------------------------------
  // 11. AVAILABILITY COMPATIBILITY (Soft)
  // -------------------------------------------------------------
  if (jobseeker.availability_status) {
    const st = jobseeker.availability_status.toLowerCase()
    if (st === 'not_currently_available') {
      checks.push({
        category: CHECK_CATEGORY.AVAILABILITY,
        status: CHECK_STATUS.WARNING,
        importance: IMPORTANCE.COMPATIBILITY,
        code: REASON_CODES.AVAILABILITY_MISMATCH,
        message: 'Candidate marked as not currently looking for work',
      })
    } else {
      checks.push({
        category: CHECK_CATEGORY.AVAILABILITY,
        status: CHECK_STATUS.PASS,
        importance: IMPORTANCE.COMPATIBILITY,
        code: REASON_CODES.AVAILABLE,
        message: `Candidate available: ${jobseeker.availability_status}`,
      })
    }
  } else {
    checks.push({
      category: CHECK_CATEGORY.AVAILABILITY,
      status: CHECK_STATUS.PASS,
      importance: IMPORTANCE.INFORMATIONAL,
      code: REASON_CODES.AVAILABILITY_UNKNOWN,
      message: 'Availability status not specified',
    })
  }

  // -------------------------------------------------------------
  // A free-text requirement cannot be treated as verified eligibility.
  for (const warning of reviewVacancyRequirements(vacancy)) {
    checks.push({
      category: CHECK_CATEGORY.REQUIREMENT_REVIEW,
      status: CHECK_STATUS.UNKNOWN,
      importance: IMPORTANCE.REQUIRED,
      code: REASON_CODES.VACANCY_TEXT_REQUIREMENT_UNRESOLVED,
      message: `Vacancy ${warning.field.replaceAll('_', ' ')} may contain an unchecked mandatory requirement: "${warning.source}"`,
      details: { source_field: warning.field, source_text: warning.source, kind: warning.kind },
    })
  }

  // AGGREGATE FINAL RESULT
  // -------------------------------------------------------------
  const blockingChecks = checks.filter(c => c.status === CHECK_STATUS.FAIL && c.importance === IMPORTANCE.REQUIRED)
  const unknownRequiredChecks = checks.filter(c => c.status === CHECK_STATUS.UNKNOWN && c.importance === IMPORTANCE.REQUIRED)
  const warningChecks = checks.filter(c => c.status === CHECK_STATUS.WARNING)
  const passedChecks = checks.filter(c => c.status === CHECK_STATUS.PASS)

  let finalStatus = ELIGIBILITY_STATUS.ELIGIBLE
  if (blockingChecks.length > 0) {
    finalStatus = ELIGIBILITY_STATUS.INELIGIBLE
  } else if (unknownRequiredChecks.length > 0) {
    finalStatus = ELIGIBILITY_STATUS.CONDITIONALLY_ELIGIBLE
  }

  const requiredChecks=checks.filter(check=>check.importance===IMPORTANCE.REQUIRED)
  return {
    rules_version:ELIGIBILITY_RULES_VERSION,
    evaluated_at:currentDate.toISOString(),
    data_confidence:{required_total:requiredChecks.length,required_known:requiredChecks.length-unknownRequiredChecks.length,
      required_unknown:unknownRequiredChecks.length,required_failed:blockingChecks.length,
      definition:'Recorded required-check coverage; not independently verified qualification or hiring probability'},
    status: finalStatus,
    checks,
    blocking_reasons: blockingChecks.map(c => c.code),
    warnings: warningChecks.map(c => c.code),
    passed_checks: passedChecks,
    unknown_checks: unknownRequiredChecks,
  }
}
