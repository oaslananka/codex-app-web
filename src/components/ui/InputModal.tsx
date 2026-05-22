'use client';

import { useEffect, useRef, useState } from 'react';
import { Modal } from './Modal';

export type InputModalConfig = {
  title: string;
  label: string;
  placeholder?: string;
  defaultValue?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: (value: string) => void;
};

export type InputModalProps = InputModalConfig & {
  isOpen: boolean;
  onCancel: () => void;
};

export function InputModal({
  isOpen,
  title,
  label,
  placeholder = '',
  defaultValue = '',
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
}: InputModalProps) {
  const [value, setValue] = useState(defaultValue);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setValue(defaultValue);
      requestAnimationFrame(() => inputRef.current?.select());
    }
  }, [defaultValue, isOpen]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onCancel}
      layer="input"
      overlayClassName="modal-overlay input-modal-overlay"
      panelClassName="input-modal"
      ariaLabelledBy="input-modal-title"
    >
      <div className="input-modal-title" id="input-modal-title">
        {title}
      </div>
      <label className="input-modal-label" htmlFor="input-modal-field">
        {label}
      </label>
      <input
        ref={inputRef}
        id="input-modal-field"
        type="text"
        className="input-modal-field"
        value={value}
        placeholder={placeholder}
        onChange={(event) => setValue(event.target.value)}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && value.trim()) {
            event.preventDefault();
            onConfirm(value.trim());
          }
        }}
      />
      <div className="input-modal-btns">
        <button
          type="button"
          className="btn-primary btn-sm"
          disabled={!value.trim()}
          onClick={() => onConfirm(value.trim())}
        >
          {confirmLabel}
        </button>
        <button type="button" className="btn-outline btn-sm" onClick={onCancel}>
          {cancelLabel}
        </button>
      </div>
    </Modal>
  );
}
