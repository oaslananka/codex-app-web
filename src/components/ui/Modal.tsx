'use client';

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  getTopModalId,
  registerModal,
  subscribeToModalStack,
  type ModalLayer,
  unregisterModal,
} from './modal-stack';

type ModalProps = {
  isOpen: boolean;
  children: ReactNode;
  onClose: () => void;
  className?: string;
  overlayClassName?: string;
  panelClassName?: string;
  role?: 'dialog' | 'alertdialog';
  ariaLabelledBy?: string;
  closeOnBackdrop?: boolean;
  closeOnEscape?: boolean;
  layer?: ModalLayer;
  overlayId?: string;
};

export function Modal({
  isOpen,
  children,
  onClose,
  className,
  overlayClassName,
  panelClassName,
  role = 'dialog',
  ariaLabelledBy,
  closeOnBackdrop = true,
  closeOnEscape = true,
  layer = 'dialog',
  overlayId,
}: ModalProps) {
  const generatedId = useId();
  const modalId = useMemo(() => overlayId ?? `modal-${generatedId}`, [generatedId, overlayId]);
  const [stackVersion, setStackVersion] = useState(0);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const previouslyFocusedElementRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    return subscribeToModalStack(() => {
      setStackVersion((current) => current + 1);
    });
  }, []);

  useEffect(() => {
    if (!isOpen) {
      unregisterModal(modalId);
      return;
    }

    registerModal(modalId, layer);
    return () => {
      unregisterModal(modalId);
    };
  }, [isOpen, layer, modalId]);

  const isTopModal = isOpen && getTopModalId() === modalId;

  useEffect(() => {
    if (!isTopModal) return;

    previouslyFocusedElementRef.current = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const focusableElements = Array.from(
      panel?.querySelectorAll<HTMLElement>(
        'button, input, textarea, select, [tabindex]:not([tabindex="-1"])',
      ) ?? [],
    ).filter((element) => !element.hasAttribute('disabled'));
    const focusTarget = focusableElements[0] ?? panel;
    focusTarget?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && closeOnEscape) {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== 'Tab') return;
      const currentFocusable = Array.from(
        panel?.querySelectorAll<HTMLElement>(
          'button, input, textarea, select, [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      ).filter((element) => !element.hasAttribute('disabled'));
      if (!currentFocusable.length) return;

      const first = currentFocusable[0];
      const last = currentFocusable[currentFocusable.length - 1];
      const activeElement = document.activeElement;

      if (event.shiftKey && activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      previouslyFocusedElementRef.current?.focus?.();
    };
  }, [closeOnEscape, isTopModal, onClose, stackVersion]);

  if (!isOpen || typeof document === 'undefined') {
    return null;
  }

  return createPortal(
    <div
      id={overlayId}
      data-modal-layer={layer}
      className={overlayClassName ?? 'modal-overlay'}
      role="presentation"
      style={!isTopModal ? { pointerEvents: 'none' } : undefined}
      aria-hidden={!isTopModal}
      onClick={(event) => {
        if (closeOnBackdrop && isTopModal && event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        ref={panelRef}
        className={[panelClassName ?? 'modal-panel', className].filter(Boolean).join(' ')}
        role={role}
        aria-modal="true"
        aria-labelledby={ariaLabelledBy}
        tabIndex={-1}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
