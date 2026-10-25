import {Navigate} from 'react-router-dom'
import {useAuth} from '../../contexts/AuthContext.jsx'
import KnowledgeReviewContent from '../../components/knowledge/KnowledgeReviewContent.jsx'
import {occupationKnowledgeService as api,knowledgeReviewState} from '../../services/occupationKnowledgeService.js'
const config={
 title:'Occupation skill review',reviewTitle:'Review occupation skill',
 description:'Review shared occupation-to-skill links with source evidence. Pending, rejected or outdated links are excluded from reviewed knowledge.',
 reviewDescription:'Review the occupation-to-skill relationship against its source. Approval does not verify a jobseeker’s skills or add a vacancy requirement.',
 leftName:row=>row.occupation?.canonical_name??'Unavailable occupation',rightName:row=>row.skill?.canonical_name??'Unavailable skill',
 label:row=>(row.occupation?.canonical_name??'Unavailable occupation')+' → '+(row.skill?.canonical_name??'Unavailable skill'),
 isActive:row=>!!row.occupation?.is_active&&!!row.skill?.is_active,reviewState:knowledgeReviewState,
}
export default function OccupationKnowledgePage(){
 const {user,profile}=useAuth()
 return profile?.role==='admin'?<KnowledgeReviewContent key={user?.id} api={api} config={config}/>:<Navigate to="/" replace/>
}
