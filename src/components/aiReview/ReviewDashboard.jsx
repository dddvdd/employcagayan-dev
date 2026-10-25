import {useState} from 'react'
import GenerationPanel from './GenerationPanel.jsx'
import { useAuth } from '../../contexts/AuthContext.jsx'
import ExtractionQueue from './ExtractionQueue.jsx'
import RoleGuard from './RoleGuard.jsx'
import ThemeToggle from '../ThemeToggle.jsx'

const DESCRIPTIONS = {
  admin: 'Review pending AI extraction suggestions across jobseeker profiles and vacancies. Accept, reject, or edit suggestions through the review RPCs.',
  staff: 'Review pending AI extraction suggestions across jobseeker profiles and vacancies. Accept, reject, or edit suggestions through the review RPCs.',
  supervisor: 'Review pending AI extraction suggestions within your authorized event jurisdiction. Provincial supervisors retain provincial oversight.',
  applicant: 'Review pending AI extraction suggestions for your own jobseeker profile. Historical work signals stay separate from career preferences.',
  employer: 'Review pending AI extraction suggestions for your own vacancies. Requirement suggestions remain scoped to vacancies you manage.',
}

export default function ReviewDashboard() {
  const { profile, user } = useAuth()
  const [target,setTarget] = useState(null)
  const [refresh,setRefresh] = useState(0)
  const activeTarget = target?.owner === user?.id ? target : null
  const role = profile?.role
  const isApplicant = role === 'applicant'
  const isEmployer = role === 'employer'
  const entityType = isApplicant ? 'jobseeker_profile' : isEmployer ? 'vacancy' : undefined
  const title = isApplicant ? 'My AI Profile Review' : isEmployer ? 'Vacancy AI Review' : 'AI Extraction Review'

  return (
    <RoleGuard>
      <main className="min-h-screen bg-slate-50 px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <ExtractionQueue
            key={(user?.id??'anonymous')+':'+(activeTarget?.id??'all')+':'+refresh}
            title={title}
            description={DESCRIPTIONS[role]}
            entityType={activeTarget?.type??entityType}
            entityId={activeTarget?.id}
            headerAction={isApplicant ? <ThemeToggle /> : ['admin','staff','supervisor'].includes(role) ? <GenerationPanel key={user?.id} onReady={value=>{setTarget({...value,owner:user?.id});setRefresh(n=>n+1)}}/> : null}
          />
        </div>
      </main>
    </RoleGuard>
  )
}
