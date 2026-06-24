'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useSettings } from '@/lib/settings/SettingsProvider';
import {
  AppSettings,
  DEFAULT_SETTINGS,
  OPTION_CATEGORY_LABELS,
  OptionCategory,
  mergeSettings,
} from '@/lib/settings/defaults';

const TEAL = '#0F766E';

/** Deep clone so local edits never mutate the provider's state. */
function clone(s: AppSettings): AppSettings {
  return JSON.parse(JSON.stringify(s));
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 11px',
  borderRadius: 8,
  border: '1px solid #E2E8F0',
  backgroundColor: '#FFFFFF',
  fontSize: 14,
  color: '#0F172A',
  outline: 'none',
  boxSizing: 'border-box',
  transition: 'border-color 0.12s, box-shadow 0.12s',
};

function focusRing(e: React.FocusEvent<HTMLInputElement>) {
  e.currentTarget.style.borderColor = TEAL;
  e.currentTarget.style.boxShadow = '0 0 0 3px rgba(15,118,110,0.10)';
}
function blurRing(e: React.FocusEvent<HTMLInputElement>) {
  e.currentTarget.style.borderColor = '#E2E8F0';
  e.currentTarget.style.boxShadow = '';
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        backgroundColor: '#FFFFFF',
        borderRadius: 12,
        border: '1px solid #E2E8F0',
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
        padding: '20px 24px',
        marginBottom: 18,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <div style={{ width: 3, height: 16, borderRadius: 2, backgroundColor: TEAL }} />
        <h2 style={{ fontSize: 15, fontWeight: 700, color: '#0F172A', margin: 0 }}>{title}</h2>
      </div>
      {children}
    </div>
  );
}

