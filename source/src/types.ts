export type Role = 'supervisor' | 'professional'
export type MascotKey = 'apple' | 'flame' | 'puffin' | 'worm' | 'cat' | 'llama' | 'glucometer' | 'pineapple' | 'dumbbell'

export interface Staff {
  id: string
  user_id: string | null
  display_name: string
  username: string
  role: Role
  mascot_key: MascotKey
  active: boolean
  weekly_minutes: number
  notes?: string | null
}

export interface Consultation {
  id: string
  label: string
  short_label: string
  color: string
  active: boolean
  default_start_time?: string
  default_end_time?: string
  coverage_rules?: CoverageRule[] | null
}

export interface Assignment {
  id: string
  professional_id: string
  work_date: string
  consultation_id: string
  start_time: string
  end_time: string
  notes?: string | null
  provisional: boolean
  override_reason?: string | null
  updated_at?: string
}

export type RequestType = 'vacation' | 'permission' | 'swap' | 'preference' | 'correction'
export type RequestStatus = 'pending' | 'approved' | 'rejected'

export interface ShiftRequest {
  id: string
  professional_id: string
  created_by?: string | null
  request_type: RequestType
  date_from: string
  date_to: string
  details: string
  status: RequestStatus
  supervisor_response?: string | null
  supervisor_seen_at?: string | null
  professional_seen_at?: string | null
  created_at: string
}

export interface PersonalTask {
  id: string
  professional_id: string
  task_date: string
  title: string
  completed: boolean
}

export interface BroadcastRecipient {
  staff_id: string
  read_at: string | null
}

export interface TeamBroadcast {
  id: string
  title: string
  message: string
  created_by: string
  created_at: string
  et_broadcast_recipients: BroadcastRecipient[]
}

export interface CoverageRule {
  id: string
  weekdays: number[]
  start_time: string
  end_time: string
  min_staff: number
  every_weeks: number
  anchor_date: string
  monthly: boolean
  valid_from: string
  valid_until: string
  suspensions: { from: string; to: string }[]
  alternatives?: string[]
}
export interface AssignmentHistory {
  id: string
  assignment_id: string
  action: 'INSERT' | 'UPDATE' | 'DELETE'
  actor_name: string
  changed_at: string
  before_data: Assignment | null
  after_data: Assignment | null
}

export interface CoverageProfile {
  staff_id: string
  consultation_ids: string[]
  updated_at?: string
}
