---
name: sde-hemed-rules
description: Project specifics for the שדה חמד / מחר אחר therapy system (this repo) - which existing helpers implement the build standards, file locations, SQL run order, deploy checks and known pitfalls. Use together with build-standards whenever changing anything in this repo - pages, tables, API routes, crons, settings, commits or deploys.
---

# שדה חמד — פרטי המערכת

משלים את `build-standards` (הכללים). כאן: **מה כבר קיים ומה להשתמש בו**, כדי לא לבנות שוב.

## הקשר

- מערכת ניהול טיפולית למרפאה. מידע קליני רגיש.
- **הממשק פונה בלשון נקבה** ("נסי שוב", "בחרי חודש").
- תפקידים: `admin` (מנהלת) ו-`staff` (צוות) בטבלת `authorized_users`.
- Next.js 16 (App Router; `proxy.ts` במקום middleware), Supabase, Vercel. קבצים ב-CRLF.

## להשתמש בקיים — לא לכתוב מחדש

| צורך | מה להשתמש |
|---|---|
| בדיקת הרשאה ב-API | `getAuthorizedUser(req)` / `getAdminUser(req)` מ-`lib/getAdminUser.ts` |
| מי מחובר ובאיזה תפקיד (לקוח) | `GET /api/me` (נקרא כבר ב-`SidebarLayout`) |
| פריט תפריט למנהלת בלבד | `adminOnly: true` ב-`navItems` ב-`components/layout/SidebarLayout.tsx` |
| טעינת "כל השורות" | `fetchAll((from, to) => supabase.from(...)...order('id').range(from, to))` מ-`lib/fetchAll.ts` |
| אישור מחיקה / הודעה | `const { confirm, toast } = useFeedback()` מ-`components/ui/Feedback.tsx` |
| צבעים | `import { colors as C } from '@/lib/theme'` |
| מסך מצב (שגיאה/ריק) | `components/ui/StatusMessage.tsx` |
| cron חדש | `export const POST = withFailureAlert('שם בעברית', handle)` מ-`lib/cronAlert.ts` + הוספה ל-`vercel.json` |
| רשימות/טקסטים שהמנהלת עורכת | מערכת ההגדרות: טבלת `app_settings` + `useSettings()`; ברירות מחדל ב-`lib/settings/defaults.ts` |
| Supabase בשרת | `createServerClient()` מ-`lib/supabaseServer.ts` (service role) |

## מסד נתונים

- קבצי SQL ב-`supabase/`, **סדר ההרצה ב-`supabase/README.md`**. `rls-policies.sql` תמיד אחרון.
- **טבלה חדשה:** קובץ SQL אידמפוטנטי → להוסיף את שם הטבלה לרשימה ב-`rls-policies.sql` **וגם** לבלוק הזהה בסוף `schema.sql` (שניהם חייבים להיות זהים) → להוסיף את הקובץ ל-README ול-`FILES` ב-`scripts/check-sql.mjs` → `npm run check:sql`.
- טבלאות מנהלת בלבד: `private_expenses`, `petty_cash`.
- שירות בלבד (RLS בלי policy): `authorized_users`, `intake_forms`.
- **SQL לא רץ אוטומטית** — המשתמשת מריצה ב-Supabase SQL Editor. אחרי שהיא מריצה אפשר לוודא מבחוץ שפונקציה קיימת: `POST https://kayneniznnukeqynmeyt.supabase.co/rest/v1/rpc/<name>` עם המפתח הציבורי (publishable) מהבאנדל של האתר → `permission denied` = קיימת, `could not find` = לא רצה.

## בדיקות

- `npx tsc --noEmit` · `npx eslint .` (0 שגיאות; `set-state-in-effect` מוגדר כאזהרה בכוונה — ראה `eslint.config.mjs`) · `npm run check:sql` · `npm run build`.
- **ה-build המקומי קורא `NEXT_PUBLIC_*` בזמן הבנייה**, ו-`.env.local` מכיל ערכים ריקים → ה-proxy מדלג. לבדיקת הפניות/הרשאות: לבנות ולהריץ עם env מדומה:
  `NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=test SUPABASE_SERVICE_ROLE_KEY=test npx next build && npx next start -p 3123` — ואז `rm -rf .next`.
- אין כניסה אמיתית עם Google מכאן; בדיקה ויזואלית של מסכים מחוברים — לבקש מהמשתמשת.

## העלאה

- `main` עולה אוטומטית ל-`crm-sde-hemed` ב-Vercel (https://crm-sde-hemed.vercel.app). ריפו: `my2266587-tech/therapy-system`.
- מצב פריסה: `gh api repos/my2266587-tech/therapy-system/commits/<sha>/statuses --jq '.[0].state'`. CI: `gh run list --commit <sha>`.
- ה-CLI של Vercel במחשב מחובר לחשבון אחר — אין גישה ללוגים של הפריסה. לוג נחוץ → לבקש מהמשתמשת לפתוח את הקישור מה-status.
- ערכי משתני הסביבה ב-Vercel מוגדרים כ-Sensitive ולא ניתנים לקריאה; שמות קיימים ב-`.env.production`.

## ממתין

- **סעיף 10 מהסקירה:** כתובות מייל קבועות בקוד (`FIXED_RECIPIENT`, `DEFAULT_FROM` ב-`app/api/reports/monthly-excel/route.ts`) → להעביר למערכת ההגדרות, אחרי שעבודת "שדות מותאמים אישית" של המשתמשת תיכנס (היא נוגעת ב-`lib/settings/defaults.ts` וב-`app/settings/lists/page.tsx`). אז גם להוסיף את `supabase/patient-custom-fields.sql` ל-README ול-`check-sql.mjs`.
- עוד מהסקירה, לא בוצע: פרטיות ב-OpenAI (סיכום רבעוני, תמלול, עוזר), יומן פעולות, תפוגה לקישורי טופס קליטה, פיצול `app/patients/[id]/page.tsx` (~1100 שורות), התאמה לנייד, חיפוש גלובלי, ייצוא גיבוי.
