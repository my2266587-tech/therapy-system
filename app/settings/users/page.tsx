'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

interface AuthUser {
  id: string;
  email: string;
  role: 'admin' | 'staff';
  is_active: boolean;
  created_at: string;
}

const thStyle: React.CSSProperties = {
  padding: '10px 16px',
  textAlign: 'right',
  fontWeight: 600,
  fontSize: 11,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  color: '#64748B',
  backgroundColor: '#F8FAFC',
  borderBottom: '1px solid #E2E8F0',
  whiteSpace: 'nowrap',
};

const tdStyle: React.CSSProperties = {
  padding: '12px 16px',
  fontSize: 14,
  color: '#0F172A',
  borderBottom: '1px solid #F1F5F9',
  verticalAlign: 'middle',
};

function ActiveBadge({ active }: { active: boolean }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '2px 10px',
        borderRadius: 20,
        fontSize: 12,
        fontWeight: 600,
        backgroundColor: active ? '#F0FDFA' : '#F1F5F9',
        color: active ? '#0F766E' : '#94A3B8',
        border: `1px solid ${active ? '#99F6E4' : '#E2E8F0'}`,
      }}
    >
      {active ? 'פעיל' : 'לא פעיל'}
    </span>
  );
}

function RoleBadge({ role }: { role: string }) {
  const isAdmin = role === 'admin';
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '2px 10px',
        borderRadius: 20,
        fontSize: 12,
        fontWeight: 600,
        backgroundColor: isAdmin ? '#FFFBEB' : '#EFF6FF',
        color: isAdmin ? '#92400E' : '#1E40AF',
        border: `1px solid ${isAdmin ? '#FDE68A' : '#BFDBFE'}`,
      }}
    >
      {isAdmin ? 'מנהל' : 'צוות'}
    </span>
  );
}

