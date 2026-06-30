'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import SignaturePad, { type SignaturePadHandle } from '@/components/intake/SignaturePad';
import DictatedTextarea from '@/components/ui/DictatedTextarea';
import { buildIntakePdfBlob } from '@/lib/intakePdf';
import type { IntakeQuestion } from '@/lib/intake/questions';

const C = {
  bg: '#F6F8FB', card: '#FFFFFF', border: '#E8ECF0',
  accent: '#0D9488', accentSub: '#F0FDF9', accentRim: '#99F6E4',
  text: '#1A2332', sub: '#64748B', muted: '#94A3B8',
};

interface FormDef {
  status: string;
  alreadySubmitted: boolean;
  questions: IntakeQuestion[];
}

export default function IntakeFormPage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();

  // Read mode from the URL once, lazily (avoids a hydration mismatch and a
  // set-state-in-effect). 'internal' = opened by the therapist from inside
  // the system; otherwise the patient is filling via the personal link.
  const [internal] = useState(
    () => typeof window !== 'undefined'
      && new URLSearchParams(window.location.search).get('mode') === 'internal',
  );
  const [def, setDef]           = useState<FormDef | null>(null);
  const [loading, setLoading]   = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [texts, setTexts]   = useState<Record<string, string>>({});
  const sigRef = useRef<SignaturePadHandle | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(`/api/intake/${token}`);
      const json = await res.json().catch(() => null);
      if (!res.ok) { setLoadError(json?.error ?? 'שגיאה בטעינת הטופס'); setLoading(false); return; }
      setDef(json as FormDef);
    } catch {
      setLoadError('שגיאה בטעינת הטופס');
    }
    setLoading(false);
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const setText = useCallback((id: string, v: string) => {
    setTexts(prev => ({ ...prev, [id]: v }));
  }, []);

  const submit = useCallback(async () => {
    if (!def) return;
    setSubmitError(null);

    const fullName = (texts['full_name'] ?? '').trim();
    if (!fullName) {
      setSubmitError('נא למלא שם מלא — הוא נדרש ליצירת המטופלת');
      return;
    }

    const sigDataUrl = sigRef.current?.getDataUrl() ?? null;
    if (!sigDataUrl) {
      setSubmitError('נא לחתום בתחתית הטופס לפני השליחה');
      return;
    }

    setSubmitting(true);
    try {
      const answers = def.questions.map(q => ({
        id: q.id,
        question: q.label,
        text: (texts[q.id] ?? '').trim(),
      }));

      // Build the summary PDF in-browser (reuses the app's shared Hebrew/RTL
      // PDF infrastructure).
      const pdfBlob = await buildIntakePdfBlob({
        patientName: fullName,
        filledByLabel: internal ? 'מולא ע״י המטפלת (מתוך המערכת)' : 'מולא ע״י המטופלת',
        submittedAt: new Date(),
        answers: answers.map(a => ({ question: a.question, text: a.text })),
        signatureDataUrl: sigDataUrl,
      });

      const fd = new FormData();
      fd.append('answers', JSON.stringify(answers));
      fd.append('internal', internal ? '1' : '0');
      fd.append('pdf', pdfBlob, 'intake.pdf');

      const sigBlob = await (await fetch(sigDataUrl)).blob();
      fd.append('signature', sigBlob, 'signature.png');

      const headers: Record<string, string> = {};
      if (internal) {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
      }

      const res = await fetch(`/api/intake/${token}/submit`, { method: 'POST', headers, body: fd });
      const json = await res.json().catch(() => null);
      if (!res.ok) { setSubmitError(json?.error ?? 'שגיאה בשליחת הטופס'); setSubmitting(false); return; }

      // Filled from inside the system → jump straight to the new patient card.
      if (internal && json?.patientId) {
        router.push(`/patients/${json.patientId}`);
        return;
      }
      setDone(true);
    } catch {
      setSubmitError('שגיאה בשליחת הטופס');
    }
    setSubmitting(false);
  }, [def, texts, internal, token, router]);

  /* ── Render states ── */
  if (loading) {
    return <Center><Spinner /><p style={{ fontSize: 13, color: C.muted, marginTop: 12 }}>טוען טופס...</p></Center>;
  }
  if (loadError) {
    return <Center><Card><p style={{ color: C.sub, fontSize: 15 }}>{loadError}</p></Card></Center>;
  }
  if (def?.alreadySubmitted || done) {
    return (
      <Center>
        <Card>
          <div style={{
            width: 56, height: 56, borderRadius: '50%', margin: '0 auto 16px',
            backgroundColor: C.accentSub, border: `1px solid ${C.accentRim}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 26, color: C.accent,
          }}>✓</div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: C.text, margin: '0 0 8px' }}>
            {done ? 'הטופס נשלח בהצלחה' : 'הטופס כבר מולא'}
          </h2>
          <p style={{ fontSize: 14, color: C.sub, margin: 0 }}>
            תודה רבה! אין צורך בפעולה נוספת.
          </p>
        </Card>
      </Center>
    );
  }

  return (
    <div style={{ backgroundColor: C.bg, minHeight: '100vh', padding: '32px 16px', direction: 'rtl' }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        {/* Header */}
        <div style={{
          backgroundColor: C.card, borderRadius: 16, border: `1px solid ${C.border}`,
          padding: '24px 28px', marginBottom: 16, boxShadow: '0 2px 12px rgba(0,0,0,0.05)',
        }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: C.text, margin: '0 0 6px' }}>טופס הצטרפות</h1>
          <p style={{ fontSize: 14, color: C.sub, margin: 0 }}>
            נא למלא את פרטי ההצטרפות. ליד כל שאלה ניתן גם להקליט תשובה קולית.
          </p>
        </div>

        {/* Questions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {def?.questions.map((q, i) => (
            <div key={q.id} style={{
              backgroundColor: C.card, borderRadius: 14, border: `1px solid ${C.border}`,
              padding: '18px 20px',
            }}>
              <label style={{ display: 'block', fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 10 }}>
                <span style={{ color: C.muted, marginInlineEnd: 6 }}>{i + 1}.</span>{q.label}
                {q.id === 'full_name' && <span style={{ color: '#DC2626', marginInlineStart: 4 }}>*</span>}
              </label>
              <DictatedTextarea
                value={texts[q.id] ?? ''}
                onChange={v => setText(q.id, v)}
                rows={q.rows}
                placeholder="הקלידי, או לחצי על המיקרופון כדי להכתיב בקול"
              />
              <p style={{ fontSize: 11, color: C.muted, margin: '6px 0 0' }}>
                ניתן לדבר במקום להקליד — המילים ייכתבו אוטומטית בשדה.
              </p>
            </div>
          ))}
        </div>

        {/* Signature */}
        <div style={{
          backgroundColor: C.card, borderRadius: 14, border: `1px solid ${C.border}`,
          padding: '18px 20px', marginTop: 14,
        }}>
          <label style={{ display: 'block', fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 10 }}>
            חתימה דיגיטלית
          </label>
          <SignaturePad ref={sigRef} />
        </div>

        {submitError && (
          <div style={{
            marginTop: 14, padding: '10px 14px', borderRadius: 10,
            backgroundColor: '#FEF2F2', border: '1px solid #FECACA', color: '#DC2626', fontSize: 13,
          }}>
            {submitError}
          </div>
        )}

        {/* Submit */}
        <button
          onClick={submit}
          disabled={submitting}
          style={{
            width: '100%', marginTop: 18, padding: '14px', borderRadius: 12,
            fontSize: 15, fontWeight: 700, color: '#FFFFFF', border: 'none',
            backgroundColor: C.accent, cursor: submitting ? 'wait' : 'pointer',
            opacity: submitting ? 0.7 : 1, boxShadow: '0 4px 14px rgba(13,148,136,0.28)',
          }}
        >
          {submitting ? 'שולח...' : 'שליחת הטופס'}
        </button>
        <p style={{ textAlign: 'center', fontSize: 11.5, color: C.muted, marginTop: 12 }}>
          המידע נשמר באופן מאובטח ומשויך לכרטיס המטופלת.
        </p>
      </div>
    </div>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      backgroundColor: C.bg, minHeight: '100vh', display: 'flex',
      alignItems: 'center', justifyContent: 'center', direction: 'rtl', padding: 16,
    }}>
      <div style={{ textAlign: 'center' }}>{children}</div>
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      backgroundColor: C.card, borderRadius: 16, border: `1px solid ${C.border}`,
      padding: '36px 40px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)', maxWidth: 420,
    }}>
      {children}
    </div>
  );
}

function Spinner() {
  return (
    <div style={{
      width: 36, height: 36, borderRadius: '50%', margin: '0 auto',
      border: `2.5px solid ${C.accentRim}`, borderTopColor: C.accent,
      animation: 'spin 0.8s linear infinite',
    }} />
  );
}
