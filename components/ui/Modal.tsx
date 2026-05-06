'use client';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  size?: 'md' | 'lg' | 'xl';
}

const maxWidths = { md: 480, lg: 640, xl: 860 };

export default function Modal({ open, onClose, title, children, size = 'lg' }: ModalProps) {
  if (!open) return null;

  return (
    <div
      style={{
        position:        'fixed',
        inset:           0,
        zIndex:          50,
        display:         'flex',
        alignItems:      'center',
        justifyContent:  'center',
        padding:         16,
        backgroundColor: 'rgba(15,23,42,0.5)',
        backdropFilter:  'blur(3px)',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius:    16,
          width:           '100%',
          maxWidth:        maxWidths[size],
          maxHeight:       '92vh',
          overflowY:       'auto',
          boxShadow:       '0 24px 64px rgba(0,0,0,0.18), 0 4px 16px rgba(0,0,0,0.08)',
          border:          '1px solid #E2E8F0',
          animation:       'fadeIn 0.15s ease-out',
        }}
      >
        {/* Header */}
        <div
          style={{
            display:         'flex',
            alignItems:      'center',
            justifyContent:  'space-between',
            padding:         '20px 24px 16px',
            borderBottom:    '1px solid #F1F5F9',
            position:        'sticky',
            top:             0,
            backgroundColor: '#FFFFFF',
            zIndex:          10,
            borderRadius:    '16px 16px 0 0',
          }}
        >
          <h2 style={{ fontSize: 16, fontWeight: 700, color: '#0F172A', margin: 0 }}>
            {title}
          </h2>
          <button
            onClick={onClose}
            style={{
              width:           32,
              height:          32,
              display:         'flex',
              alignItems:      'center',
              justifyContent:  'center',
              border:          'none',
              borderRadius:    8,
              backgroundColor: 'transparent',
              color:           '#94A3B8',
              cursor:          'pointer',
              fontSize:        18,
              transition:      'all 0.12s',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.backgroundColor = '#F1F5F9';
              e.currentTarget.style.color = '#0F172A';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.backgroundColor = 'transparent';
              e.currentTarget.style.color = '#94A3B8';
            }}
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '24px' }}>
          {children}
        </div>
      </div>
    </div>
  );
}
