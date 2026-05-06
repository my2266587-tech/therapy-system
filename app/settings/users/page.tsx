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

const ROLE_LABELS: Record<string, string> = {
  admin: 'מנהל',
  staff: 'צוות',
};

/* ── shared inline styles ── */
const card: React.CSSProperties = {
  backgroundColor: '#ffffff',
  borderRadius: 12,
  boxShadow: '0 1px 8px rgba(26,38,32,0.07)',
  border: '1px solid #ede8e1',
};

const thStyle: React.CSSProperties = {
  padding: '10px 14px',
  textAlign: 'right',
  fontWeight: 600,
  fontSize: '0.6875rem',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  color: '#6b7b6e',
  borderBottom: '1px solid #ede8e1',
  whiteSpace: 'nowrap',
};

const tdStyle: React.CSSProperties = {
  padding: '12px 14px',
  fontSize: 14,
  color: '#1a2620',
  borderBottom: '1px solid #f0ece5',
  verticalAlign: 'middle',
};

function Badge({ active }: { active: boolean }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '2px 10px',
        borderRadius: 20,
        fontSize: 12,
        fontWeight: 600,
        backgroundColor: active ? '#eef6f1' : '#f5f5f5',
        color: active ? '#1f623e' : '#9aaa9d',
        border: `1px solid ${active ? '#a9d5ba' : '#e0ddd8'}`,
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
        backgroundColor: isAdmin ? '#fdf8ee' : '#eff5ff',
        color: isAdmin ? '#92680a' : '#1e4db7',
        border: `1px solid ${isAdmin ? '#e6cc87' : '#b5cef7'}`,
      }}
    >
      {ROLE_LABELS[role] ?? role}
    </span>
  );
}

