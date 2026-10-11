import Link from 'next/link';
import StatusMessage, { statusButtonStyle } from '@/components/ui/StatusMessage';

export default function NotFound() {
  return (
    <StatusMessage
      title="הדף לא נמצא"
      text="ייתכן שהקישור שגוי, או שהרשומה נמחקה."
    >
      <Link href="/" style={statusButtonStyle(true)}>חזרה לדשבורד</Link>
    </StatusMessage>
  );
}
