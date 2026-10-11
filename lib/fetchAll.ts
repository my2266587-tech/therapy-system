/**
 * Supabase (PostgREST) returns at most 1000 rows per request — silently.
 * Any "load the whole table" query therefore needs paging, or rows beyond
 * the first 1000 just disappear (e.g. the newest sessions in an ascending
 * calendar, or duplicate checks that miss existing rows).
 *
 * Usage — build the query fresh for each page, ending with .range(from, to),
 * and order by a unique column last so pages never overlap or skip:
 *
 *   const { data, error } = await fetchAll<Session>((from, to) =>
 *     supabase.from('sessions').select('*')
 *       .order('date').order('id').range(from, to));
 */

const PAGE_SIZE = 1000;

type Page<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

export async function fetchAll<T>(
  page: (from: number, to: number) => Page<T>,
): Promise<{ data: T[]; error: { message: string } | null }> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) return { data: rows, error };
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) return { data: rows, error: null };
  }
}
