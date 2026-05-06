'use client';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  size?: 'md' | 'lg' | 'xl';
}

export default function Modal({ open, onClose, title, children, size = 'lg' }: ModalProps) {
  if (!open) return null;

  const sizeClass = { md: 'max-w-md', lg: 'max-w-2xl', xl: 'max-w-4xl' }[size];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(15, 23, 18, 0.45)', backdropFilter: 'blur(2px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className={`bg-white rounded-2xl w-full ${sizeClass} max-h-[92vh] overflow-y-auto`}
        style={{
          border: '1px solid #e5ddd4',
          boxShadow: '0 20px 60px -10px rgba(26,38,32,0.25), 0 4px 16px -4px rgba(26,38,32,0.12)',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4 sticky top-0 bg-white rounded-t-2xl z-10"
          style={{ borderBottom: '1px solid #f0ece5' }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-1 h-5 rounded-full"
              style={{ backgroundColor: '#c49438' }}
            />
            <h2 className="text-base font-bold" style={{ color: '#1a2620' }}>
              {title}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors"
            style={{ color: '#8fa49a' }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#f6f2ec';
              e.currentTarget.style.color = '#1a2620';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = '';
              e.currentTarget.style.color = '#8fa49a';
            }}
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  );
}
