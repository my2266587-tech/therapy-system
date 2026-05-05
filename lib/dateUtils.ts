const HEBREW_LETTERS: [number, string][] = [
  [400, 'ת'], [300, 'ש'], [200, 'ר'], [100, 'ק'],
  [90, 'צ'], [80, 'פ'], [70, 'ע'], [60, 'ס'], [50, 'נ'],
  [40, 'מ'], [30, 'ל'], [20, 'כ'], [10, 'י'],
  [9, 'ט'], [8, 'ח'], [7, 'ז'], [6, 'ו'], [5, 'ה'],
  [4, 'ד'], [3, 'ג'], [2, 'ב'], [1, 'א'],
];

function toHebrewLetters(n: number): string {
  const letters: string[] = [];
  let rem = n;
  for (const [val, letter] of HEBREW_LETTERS) {
    while (rem >= val) {
      // Avoid writing divine names: 15=ט"ו, 16=ט"ז instead of י"ה, י"ו
      if (rem === 15) { letters.push('ט', 'ו'); rem = 0; break; }
      if (rem === 16) { letters.push('ט', 'ז'); rem = 0; break; }
      letters.push(letter);
      rem -= val;
    }
  }
  if (letters.length === 0) return '';
  if (letters.length === 1) return letters[0] + "'";
  return letters.slice(0, -1).join('') + '"' + letters[letters.length - 1];
}

// Day of Hebrew month (1–30) to Hebrew letters
function toHebrewDay(n: number): string {
  return toHebrewLetters(n);
}

// Hebrew year number to letters, without the thousands digit (convention: 5786 → תשפ"ו)
function toHebrewYear(n: number): string {
  return toHebrewLetters(n % 1000);
}

// YYYY-MM-DD → DD/MM/YYYY
export function fmtDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '-';
  const [y, m, d] = dateStr.split('-').map(Number);
  return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
}

// YYYY-MM-DD → ט"ז באייר תשפ"ו
export function fmtHebrewDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  try {
    const [y, m, d] = dateStr.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    const parts = new Intl.DateTimeFormat('he-IL-u-ca-hebrew', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).formatToParts(date);
    const dayNum  = parseInt(parts.find(p => p.type === 'day')?.value  ?? '0', 10);
    const yearNum = parseInt(parts.find(p => p.type === 'year')?.value ?? '0', 10);
    const monthRaw = parts.find(p => p.type === 'month')?.value ?? '';
    const monthName = monthRaw.startsWith('ב') ? monthRaw.slice(1) : monthRaw;
    if (!dayNum || !monthName || !yearNum) return '';
    return `${toHebrewDay(dayNum)} ב${monthName} ${toHebrewYear(yearNum)}`;
  } catch {
    return '';
  }
}
