/**
 * Calendar arithmetic for the cron-driven monthly report.
 *
 * The cron fires on the 1st of each month and needs to produce the
 * report for the month that just ENDED. "Previous month" here means
 * the calendar month immediately before `today`, including its year
 * — so 2027-01-01 must yield December 2026, not January 2027.
 *
 * Today is injectable so the harness can verify the January boundary
 * (and any future DST / leap-year edge cases) without mocking the clock.
 */

export function getPreviousMonth(today: Date = new Date()): { year: number; month: number } {
  // Start from day=1 to dodge the "Mar 31 minus one month = Mar 3"
  // trap that bites when you call setMonth() on a Date whose day
  // doesn't exist in the previous month. With day=1 we're always
  // safe: subtracting one rolls back exactly one calendar month and
  // — crucially — rolls the year back when crossing the January
  // boundary.
  const d = new Date(today.getFullYear(), today.getMonth(), 1);
  d.setMonth(d.getMonth() - 1);
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}
