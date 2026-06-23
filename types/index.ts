export type StaffRole =
  | 'coordinator'    // רכזת
  | 'instructor'     // מדריכה
  | 'therapist'      // מטפלת
  | 'manager'        // מנהל
  | 'kabas'          // קב"ס
  | 'social_worker'  // עו"ס
  | 'other';

export interface StaffMember {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  role: StaffRole;
  /** Optional employee number for the monthly hours report (G2 in
   *  public/templates/monthly-report-template.xlsx). */
  employee_number: string | null;
  notes: string | null;
  /** False = suspended (מושהית). Non-destructive: existing patient links,
   *  documents and history stay; the member is just hidden from new-
   *  assignment pickers and badged in the UI. */
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface StaffDocument {
  id: string;
  staff_id: string;
  file_name: string;
  storage_path: string;
  mime_type: string | null;
  file_size: number | null;
  uploaded_at: string;
  created_at: string;
  updated_at: string;
}

export interface StaffDocumentWithUrl extends StaffDocument {
  url: string;
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
  /** Free-text fallbacks added by the import flow when a CSV's
   *  "רכזת" / "מדריכה" / "צוות" name didn't resolve to an existing
   *  staff row. Display these alongside the FK-resolved name when the
   *  FK is null but the text is set. */
  coordinator_name: string | null;
  guide_name:       string | null;
  team_name:        string | null;
  /** Catch-all jsonb populated by the importer when the CSV had columns
   *  we couldn't otherwise map. Surfaced as an "extra fields" section
   *  in the patient details so nothing is invisible. */
  import_metadata:  Record<string, string> | null;
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
  /** True when the session included a billable trip. */
  is_travel: boolean;
  /** Mode of transport — taxi / bus / other. Null when is_travel = false. */
  travel_mode: 'taxi' | 'bus' | 'other' | null;
  /** Trip cost the clinician paid, in ILS. Free-form (not computed). */
  travel_cost: number | null;
  /** Legacy column kept for compatibility — no UI uses it now. */
  travel_distance_km: number | null;
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
  attachment_path: string | null;
  attachment_name: string | null;
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
  // Set on rows auto-created from a session summary for the patient שיראל (the
  // ₪150 per-summary payments). NULL for the manually-entered monthly rows.
  summary_id?: string | null;
  // Free-text notes ("הערות"), editable in the payments UI.
  notes?: string | null;
  created_at: string;
  updated_at: string;
  coordinator?: { full_name: string } | null;
  // Embedded date of the linked session summary (when summary_id is set) —
  // used by the payments list to show the real session date, not just month.
  summary?: { date: string } | null;
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

export interface PhoneSummaryDraft {
  id: string;
  spoken_patient_name: string | null;
  matched_patient_id: string | null;
  match_status: 'matched' | 'ambiguous' | 'not_found';
  current_state: string | null;
  main_topics: string | null;
  treatment_actions: string | null;
  next_steps: string | null;
  tasks_given: string | null;
  progress: string | null;
  difficulties: string | null;
  notes: string | null;
  call_date: string | null;
  call_start_time: string | null;
  call_end_time: string | null;
  status: 'draft_ready' | 'needs_match' | 'failed' | 'approved';
  source_transcript: string | null;
  error_message: string | null;
  approved_summary_id: string | null;
  approved_at: string | null;
  approved_by: string | null;
  created_at: string;
  updated_at: string;
  /** When fetched with a join — the matched patient's display name. */
  matched_patient?: { full_name: string } | null;
}
