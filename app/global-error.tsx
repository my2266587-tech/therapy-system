'use client'; // Error boundaries must be Client Components

import StatusMessage, { statusButtonStyle } from '@/components/ui/StatusMessage';

/**
 * Last-resort screen when the root layout itself fails. It replaces the whole
 * document, so it brings its own <html>/<body> and uses inline styles only.
 */
export default function GlobalError({ retry }: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <html lang="he" dir="rtl">
      <body style={{ margin: 0, backgroundColor: '#F6F8FB' }}>
        <title>שגיאה – מחר אחר</title>
        <StatusMessage
          title="המערכת נתקלה בשגיאה"
          text="הנתונים שלך שמורים. נסי שוב בעוד רגע."
        >
          <button onClick={() => retry()} style={statusButtonStyle(true)}>נסי שוב</button>
        </StatusMessage>
      </body>
    </html>
  );
}