export default function UsersSettingsPage() {
  const [loading, setLoading]           = useState(true);
  const [accessToken, setAccessToken]   = useState<string | null>(null);
  const [currentEmail, setCurrentEmail] = useState<string | null>(null);
  const [isAdmin, setIsAdmin]           = useState<boolean | null>(null);
  const [users, setUsers]               = useState<AuthUser[]>([]);
  const [fetchError, setFetchError]     = useState<string | null>(null);

  const [newEmail, setNewEmail]         = useState('');
  const [newRole, setNewRole]           = useState<'admin' | 'staff'>('staff');
  const [adding, setAdding]             = useState(false);
  const [addError, setAddError]         = useState<string | null>(null);
  const [addSuccess, setAddSuccess]     = useState<string | null>(null);

  const [actionId, setActionId]         = useState<string | null>(null);
  const [actionError, setActionError]   = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { setIsAdmin(false); setLoading(false); return; }
      setAccessToken(session.access_token);
      setCurrentEmail(session.user.email ?? null);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        setAccessToken(session.access_token);
        setCurrentEmail(session.user.email ?? null);
      } else {
        setAccessToken(null);
        setCurrentEmail(null);
        setIsAdmin(false);
        setLoading(false);
      }
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  const fetchUsers = useCallback(async (token: string) => {
    setFetchError(null);
    const res = await fetch('/api/admin/users', {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (res.status === 401 || res.status === 403) {
      setIsAdmin(false);
      setLoading(false);
      return;
    }

    const json = await res.json();
    if (!res.ok) {
      setFetchError(json.error ?? 'שגיאה בטעינה');
      setIsAdmin(true);
      setLoading(false);
      return;
    }

    setUsers(json);
    setIsAdmin(true);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (accessToken) fetchUsers(accessToken);
  }, [accessToken, fetchUsers]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!accessToken) return;
    setAdding(true);
    setAddError(null);
    setAddSuccess(null);

    const res = await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ email: newEmail.trim().toLowerCase(), role: newRole }),
    });
    const json = await res.json();
    if (!res.ok) {
      setAddError(json.error ?? 'שגיאה בהוספה');
    } else {
      setUsers(prev => [json, ...prev]);
      setNewEmail('');
      setNewRole('staff');
      setAddSuccess(`${json.email} נוסף בהצלחה`);
      setTimeout(() => setAddSuccess(null), 4000);
    }
    setAdding(false);
  }

  async function handleToggleActive(user: AuthUser) {
    if (!accessToken) return;
    setActionId(user.id);
    setActionError(null);

    const res = await fetch(`/api/admin/users/${user.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ is_active: !user.is_active }),
    });
    const json = await res.json();
    if (!res.ok) setActionError(json.error ?? 'שגיאה');
    else setUsers(prev => prev.map(u => u.id === user.id ? json : u));
    setActionId(null);
  }

  async function handleRoleChange(user: AuthUser, role: string) {
    if (!accessToken) return;
    setActionId(user.id);
    setActionError(null);

    const res = await fetch(`/api/admin/users/${user.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ role }),
    });
    const json = await res.json();
    if (!res.ok) setActionError(json.error ?? 'שגיאה');
    else setUsers(prev => prev.map(u => u.id === user.id ? json : u));
    setActionId(null);
  }

  async function handleDelete(user: AuthUser) {
    if (!accessToken) return;
    if (!window.confirm(`למחוק את ${user.email}? פעולה זו בלתי הפיכה.`)) return;

    setActionId(user.id);
    setActionError(null);

    const res = await fetch(`/api/admin/users/${user.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const json = await res.json();
    if (!res.ok) { setActionError(json.error ?? 'שגיאה במחיקה'); setActionId(null); }
    else { setUsers(prev => prev.filter(u => u.id !== user.id)); setActionId(null); }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 300 }}>
        <div className="w-8 h-8 rounded-full border-2 animate-spin" style={{ borderColor: '#0F766E', borderTopColor: 'transparent' }} />
      </div>
    );
  }

  if (isAdmin === false) {
    return (
      <div style={{ maxWidth: 480, margin: '80px auto', textAlign: 'center', direction: 'rtl', padding: '0 24px' }}>
        <div
          style={{
            width: 56, height: 56, borderRadius: '50%',
            backgroundColor: '#F1F5F9', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 16px', fontSize: 24,
          }}
        >
          🔒
        </div>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: '#0F172A', marginBottom: 8 }}>
          אין הרשאה
        </h2>
        <p style={{ color: '#64748B', fontSize: 14 }}>
          {accessToken ? 'אין לך הרשאת מנהל לצפות בדף זה.' : 'יש להתחבר כדי לגשת לדף זה.'}
        </p>
        {!accessToken && (
          <a
            href="/login"
            style={{
              display: 'inline-block',
              marginTop: 20,
              padding: '10px 24px',
              borderRadius: 8,
              backgroundColor: '#0F766E',
              color: '#fff',
              fontWeight: 600,
              fontSize: 14,
              textDecoration: 'none',
            }}
          >
            כניסה למערכת
          </a>
        )}
      </div>
    );
  }

  return (
    <div
      style={{
        maxWidth: 960,
        margin: '0 auto',
        padding: '32px 24px',
        direction: 'rtl',
        fontFamily: "'Heebo', Arial, sans-serif",
      }}
    >
      {/* Page header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#0F172A', margin: '0 0 4px' }}>
          משתמשים והרשאות
        </h1>
        <p style={{ color: '#64748B', fontSize: 14, margin: 0 }}>
          ניהול גישה למערכת · מחובר כ: {currentEmail}
        </p>
      </div>

      {/* Errors */}
      {actionError && (
        <div style={{ backgroundColor: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: 8, padding: '10px 14px', color: '#DC2626', fontSize: 13, marginBottom: 16 }}>
          {actionError}
        </div>
      )}
      {fetchError && (
        <div style={{ backgroundColor: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: 8, padding: '10px 14px', color: '#DC2626', fontSize: 13, marginBottom: 16 }}>
          {fetchError}
        </div>
      )}

      {/* ── Add user form ── */}
      <div
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: 12,
          border: '1px solid #E2E8F0',
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
          padding: '24px 28px',
          marginBottom: 20,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18 }}>
          <div style={{ width: 3, height: 16, borderRadius: 2, backgroundColor: '#0F766E' }} />
          <h2 style={{ fontSize: 15, fontWeight: 700, color: '#0F172A', margin: 0 }}>הוספת משתמש חדש</h2>
        </div>

        {addSuccess && (
          <div style={{ backgroundColor: '#F0FDFA', border: '1px solid #99F6E4', borderRadius: 8, padding: '10px 14px', color: '#0F766E', fontSize: 13, marginBottom: 16 }}>
            {addSuccess}
          </div>
        )}
        {addError && (
          <div style={{ backgroundColor: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: 8, padding: '10px 14px', color: '#DC2626', fontSize: 13, marginBottom: 16 }}>
            {addError}
          </div>
        )}

        <form onSubmit={handleAdd} style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
              כתובת מייל
            </label>
            <input
              type="email"
              value={newEmail}
              onChange={e => setNewEmail(e.target.value)}
              placeholder="user@example.com"
              required
              style={{
                width: '100%',
                padding: '9px 12px',
                borderRadius: 8,
                border: '1px solid #E2E8F0',
                backgroundColor: '#FFFFFF',
                fontSize: 14,
                color: '#0F172A',
                outline: 'none',
                boxSizing: 'border-box',
                direction: 'ltr',
                textAlign: 'right',
                transition: 'border-color 0.12s, box-shadow 0.12s',
              }}
              onFocus={e => {
                e.currentTarget.style.borderColor = '#0F766E';
                e.currentTarget.style.boxShadow = '0 0 0 3px rgba(15,118,110,0.10)';
              }}
              onBlur={e => {
                e.currentTarget.style.borderColor = '#E2E8F0';
                e.currentTarget.style.boxShadow = '';
              }}
            />
          </div>

          <div style={{ minWidth: 140 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
              תפקיד
            </label>
            <select
              value={newRole}
              onChange={e => setNewRole(e.target.value as 'admin' | 'staff')}
              style={{
                width: '100%',
                padding: '9px 12px',
                borderRadius: 8,
                border: '1px solid #E2E8F0',
                backgroundColor: '#FFFFFF',
                fontSize: 14,
                color: '#0F172A',
                outline: 'none',
                cursor: 'pointer',
              }}
              onFocus={e => {
                e.currentTarget.style.borderColor = '#0F766E';
                e.currentTarget.style.boxShadow = '0 0 0 3px rgba(15,118,110,0.10)';
              }}
              onBlur={e => {
                e.currentTarget.style.borderColor = '#E2E8F0';
                e.currentTarget.style.boxShadow = '';
              }}
            >
              <option value="staff">צוות</option>
              <option value="admin">מנהל</option>
            </select>
          </div>

          <button
            type="submit"
            disabled={adding}
            style={{
              padding: '9px 22px',
              borderRadius: 9,
              border: 'none',
              backgroundColor: adding ? '#99F6E4' : '#0F766E',
              color: '#fff',
              fontSize: 14,
              fontWeight: 600,
              cursor: adding ? 'not-allowed' : 'pointer',
              whiteSpace: 'nowrap',
              boxShadow: '0 1px 3px rgba(15,118,110,0.30)',
              transition: 'background-color 0.12s',
            }}
            onMouseEnter={e => { if (!adding) e.currentTarget.style.backgroundColor = '#0D6E67'; }}
            onMouseLeave={e => { if (!adding) e.currentTarget.style.backgroundColor = '#0F766E'; }}
          >
            {adding ? 'מוסיף...' : '+ הוסף משתמש'}
          </button>
        </form>
      </div>

      {/* ── Users table ── */}
      <div
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: 12,
          border: '1px solid #E2E8F0',
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid #E2E8F0',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 3, height: 16, borderRadius: 2, backgroundColor: '#0F766E' }} />
            <h2 style={{ fontSize: 15, fontWeight: 700, color: '#0F172A', margin: 0 }}>משתמשים מורשים</h2>
          </div>
          <span
            style={{
              fontSize: 12,
              color: '#64748B',
              backgroundColor: '#F1F5F9',
              padding: '3px 10px',
              borderRadius: 20,
              border: '1px solid #E2E8F0',
            }}
          >
            {users.length} משתמשים
          </span>
        </div>

        {users.length === 0 ? (
          <div style={{ padding: '48px 24px', textAlign: 'center', color: '#94A3B8' }}>
            <div style={{ fontSize: 28, marginBottom: 10 }}>○</div>
            <p style={{ margin: 0, fontSize: 14 }}>אין משתמשים מורשים עדיין</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={thStyle}>מייל</th>
                  <th style={thStyle}>תפקיד</th>
                  <th style={thStyle}>סטטוס</th>
                  <th style={thStyle}>תאריך הוספה</th>
                  <th style={{ ...thStyle, textAlign: 'center' }}>פעולות</th>
                </tr>
              </thead>
              <tbody>
                {users.map(user => {
                  const isSelf = user.email === currentEmail;
                  const isBusy = actionId === user.id;

                  return (
                    <tr
                      key={user.id}
                      style={{ backgroundColor: isSelf ? '#F0FDFA' : '#FFFFFF' }}
                      onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#F8FAFC'; }}
                      onMouseLeave={e => { e.currentTarget.style.backgroundColor = isSelf ? '#F0FDFA' : '#FFFFFF'; }}
                    >
                      <td style={{ ...tdStyle, direction: 'ltr', textAlign: 'right', fontWeight: isSelf ? 600 : 400 }}>
                        {user.email}
                        {isSelf && (
                          <span
                            style={{
                              marginRight: 6,
                              fontSize: 11,
                              color: '#0F766E',
                              backgroundColor: '#F0FDFA',
                              border: '1px solid #99F6E4',
                              borderRadius: 10,
                              padding: '1px 6px',
                            }}
                          >
                            אתה
                          </span>
                        )}
                      </td>

                      <td style={tdStyle}>
                        {isSelf ? (
                          <RoleBadge role={user.role} />
                        ) : (
                          <select
                            value={user.role}
                            disabled={isBusy}
                            onChange={e => handleRoleChange(user, e.target.value)}
                            style={{
                              padding: '4px 8px',
                              borderRadius: 6,
                              border: '1px solid #E2E8F0',
                              backgroundColor: '#F8FAFC',
                              fontSize: 13,
                              color: '#0F172A',
                              cursor: isBusy ? 'not-allowed' : 'pointer',
                            }}
                          >
                            <option value="staff">צוות</option>
                            <option value="admin">מנהל</option>
                          </select>
                        )}
                      </td>

                      <td style={tdStyle}>
                        <ActiveBadge active={user.is_active} />
                      </td>

                      <td style={{ ...tdStyle, color: '#64748B', fontSize: 13 }}>
                        {new Date(user.created_at).toLocaleDateString('he-IL', {
                          year: 'numeric', month: 'short', day: 'numeric',
                        })}
                      </td>

                      <td style={{ ...tdStyle, textAlign: 'center' }}>
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                          <button
                            onClick={() => handleToggleActive(user)}
                            disabled={isBusy || isSelf}
                            style={{
                              padding: '4px 12px',
                              borderRadius: 6,
                              border: `1px solid ${user.is_active ? '#E2E8F0' : '#99F6E4'}`,
                              backgroundColor: user.is_active ? '#F8FAFC' : '#F0FDFA',
                              color: user.is_active ? '#64748B' : '#0F766E',
                              fontSize: 12,
                              fontWeight: 600,
                              cursor: (isBusy || isSelf) ? 'not-allowed' : 'pointer',
                              opacity: isSelf ? 0.4 : 1,
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {isBusy ? '...' : user.is_active ? 'השבת' : 'הפעל'}
                          </button>

                          {!isSelf && (
                            <button
                              onClick={() => handleDelete(user)}
                              disabled={isBusy}
                              style={{
                                padding: '4px 10px',
                                borderRadius: 6,
                                border: '1px solid #FCA5A5',
                                backgroundColor: '#FEF2F2',
                                color: '#DC2626',
                                fontSize: 12,
                                fontWeight: 600,
                                cursor: isBusy ? 'not-allowed' : 'pointer',
                              }}
                            >
                              מחק
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div
          style={{
            padding: '10px 20px',
            borderTop: '1px solid #F1F5F9',
            backgroundColor: '#F8FAFC',
            fontSize: 12,
            color: '#94A3B8',
          }}
        >
          רק מנהלים יכולים לגשת לדף זה. שינויים נכנסים לתוקף מיידית.
        </div>
      </div>
    </div>
  );
}
