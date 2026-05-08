export interface StaffMember {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  role: 'coordinator' | 'instructor' | 'therapist' | 'other';
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Patient {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  status: 'active' | 'inactive' | 'waiting';
  coordinator_id: string | null;
  staff_id: string | null;
  apartment_address: string | null;
  housing_type: 'independent' | 'regular' | 'rehabilitation' | null;
  father_name: string | null;
  mother_name: string | null;
  family_position: string | null;
  home_address: string | null;
  marital_status: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  coordinator?: { full_name: string } | null;
  staff_member?: { full_name: string } | null;
}

export interface Session {
  id: string;
  patient_id: string;
  date: string;
  start_time: string;
  end_time: string;
  duration_minutes: number | null;
  status: 'planned' | 'completed' | 'cancelled' | 'no_show';
  notes: string | null;
  created_at: string;
  updated_at: string;
  patient?: { full_name: string } | null;
}

export interface SessionSummary {
  id: string;
  patient_id: string;
  session_id: string | null;
  date: string;
  start_time: string | null;
  end_time: string | null;
  duration_minutes: number | null;
  current_state: string | null;
  main_topics: string | null;
  treatment_actions: string | null;
  next_steps: string | null;
  tasks_given: string | null;
  progress: string | null;
  difficulties: string | null;
  notes: string | null;
  attachment_url: string | null;
  created_at: string;
  updated_at: string;
  patient?: { full_name: string } | null;
}

export interface Recording {
  id: string;
  patient_id: string;
  recorded_at: string;
  audio_url: string | null;
  transcript: string | null;
  draft_summary: string | null;
  status: 'pending' | 'transcribed' | 'draft_ready' | 'approved';
  created_at: string;
  updated_at: string;
  patient?: { full_name: string } | null;
}

export interface QuarterlySummary {
  id: string;
  patient_id: string;
  date: string;
  participants: string | null;
  summary: string | null;
  duration_minutes: number | null;
  attachment_url: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  patient?: { full_name: string } | null;
}

export interface Payment {
  id: string;
  month: string;
  amount: number;
  is_paid: boolean;
  payment_method: 'bank_transfer' | 'cash' | 'check' | 'other' | null;
  received_date: string | null;
  coordinator_id: string | null;
  email_status: 'not_sent' | 'sent' | 'failed';
  created_at: string;
  updated_at: string;
  coordinator?: { full_name: string } | null;
}

export interface PrivateExpense {
  id: string;
  patient_id: string;
  date: string;
  treatment_type: string;
  materials: string | null;
  details: string | null;
  cost: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
  patient?: { full_name: string } | null;
}

export interface PatientDocument {
  id: string;
  patient_id: string;
  file_name: string;
  storage_path: string;
  mime_type: string | null;
  file_size: number | null;
  uploaded_at: string;
  created_at: string;
  updated_at: string;
}

export interface PatientDocumentWithUrl extends PatientDocument {
  url: string;
}

export interface PettyCash {
  id: string;
  date: string;
  amount: number;
  purpose: string;
  patient_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  patient?: { full_name: string } | null;
}
