export type UserRole = 'super_admin' | 'creator' | 'executor'

export interface AppUser {
  uid: string
  email: string
  displayName: string
  role: UserRole
  isActive: boolean
  createdAt: string
}

export type ProjectType = 'forum' | 'training'

export interface Project {
  id: string
  title: string
  type: ProjectType
  description: string
  creatorId: string
  executorIds: string[]
  createdAt: string
  updatedAt: string
}

export type SessionStatus = 'draft' | 'active' | 'closed'

export interface Session {
  id: string
  projectId: string
  name: string
  date: string
  status: SessionStatus
  templateId: string
  language: string
  shareToken: string
  qrCodeUrl?: string
  createdAt: string
}

export type QuestionType = 'single' | 'multiple' | 'scale' | 'text'
export type TemplateType = 'survey' | 'quiz'

export interface Question {
  id: string
  type: QuestionType
  text: Record<string, string>          // { 'zh-TW': '...', 'en': '...' }
  options?: Record<string, string[]>    // { 'zh-TW': ['...'], 'en': ['...'] }
  correctAnswer?: string | string[]     // quiz only
  score?: number                        // quiz only
  explanation?: Record<string, string>  // quiz answer explanation
  required: boolean
}

export interface Template {
  id: string
  title: string
  type: TemplateType
  creatorId: string
  projectId: string | null
  language: string
  questions: Question[]
  createdAt: string
  updatedAt: string
}

export interface Response {
  id: string
  sessionId: string
  projectId: string
  company: string
  respondentName: string
  respondentEmail: string
  submittedAt: string
  timeSpent: number
  score?: number
  totalScore?: number
  answers: Answer[]
}

export interface Answer {
  questionId: string
  value: string | string[]
  isCorrect?: boolean
}
