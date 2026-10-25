import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

const TITLES = {
  '/admin/occupation-skills': 'Occupation skill review',
  '/admin/skill-relationships': 'Skill relationship review',
  '/': 'Jobs and job fairs',
  '/login': 'Sign in',
  '/auth/callback': 'Verify your account',
  '/auth/mfa': 'Authenticator verification',
  '/partner/accreditation': 'Employer accreditation',
  '/calendar': 'Employment calendar',
  '/jobs': 'Browse jobs',
  '/profile': 'Jobseeker profile',
  '/register': 'Complete your jobseeker profile',
  '/register-employer': 'Employer registration',
  '/register-employer/complete': 'Complete employer registration',
  '/pass': 'Participant pass',
  '/jobseeker/work-experience': 'Work experience',
  '/jobseeker/skill-set': 'Skills',
  '/jobseeker/education': 'Education',
  '/jobseeker/certifications': 'Certifications and licenses',
  '/jobseeker/languages': 'Languages',
  '/jobseeker/preferences': 'Job preferences',
  '/jobseeker/ai-review': 'Profile review',
  '/jobseeker/recommendations': 'Recommended jobs',
  '/jobseeker/applications': 'My applications',
  '/staff/scanner': 'Event check-in scanner',
  '/staff/search': 'Find a registrant',
  '/staff/walkin': 'Walk-in registration',
  '/staff/interview-log': 'Interview log',
  '/staff/medical-referral': 'Medical referrals',
  '/admin/dashboard': 'Administration dashboard',
  '/admin/intelligence': 'Employment intelligence',
  '/admin/reports': 'Employment reports',
  '/admin/registrants': 'Registrant management',
  '/admin/users': 'User management',
  '/admin/events': 'Event management',
  '/admin/vacancies': 'Vacancy management',
  '/admin/review': 'Profile review',
  '/admin/interviews': 'Interview management',
  '/admin/applications': 'Application tracking',
  '/admin/outcomes': 'Employment outcomes',
  '/admin/employers': 'Employer management',
  '/admin/programs': 'Employment programs',
  '/admin/follow-ups': 'Participant follow-ups',
  '/supervisor': 'Supervisor dashboard',
  '/supervisor/reports': 'Supervisor reports',
  '/medical/dashboard': 'Medical referrals',
  '/employer/dashboard': 'Employer vacancies',
  '/employer/ai-review': 'Candidate review',
  '/employer/inbox': 'Application inbox',
}

function getTitle(pathname) {
  if (TITLES[pathname]) return TITLES[pathname]
  if (pathname.startsWith('/events/')) return 'Job fair details'
  if (pathname.startsWith('/jobs/')) return 'Job details'
  if (pathname.startsWith('/participation/') || pathname.startsWith('/ticket/')) return 'Event registration'
  if (pathname.startsWith('/employer/recommendations/')) return 'Recommended candidates'
  if (pathname.startsWith('/employer/inbox/')) return 'Vacancy applications'
  if (pathname.startsWith('/admin/program-cycles/')) return 'Program cycle'
  if (pathname.startsWith('/admin/programs/')) return 'Program details'
  if (pathname.startsWith('/staff/checkin/')) return 'Registrant check-in'
  return 'Employment services'
}

export default function RouteDocumentTitle() {
  const { pathname } = useLocation()
  useEffect(() => {
    document.title = `${getTitle(pathname)} | Trabaho Caravan`
  }, [pathname])
  return null
}
