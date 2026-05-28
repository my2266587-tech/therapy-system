'use client';

/**
 * Live-sync hook for the `sessions` table.
 *
 * Both /calendar and /sessions render the same underlying rows. They've
 * always been DB-synced (same SELECT against `sessions`), but each page
 * only re-fetched on mount — so a session created in one tab wouldn't
 * appear in the other until the second tab was reloaded.
 *
 * This hook subscribes to Postgres CDC on the `sessions` table via
 * Supabase Realtime. Any INSERT / UPDATE / DELETE event coming from
 * any client (or from the cron, or psql, or another tab) triggers the
 * caller's reload callback. The reload is debounced lightly so a burst
 * of edits doesn't hammer the page.
 *
 * Realtime must be enabled on the table at the DB level:
 *
 *     alter publication supabase_realtime add table sessions;
 *
 * (See the matching block in supabase/schema.sql.)
 *
 * The hook is intentionally minimal — it returns nothing. The host
 * component already owns the data fetch; we just call its existing
 * `load()` again.
 */

import { useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';

export function useSessionsLiveSync(reload: () => void | Promise<void>) {
  // Keep the latest callback in a ref so the subscription effect can stay
  // stable across renders without re-subscribing every time the parent
  // re-renders (which would happen e.g. on every state change).
  const reloadRef = useRef(reload);
  useEffect(() => { reloadRef.current = reload; }, [reload]);

  useEffect(() => {
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleReload = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      // 200ms debounce — drag-and-drop in the calendar fires update + a
      // follow-up reload from the local handler; without this we'd run
      // load() twice in quick succession.
      debounceTimer = setTimeout(() => {
        reloadRef.current();
      }, 200);
    };

    // `as never` keeps the literal event tag through whichever overload
    // of `.on()` the installed SDK version picks. The event string is
    // the Supabase Realtime CDC channel; nothing here is dynamic.
    const channel = supabase
      .channel('sessions-live')
      .on(
        'postgres_changes' as never,
        { event: '*', schema: 'public', table: 'sessions' },
        () => scheduleReload(),
      )
      .subscribe();

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      supabase.removeChannel(channel);
    };
  }, []);
}