export default function UsersSettingsPage() {
  const [loading, setLoading]       = useState(true);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [currentEmail, setCurrentEmail] = useState<string | null>(null);
  const [isAdmin, setIsAdmin]       = useState<boolean | null>(null); // null = checking
  const [users, setUsers]           = useState<AuthUser[]>([]);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Add-user form
  const [newEmail, setNewEmail]     = useState('');
  const [newRole, setNewRole]       = useState<'admin' | 'staff'>('staff');
  const [adding, setAdding]         = useState(false);
  const [addError, setAddError]     = useState<string | null>(null);
  const [addSuccess, setAddSuccess] = useState<string | null>(null);

  // Per-row action state
  const [actionId, setActionId]     = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  /* ── 1. Get current session ── */
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        setIsAdmin(false);
        setLoading(false);
        return;
      }
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

  /* ── 2. Fetch users (also verifies admin) ── */
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

  /* ── 3. Add user ── */
  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!accessToken) return;
    setAdding(true);
    setAddError(null);
    setAddSuccess(null);

    const res = await fetch('/api/admin/users', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
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

  /* ── 4. Toggle active ── */
  async function handleToggleActive(user: AuthUser) {
    if (!accessToken) return;
    setActionId(user.id);
    setActionError(null);

    const res = await fetch(`/api/admin/users/${user.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ is_active: !user.is_active }),
    });
    const json = await res.json();
    if (!res.ok) {
      setActionError(json.error ?? 'שגיאה');
    } else {
      setUsers(prev => prev.map(u => u.id === user.id ? json : u));
    }
    setActionId(null);
  }

  /* ── 5. Change role ── */
  async function handleRoleChange(user: AuthUser, role: string) {
    if (!accessToken) return;
    setActionId(user.id);
    setActionError(null);

    const res = await fetch(`/api/admin/users/${user.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ role }),
    });
    const json = await res.json();
    if (!res.ok) {
      setActionError(json.error ?? 'שגיאה');
    } else {
      setUsers(prev => prev.map(u => u.id === user.id ? json : u));
    }
    setActionId(null);
  }

  /* ── 6. Delete user ── */
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
    if (!res.ok) {
      setActionError(json.error ?? 'שגיאה במחיקה');
      setActionId(null);
    } else {
      setUsers(prev => prev.filter(u => u.id !== user.id));
      setActionId(null);
    }
  }

  /* ── render helpers ── */
  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 300 }}>
        <div style={{ color: '#6b7b6e', fontSize: 15 }}>טוען...</div>
      </div>
    );
  }

  if (isAdmin === false) {
    return (
      <div style={{ maxWidth: 480, margin: '80px auto', textAlign: 'center', direction: 'rtl' }}>
        <div style={{ fontSize: 40, marginBottom: 16 }}>🔒</div>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: '#1a2620', marginBottom: 8 }}>
          אין הרשאה
        </h2>
        <p style={{ color: '#6b7b6e', fontSize: 14 }}>
          {accessToken
            ? 'אין לך הרשאת מנהל לצפות בדף זה.'
            : 'יש להתחבר כדי לגשת לדף זה.'}
        </p>
        {!accessToken && (
          <a
            href="/login"
            style={{
              display: 'inline-block',
              marginTop: 20,
              padding: '10px 24px',
              borderRadius: 8,
              backgroundColor: '#1f623e',
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
        maxWidth: 900,
        margin: '0 auto',
        padding: '32px 20px',
        direction: 'rtl',
        fontFamily: "'Heebo', Arial, sans-serif",
      }}
    >
      {/* Page header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <div
            style={{
              width: 4,
              height: 20,
              borderRadius: 2,
              backgroundColor: '#c49438',
            }}
          />
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1a2620', margin: 0 }}>
            משתמשים והרשאות
          </h1>
        </div>
        <p style={{ color: '#6b7b6e', fontSize: 14, margin: 0, paddingRight: 14 }}>
          ניהול גישה למערכת | מחובר כ: {currentEmail}
        </p>
      </div>

      {/* Global action error */}
      {actionError && (
        <div
          style={{
            backgroundColor: '#fef2f2',
            border: '1px solid #fca5a5',
            borderRadius: 8,
            padding: '10px 14px',
            color: '#dc2626',
            fontSize: 13,
            marginBottom: 16,
          }}
        >
          {actionError}
        </div>
      )}

      {/* Fetch error */}
      {fetchError && (
        <div
          style={{
            backgroundColor: '#fef2f2',
            border: '1px solid #fca5a5',
            borderRadius: 8,
            padding: '10px 14px',
            color: '#dc2626',
            fontSize: 13,
            marginBottom: 16,
          }}
        >
          {fetchError}
        </div>
      )}

      {/* ── Add user form ── */}
      <div style={{ ...card, padding: '24px 28px', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18 }}>
          <div style={{ width: 3, height: 16, borderRadius: 2, backgroundColor: '#1f623e' }} />
          <h2 style={{ fontSize: 15, fontWeight: 700, color: '#1a2620', margin: 0 }}>
            הוספת משתמש חדש
          </h2>
        </div>

        {addSuccess && (
          <div
            style={{
              backgroundColor: '#eef6f1',
              border: '1px solid #a9d5ba',
              borderRadius: 8,
              padding: '10px 14px',
              color: '#1f623e',
              fontSize: 13,
              marginBottom: 16,
            }}
          >
            {addSuccess}
          </div>
        )}
        {addError && (
          <div
            style={{
              backgroundColor: '#fef2f2',
              border: '1px solid #fca5a5',
              borderRadius: 8,
              padding: '10px 14px',
              color: '#dc2626',
              fontSize: 13,
              marginBottom: 16,
            }}
          >
            {addError}
          </div>
        )}

        <form onSubmit={handleAdd} style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#4a5e52', marginBottom: 6 }}>
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
                border: '1.5px solid #ddd8d0',
                backgroundColor: '#faf7f2',
                fontSize: 14,
                color: '#1a2620',
                outline: 'none',
                boxSizing: 'border-box',
                direction: 'ltr',
                textAlign: 'right',
              }}
              onFocus={e => e.currentTarget.style.borderColor = '#1f623e'}
              onBlur={e => e.currentTarget.style.borderColor = '#ddd8d0'}
            />
          </div>

          <div style={{ minWidth: 140 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#4a5e52', marginBottom: 6 }}>
              תפקיד
            </label>
            <select
              value={newRole}
              onChange={e => setNewRole(e.target.value as 'admin' | 'staff')}
              style={{
                width: '100%',
                padding: '9px 12px',
                borderRadius: 8,
                border: '1.5px solid #ddd8d0',
                backgroundColor: '#faf7f2',
                fontSize: 14,
                color: '#1a2620',
                outline: 'none',
                cursor: 'pointer',
              }}
              onFocus={e => e.currentTarget.style.borderColor = '#1f623e'}
              onBlur={e => e.currentTarget.style.borderColor = '#ddd8d0'}
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
              borderRadius: 8,
              border: 'none',
              backgroundColor: adding ? '#a9d5ba' : '#1f623e',
              color: '#fff',
              fontSize: 14,
              fontWeight: 600,
              cursor: adding ? 'not-allowed' : 'pointer',
              whiteSpace: 'nowrap',
              boxShadow: '0 1px 4px rgba(31,98,62,0.18)',
              transition: 'background-color 0.15s',
            }}
            onMouseEnter={e => { if (!adding) e.currentTarget.style.backgroundColor = '#184f31'; }}
            onMouseLeave={e => { if (!adding) e.currentTarget.style.backgroundColor = '#1f623e'; }}
          >
            {adding ? 'מוסיף...' : '+ הוסף משתמש'}
          </button>
        </form>
      </div>

      {/* ── Users table ── */}
      <div style={{ ...card, overflow: 'hidden' }}>
        <div
          style={{
            padding: '18px 24px 14px',
            borderBottom: '1px solid #ede8e1',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 3, height: 16, borderRadius: 2, backgroundColor: '#1f623e' }} />
            <h2 style={{ fontSize: 15, fontWeight: 700, color: '#1a2620', margin: 0 }}>
              משתמשים מורשים
            </h2>
          </div>
          <span
            style={{
              fontSize: 12,
              color: '#6b7b6e',
              backgroundColor: '#f6f2ec',
              padding: '3px 10px',
              borderRadius: 20,
              border: '1px solid #e5ddd4',
            }}
          >
            {users.length} משתמשים
          </span>
        </div>

        {users.length === 0 ? (
          <div style={{ padding: '48px 24px', textAlign: 'center', color: '#9aaa9d' }}>
            <div style={{ fontSize: 28, marginBottom: 10 }}>◌</div>
            <p style={{ margin: 0, fontSize: 14 }}>אין משתמשים מורשים עדיין</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ backgroundColor: '#faf7f2' }}>
                  <th style={thStyle}>מייל</th>
                  <th style={thStyle}>תפקיד</th>
                  <th style={thStyle}>סטטוס</th>
                  <th style={thStyle}>תאריך הוספה</th>
                  <th style={{ ...thStyle, textAlign: 'center' }}>פעולות</th>
                </tr>
              </thead>
              <tbody>
                {users.map(user => {
                  const isSelf   = user.email === currentEmail;
                  const isBusy   = actionId === user.id;

                  return (
                    <tr
                      key={user.id}
                      style={{ backgroundColor: isSelf ? '#fafdf9' : '#ffffff' }}
                      onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#faf7f2'; }}
                      onMouseLeave={e => { e.currentTarget.style.backgroundColor = isSelf ? '#fafdf9' : '#ffffff'; }}
                    >
                      {/* Email */}
                      <td style={{ ...tdStyle, direction: 'ltr', textAlign: 'right', fontWeight: isSelf ? 600 : 400 }}>
                        {user.email}
                        {isSelf && (
                          <span
                            style={{
                              marginRight: 6,
                              fontSize: 11,
                              color: '#1f623e',
                              backgroundColor: '#eef6f1',
                              border: '1px solid #a9d5ba',
                              borderRadius: 10,
                              padding: '1px 6px',
                            }}
                          >
                            אתה
                          </span>
                        )}
                      </td>

                      {/* Role selector */}
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
                              border: '1px solid #ddd8d0',
                              backgroundColor: '#faf7f2',
                              fontSize: 13,
                              color: '#1a2620',
                              cursor: isBusy ? 'not-allowed' : 'pointer',
                            }}
                          >
                            <option value="staff">צוות</option>
                            <option value="admin">מנהל</option>
                          </select>
                        )}
                      </td>

                      {/* Active badge */}
                      <td style={tdStyle}>
                        <Badge active={user.is_active} />
                      </td>

                      {/* Created at */}
                      <td style={{ ...tdStyle, color: '#6b7b6e', fontSize: 13 }}>
                        {new Date(user.created_at).toLocaleDateString('he-IL', {
                          year: 'numeric', month: 'short', day: 'numeric',
                        })}
                      </td>

                      {/* Actions */}
                      <td style={{ ...tdStyle, textAlign: 'center' }}>
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                          {/* Toggle active */}
                          <button
                            onClick={() => handleToggleActive(user)}
                            disabled={isBusy || isSelf}
                            title={user.is_active ? 'השבת משתמש' : 'הפעל משתמש'}
                            style={{
                              padding: '4px 12px',
                              borderRadius: 6,
                              border: `1px solid ${user.is_active ? '#e5ddd4' : '#a9d5ba'}`,
                              backgroundColor: user.is_active ? '#faf7f2' : '#eef6f1',
                              color: user.is_active ? '#6b7b6e' : '#1f623e',
                              fontSize: 12,
                              fontWeight: 600,
                              cursor: (isBusy || isSelf) ? 'not-allowed' : 'pointer',
                              opacity: isSelf ? 0.4 : 1,
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {isBusy ? '...' : user.is_active ? 'השבת' : 'הפעל'}
                          </button>

                          {/* Delete */}
                          {!isSelf && (
                            <button
                              onClick={() => handleDelete(user)}
                              disabled={isBusy}
                              title="מחק משתמש"
                              style={{
                                padding: '4px 10px',
                                borderRadius: 6,
                                border: '1px solid #fca5a5',
                                backgroundColor: '#fef2f2',
                                color: '#dc2626',
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

        {/* Footer */}
        <div
          style={{
            padding: '10px 24px',
            borderTop: '1px solid #f0ece5',
            backgroundColor: '#faf7f2',
            fontSize: 12,
            color: '#9aaa9d',
          }}
        >
          רק מנהלים יכולים לגשת לדף זה. שינויים נכנסים לתוקף מיידית.
        </div>
      </div>
    </div>
  );
}
