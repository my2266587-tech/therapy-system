// תרגומי ערכי DB לעברית — לשימוש בכל המערכת

export const patientStatusLabels: Record<string, string> = {
  active: 'פעילה',
  inactive: 'לא פעילה',
  waiting: 'בהמתנה',
};

export const housingTypeLabels: Record<string, string> = {
  independent: 'עצמאיות',
  regular: 'רגיל',
  rehabilitation: 'משקם',
};

export const maritalStatusLabels: Record<string, string> = {
  single: 'רווקה',
  married: 'נשואה',
  divorced: 'גרושה',
  widowed: 'אלמנה',
};

export const staffRoleLabels: Record<string, string> = {
  coordinator: 'רכזת',
  instructor: 'מדריכה',
  therapist: 'מטפלת',
  other: 'אחר',
};

export const sessionStatusLabels: Record<string, string> = {
  planned: 'מתוכננת',
  completed: 'התקיימה',
  cancelled: 'בוטלה',
  no_show: 'לא הגיעה',
};

export const recordingStatusLabels: Record<string, string> = {
  pending: 'ממתין לתמלול',
  transcribed: 'תומלל',
  draft_ready: 'טיוטה מוכנה',
  approved: 'אושר',
};

export const paymentMethodLabels: Record<string, string> = {
  bank_transfer: 'העברה בנקאית',
  cash: 'מזומן',
  check: "צ'ק",
  other: 'אחר',
};

export const emailStatusLabels: Record<string, string> = {
  not_sent: 'לא נשלח',
  sent: 'נשלח',
  failed: 'שגיאה',
};

export const treatmentTypeOptions = [
  'אומנות',
  'תרפיה',
  'פיסול',
  'מוזיקה',
  'תנועה',
  'אחר',
];