export default function ListsSettingsPage() {
  const { refresh } = useSettings();

  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  const [draft, setDraft] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  // ── auth: token + admin probe ──────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { setIsAdmin(false); setLoading(false); return; }
      setAccessToken(session.access_token);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session) setAccessToken(session.access_token);
      else { setAccessToken(null); setIsAdmin(false); setLoading(false); }
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  const load = useCallback(async (token: string) => {
    // admin probe — the users endpoint is admin-only
    const probe = await fetch('/api/admin/users', { headers: { Authorization: `Bearer ${token}` } });
    if (probe.status === 401 || probe.status === 403) {
      setIsAdmin(false);
      setLoading(false);
      return;
    }
    setIsAdmin(true);

    const res = await fetch('/api/settings', { cache: 'no-store' });
    const json = await res.json();
    setDraft(mergeSettings(json));
    setLoading(false);
  }, []);

  useEffect(() => {
    if (accessToken) load(accessToken);
  }, [accessToken, load]);

  // ── edit helpers ───────────────────────────────────────────────────────────
  function setOptionLabel(cat: OptionCategory, value: string, label: string) {
    setDraft(prev => {
      const next = clone(prev);
      const item = next.options[cat].find(o => o.value === value);
      if (item) item.label = label;
      return next;
    });
  }

  function setTreatmentType(idx: number, val: string) {
    setDraft(prev => {
      const next = clone(prev);
      next.lists.treatmentTypes[idx] = val;
      return next;
    });
  }
  function addTreatmentType() {
    setDraft(prev => {
      const next = clone(prev);
      next.lists.treatmentTypes.push('');
      return next;
    });
  }
  function removeTreatmentType(idx: number) {
    setDraft(prev => {
      const next = clone(prev);
      next.lists.treatmentTypes.splice(idx, 1);
      return next;
    });
  }

  function setText(key: keyof AppSettings['texts'], val: string) {
    setDraft(prev => {
      const next = clone(prev);
      next.texts[key] = val;
      return next;
    });
  }

  function resetCategoryToDefault(cat: OptionCategory) {
    setDraft(prev => {
      const next = clone(prev);
      next.options[cat] = JSON.parse(JSON.stringify(DEFAULT_SETTINGS.options[cat]));
      return next;
    });
  }

  // ── save ───────────────────────────────────────────────────────────────────
  async function handleSave() {
    if (!accessToken) return;
    setSaving(true);
    setSaveMsg(null);
    setErrMsg(null);

    // drop empty treatment types before saving
    const payload = clone(draft);
    payload.lists.treatmentTypes = payload.lists.treatmentTypes
      .map(t => t.trim())
      .filter(Boolean);

    const res = await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify(payload),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setErrMsg(json.error ?? 'שגיאה בשמירה');
    } else {
      setDraft(mergeSettings(json));
      await refresh(); // propagate to the rest of the app
      setSaveMsg('ההגדרות נשמרו בהצלחה');
      setTimeout(() => setSaveMsg(null), 4000);
    }
    setSaving(false);
  }

  // ── render states ──────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 300 }}>
        <div className="w-8 h-8 rounded-full border-2 animate-spin" style={{ borderColor: TEAL, borderTopColor: 'transparent' }} />
      </div>
    );
  }

  if (isAdmin === false) {
    return (
      <div style={{ maxWidth: 480, margin: '80px auto', textAlign: 'center', direction: 'rtl', padding: '0 24px' }}>
        <div style={{ width: 56, height: 56, borderRadius: '50%', backgroundColor: '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', fontSize: 24 }}>
          🔒
        </div>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: '#0F172A', marginBottom: 8 }}>אין הרשאה</h2>
        <p style={{ color: '#64748B', fontSize: 14 }}>
          {accessToken ? 'אין לך הרשאת מנהל לערוך הגדרות אלו.' : 'יש להתחבר כדי לגשת לדף זה.'}
        </p>
        {!accessToken && (
          <a href="/login" style={{ display: 'inline-block', marginTop: 20, padding: '10px 24px', borderRadius: 8, backgroundColor: TEAL, color: '#fff', fontWeight: 600, fontSize: 14, textDecoration: 'none' }}>
            כניסה למערכת
          </a>
        )}
      </div>
    );
  }

  const optionCats = Object.keys(draft.options) as OptionCategory[];

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '32px 24px', direction: 'rtl', fontFamily: "'Heebo', Arial, sans-serif" }}>
      {/* header */}
      <div style={{ marginBottom: 22 }}>
        <Link href="/settings" style={{ fontSize: 13, color: TEAL, textDecoration: 'none' }}>← חזרה להגדרות</Link>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#0F172A', margin: '8px 0 4px' }}>רשימות ותוויות</h1>
        <p style={{ color: '#64748B', fontSize: 14, margin: 0 }}>
          עריכת הטקסט שמופיע בתפריטים ובתצוגות ברחבי המערכת. שינויים נשמרים ונכנסים לתוקף מיידית.
        </p>
      </div>

      {/* messages */}
      {errMsg && (
        <div style={{ backgroundColor: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: 8, padding: '10px 14px', color: '#DC2626', fontSize: 13, marginBottom: 16 }}>{errMsg}</div>
      )}
      {saveMsg && (
        <div style={{ backgroundColor: '#F0FDFA', border: '1px solid #99F6E4', borderRadius: 8, padding: '10px 14px', color: TEAL, fontSize: 13, marginBottom: 16 }}>{saveMsg}</div>
      )}

      {/* texts */}
      <Card title="טקסטים">
        <div style={{ maxWidth: 420 }}>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
            כותרת עמוד התשלומים
          </label>
          <input
            value={draft.texts.paymentsTitle}
            onChange={e => setText('paymentsTitle', e.target.value)}
            style={inputStyle}
            onFocus={focusRing}
            onBlur={blurRing}
          />
        </div>
      </Card>

      {/* free list: treatment types */}
      <Card title="סוגי טיפול">
        <p style={{ fontSize: 12, color: '#94A3B8', margin: '0 0 14px' }}>
          רשימה חופשית — אפשר להוסיף, לשנות ולמחוק פריטים.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {draft.lists.treatmentTypes.map((t, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                value={t}
                onChange={e => setTreatmentType(i, e.target.value)}
                placeholder="שם סוג טיפול"
                style={{ ...inputStyle, maxWidth: 360 }}
                onFocus={focusRing}
                onBlur={blurRing}
              />
              <button
                onClick={() => removeTreatmentType(i)}
                style={{ padding: '6px 12px', borderRadius: 7, border: '1px solid #FCA5A5', backgroundColor: '#FEF2F2', color: '#DC2626', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
              >
                מחק
              </button>
            </div>
          ))}
        </div>
        <button
          onClick={addTreatmentType}
          style={{ marginTop: 12, padding: '7px 16px', borderRadius: 8, border: `1px dashed ${TEAL}`, backgroundColor: '#F0FDFA', color: TEAL, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
        >
          + הוסף סוג טיפול
        </button>
      </Card>

      {/* enum option labels */}
      <Card title="תוויות אפשרויות">
        <p style={{ fontSize: 12, color: '#94A3B8', margin: '0 0 16px' }}>
          ניתן לשנות את הטקסט המוצג לכל אפשרות. ערכי המערכת (משמאל) קבועים ואינם ניתנים לשינוי.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 20 }}>
          {optionCats.map(cat => (
            <div key={cat} style={{ border: '1px solid #F1F5F9', borderRadius: 10, padding: '14px 16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <h3 style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', margin: 0 }}>
                  {OPTION_CATEGORY_LABELS[cat]}
                </h3>
                <button
                  onClick={() => resetCategoryToDefault(cat)}
                  style={{ fontSize: 11, color: '#94A3B8', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
                  title="החזר לברירת מחדל"
                >
                  איפוס
                </button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                {draft.options[cat].map(o => (
                  <div key={o.value} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <code style={{ fontSize: 11, color: '#94A3B8', backgroundColor: '#F8FAFC', border: '1px solid #F1F5F9', borderRadius: 6, padding: '4px 7px', minWidth: 96, textAlign: 'center', direction: 'ltr', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {o.value}
                    </code>
                    <input
                      value={o.label}
                      onChange={e => setOptionLabel(cat, o.value, e.target.value)}
                      style={inputStyle}
                      onFocus={focusRing}
                      onBlur={blurRing}
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* sticky save bar */}
      <div style={{ position: 'sticky', bottom: 0, backgroundColor: 'rgba(248,250,252,0.92)', backdropFilter: 'blur(4px)', borderTop: '1px solid #E2E8F0', padding: '14px 0', display: 'flex', gap: 12, alignItems: 'center' }}>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{ padding: '10px 26px', borderRadius: 9, border: 'none', backgroundColor: saving ? '#99F6E4' : TEAL, color: '#fff', fontSize: 14, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', boxShadow: '0 1px 3px rgba(15,118,110,0.30)' }}
        >
          {saving ? 'שומר...' : 'שמור שינויים'}
        </button>
        <span style={{ fontSize: 12, color: '#94A3B8' }}>השינויים נכנסים לתוקף בכל המערכת מיד לאחר השמירה.</span>
      </div>
    </div>
  );
}
