'use client';

/**
 * In-app preview modal for patient / staff document attachments.
 *
 * Browsers download Office documents because they have no native renderer.
 * Without this modal the patient/staff "פתח" button — even with
 * target="_blank" — kicked off a download for .doc/.docx files. The
 * modal routes each file kind through a renderer that actually shows
 * the content in-place:
 *
 *   PDF      → <iframe src={signedUrl}>          (native browser PDF viewer)
 *   Image    → <img src={signedUrl}>             (sandbox-safe in img tag)
 *   Office   → <iframe src={MS-Office-viewer}>   (Microsoft's hosted viewer
 *              fetches the SIGNED URL from its servers; Supabase signed
 *              URLs are publicly reachable until they expire so this works
 *              without exposing the bucket)
 *   Other    → friendly fallback with "פתח בכרטיסייה חדשה" + "הורד"
 *
 * Download button uses fetch + blob + anchor.download — that's the only
 * cross-browser way to force a download when the URL itself serves
 * Content-Disposition: inline.
 */

import { useEffect, useState } from 'react';

interface Props {
  open:      boolean;
  onClose:   () => void;
  url:       string;
  fileName:  string;
  mimeType:  string | null;
}

type ViewerKind = 'pdf' | 'image' | 'office' | 'other';

function detectKind(fileName: string, mime: string | null): ViewerKind {
  const m = (mime ?? '').toLowerCase();
  const ext = fileName.includes('.')
    ? fileName.slice(fileName.lastIndexOf('.') + 1).toLowerCase()
    : '';

  if (m === 'application/pdf' || ext === 'pdf') return 'pdf';
  if (m.startsWith('image/') ||
      ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif', 'bmp', 'svg'].includes(ext)) {
    return 'image';
  }
  // Office formats that MS Office Online viewer can render via iframe.
  const officeExt = ['doc','docx','xls','xlsx','ppt','pptx'];
  if (officeExt.includes(ext)) return 'office';
  if (m.includes('msword') || m.includes('officedocument') ||
      m.includes('ms-excel') || m.includes('ms-powerpoint')) return 'office';

  return 'other';
}

export default function DocumentPreviewModal({
  open, onClose, url, fileName, mimeType,
}: Props) {
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  // Close on Escape — match the rest of the app's modal UX.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const kind = detectKind(fileName, mimeType);

  async function handleDownload() {
    if (downloading) return;
    setDownloadError(null);
    setDownloading(true);
    try {
      // Fetch the signed URL ourselves so we can force a download via
      // an anchor with the `download` attribute. Browsers honor that
      // attribute only on same-origin OR CORS-allowed responses with
      // a blob URL — that's why we go through blob().
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objUrl;
      a.download = fileName || 'attachment';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(objUrl), 1000);
    } catch (e) {
      setDownloadError((e as Error).message);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 60,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
        backgroundColor: 'rgba(15,23,42,0.5)',
        backdropFilter: 'blur(3px)',
        direction: 'rtl',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 1100,
          height: '92vh', maxHeight: 'calc(100vh - 32px)',
          backgroundColor: '#FFFFFF', borderRadius: 14,
          boxShadow: '0 24px 60px rgba(0,0,0,0.30)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '14px 20px', borderBottom: '1px solid #E8ECF0',
          flexShrink: 0,
        }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 32, height: 32, borderRadius: 8,
            backgroundColor: '#F0FDF9', color: '#0D9488',
            border: '1px solid #99F6E4', flexShrink: 0,
          }}>
            <FileIcon />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{
              fontSize: 14, fontWeight: 600, color: '#1A2332', margin: 0,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
              {fileName || 'מסמך'}
            </p>
            <p style={{ fontSize: 11, color: '#94A3B8', margin: '2px 0 0' }}>
              {mimeType || 'סוג קובץ לא ידוע'}
            </p>
          </div>

          {/* Open in new tab — useful when the in-frame viewer can't
              handle a quirky file or for printing. */}
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontSize: 12, fontWeight: 500, color: '#475569',
              padding: '6px 12px', borderRadius: 8,
              border: '1px solid #E8ECF0', textDecoration: 'none',
              backgroundColor: '#FFFFFF',
            }}
            title="פתח בכרטיסייה חדשה"
          >
            ↗ חלון חדש
          </a>

          <button
            onClick={handleDownload}
            disabled={downloading}
            style={{
              fontSize: 12, fontWeight: 500,
              color: downloading ? '#94A3B8' : '#0D9488',
              padding: '6px 12px', borderRadius: 8,
              border: `1px solid ${downloading ? '#E8ECF0' : '#99F6E4'}`,
              backgroundColor: downloading ? '#F8FAFC' : '#F0FDF9',
              cursor: downloading ? 'wait' : 'pointer',
            }}
          >
            {downloading ? 'מוריד...' : '↓ הורד'}
          </button>

          <button
            onClick={onClose}
            aria-label="סגור"
            style={{
              width: 30, height: 30, borderRadius: '50%',
              border: 'none', background: '#F1F5F9', color: '#475569',
              fontSize: 16, cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div style={{
          flex: 1, minHeight: 0,
          backgroundColor: kind === 'image' ? '#0F172A' : '#FFFFFF',
          overflow: 'auto',
        }}>
          {kind === 'pdf' && (
            <iframe
              src={url}
              title={fileName}
              style={{
                width: '100%', height: '100%', border: 'none',
                display: 'block', direction: 'ltr',
              }}
            />
          )}

          {kind === 'image' && (
            <div style={{
              minHeight: '100%', display: 'flex',
              alignItems: 'center', justifyContent: 'center', padding: 16,
            }}>
              <img
                src={url}
                alt={fileName}
                style={{
                  maxWidth: '100%', maxHeight: 'calc(92vh - 80px)',
                  objectFit: 'contain', borderRadius: 6,
                  boxShadow: '0 8px 24px rgba(0,0,0,0.40)',
                }}
              />
            </div>
          )}

          {kind === 'office' && (
            <iframe
              // Microsoft's hosted viewer expects a publicly fetchable URL.
              // Supabase signed URLs ARE publicly reachable until they
              // expire — exactly what's needed here.
              src={`https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(url)}`}
              title={fileName}
              style={{
                width: '100%', height: '100%', border: 'none',
                display: 'block', direction: 'ltr',
              }}
            />
          )}

          {kind === 'other' && (
            <div style={{
              height: '100%', display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: 12,
              padding: 24, textAlign: 'center', color: '#475569',
            }}>
              <span style={{ fontSize: 38, opacity: 0.5 }}>📄</span>
              <p style={{ fontSize: 14, fontWeight: 600, color: '#1A2332', margin: 0 }}>
                לא ניתן להציג את סוג הקובץ הזה בתוך החלון
              </p>
              <p style={{ fontSize: 12, color: '#64748B', margin: 0, maxWidth: 420 }}>
                ניתן להשתמש בכפתורים בכותרת כדי לפתוח את הקובץ בכרטיסייה
                חדשה או להוריד אותו למחשב.
              </p>
            </div>
          )}
        </div>

        {downloadError && (
          <div style={{
            padding: '8px 16px', backgroundColor: '#FEF2F2',
            color: '#DC2626', fontSize: 12, borderTop: '1px solid #FECACA',
            flexShrink: 0,
          }}>
            הורדה נכשלה: {downloadError}
          </div>
        )}
      </div>
    </div>
  );
}

function FileIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}
