export const patientStatusLabels: Record<string, string> = {
  active:   'פעילה',
  inactive: 'לא פעילה',
  waiting:  'בהמתנה',
};

export const housingTypeLabels: Record<string, string> = {
  independent:    'עצמאיות',
  regular:        'רגיל',
  rehabilitation: 'משקם',
};

export const staffRoleLabels: Record<string, string> = {
  coordinator: 'רכזת',
  instructor:  'מדריכה',
  therapist:   'מטפלת',
  other:       'אחר',
};

export const sessionStatusLabels: Record<string, string> = {
  planned:         'מתוכננת',
  completed:       'התקיימה',
  cancelled:       'בוטלה',
  no_show:         'לא הגיעה',
  pending_summary: 'ממתין לסיכום',
};

export const recordingStatusLabels: Record<string, string> = {
  pending:     'ממתין לתמלול',
  transcribed: 'תומלל',
  draft_ready: 'טיוטה מוכנה',
  approved:    'אושר',
};

export const paymentMethodLabels: Record<string, string> = {
  bank_transfer: 'העברה בנקאית',
  cash:          'מזומן',
  check:         "צ'ק",
  other:         'אחר',
};

export const emailStatusLabels: Record<string, string> = {
  not_sent: 'לא נשלח',
  sent:     'נשלח',
  failed:   'שגיאה',
};

export const documentTypeLabels: Record<string, string> = {
  personal_document:         'מסמך אישי',
  psychological_tracking:    'מעקב פסיכולוגי',
  session_summary_document:  'סיכום פגישה — מסמך',
  other:                     'אחר',
};

export const treatmentTypeOptions = [
  'אומנות', 'תרפיה', 'פיסול', 'מוזיקה', 'תנועה', 'אחר',
];
