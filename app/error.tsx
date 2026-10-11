'use client'; // Error boundaries must be Client Components

import { useEffect } from 'react';
import Link from 'next/link';
import StatusMessage, { statusButtonStyle } from '@/components/ui/StatusMessage';

/**
 * Shown instead of a page that crashed while rendering. The sidebar (root
 * layout) stays, so the user can move on to another page.
 */
export default function Error({ error, retry }: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error('[page error]', error.digest ?? '', error);
  }, [error]);

  return (
    <StatusMessage
      title="משהו השתבש בטעינת הדף"
      text="הנתונים שלך שמורים. אפשר לנסות שוב, ואם הבעיה חוזרת — לרענן את הדף או לחזור לדשבורד."
    >
      <button onClick={() => retry()} style={statusButtonStyle(true)}>נסי שוב</button>
      <Link href="/" style={statusButtonStyle(false)}>חזרה לדשבורד</Link>
    </StatusMessage>
  );
}
