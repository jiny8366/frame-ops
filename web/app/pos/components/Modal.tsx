// Frame Ops Phase 2 — 단순 모달 래퍼
// .modal-backdrop CSS 유틸 활용. backdrop 클릭 또는 ESC 로 닫기.

'use client';

import { memo, useCallback, useEffect } from 'react';

export interface ModalProps {
  onClose: () => void;
  children: React.ReactNode;
  /** ≥1024px에서 backdrop blur 적용 (Apple HIG vibrancy) */
  blurBackdrop?: boolean;
  /** ESC 로 닫기 비활성화 (예: 결제 진행 중 실수 방지) */
  disableEscape?: boolean;
}

export const Modal = memo(function Modal({
  onClose,
  children,
  blurBackdrop = false,
  disableEscape = false,
}: ModalProps) {
  // ESC 키로 닫기
  useEffect(() => {
    if (disableEscape) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose, disableEscape]);

  // 마운트 동안 body 스크롤 잠금
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      // backdrop 자체 클릭에만 닫음 (자식 영역 클릭은 무시)
      if (e.target === e.currentTarget) onClose();
    },
    [onClose]
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={handleBackdropClick}
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 modal-backdrop ${
        blurBackdrop ? 'modal-backdrop--blur' : ''
      }`}
    >
      <div
        className="rounded-2xl bg-[var(--color-bg-primary)] shadow-[var(--shadow-md)] max-h-[90vh] overflow-auto"
        onClick={(e) => e.stopPropagation()}
        // 위 onClick 은 backdrop click 차단용 — 자식 인터랙션 방해 안 함
      >
        {children}
      </div>
    </div>
  );
});
