'use client';

import { useEffect, useMemo, useState } from 'react';
import type { BrowserLogSettings, LogLevel } from '../../lib/logging/shared';
import type { ApprovalRequestState } from '../../lib/codex-ui-runtime';
import { Modal } from '../ui';
import { buildApprovalDetailSections } from './approval-details';

type ToastEntry = {
  id: string;
  message: string;
  type: 'info' | 'success' | 'error';
};

type OverlaysProps = {
  activeApprovalRequest: ApprovalRequestState | null;
  connectionTarget: string;
  logSettings: BrowserLogSettings;
  onCloseSettings: () => void;
  onDismissApproval: () => void;
  onDismissToast?: (id: string) => void;
  onResolveApproval: (
    action: 'confirm' | 'alternate' | 'deny',
    values: {
      text?: string;
      answers?: Record<string, string[]>;
      accessToken?: string;
      chatgptAccountId?: string;
      chatgptPlanType?: string;
    },
  ) => void;
  onReconnect: () => void;
  onUpdateLogSettings: (values: Partial<BrowserLogSettings>) => void;
  settingsOpen: boolean;
  toasts: ToastEntry[];
};

function getApprovalClass(request: ApprovalRequestState | null) {
  switch (request?.variant) {
    case 'command':
      return 'cmd';
    case 'file':
    case 'patch':
      return 'file';
    case 'permissions':
      return 'perm';
    case 'user-input':
    case 'tool-call':
    case 'auth-refresh':
      return 'input';
    default:
      return 'input';
  }
}

export function Overlays({
  activeApprovalRequest,
  connectionTarget,
  logSettings,
  onCloseSettings,
  onDismissApproval,
  onDismissToast,
  onResolveApproval,
  onReconnect,
  onUpdateLogSettings,
  settingsOpen,
  toasts,
}: OverlaysProps) {
  const [text, setText] = useState('');
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string>>({});
  const [authFields, setAuthFields] = useState({
    accessToken: '',
    chatgptAccountId: '',
    chatgptPlanType: '',
  });

  useEffect(() => {
    setText('');
    setAnswers({});
    setSelectedOptions({});
    setAuthFields({
      accessToken: '',
      chatgptAccountId: '',
      chatgptPlanType: '',
    });
  }, [activeApprovalRequest?.requestId]);

  const needsText = Boolean(activeApprovalRequest?.needsTextInput);
  const questions = activeApprovalRequest?.questions ?? [];
  const approvalClass = getApprovalClass(activeApprovalRequest);
  const approvalSections = useMemo(
    () => buildApprovalDetailSections(activeApprovalRequest),
    [activeApprovalRequest],
  );

  const buildQuestionAnswers = () =>
    Object.fromEntries(
      questions.map((question) => {
        const selected = selectedOptions[question.id]?.trim();
        const typed = answers[question.id]?.trim();
        const values = [
          ...(selected ? [selected] : []),
          ...((question.options?.length || question.isOther || !selected) && typed ? [typed] : []),
        ];
        return [question.id, values];
      }),
    );

  const canSubmit = useMemo(() => {
    if (!activeApprovalRequest) return false;
    if (activeApprovalRequest.authFields) {
      return Boolean(authFields.accessToken.trim() && authFields.chatgptAccountId.trim());
    }
    if (questions.length > 0) {
      return questions.every(
        (question) =>
          !question.required ||
          Boolean(selectedOptions[question.id]?.trim() || answers[question.id]?.trim()),
      );
    }
    if (needsText) return Boolean(text.trim());
    return true;
  }, [
    activeApprovalRequest,
    answers,
    authFields.accessToken,
    authFields.chatgptAccountId,
    needsText,
    questions,
    selectedOptions,
    text,
  ]);

  return (
    <>
      <Modal
        isOpen={Boolean(activeApprovalRequest)}
        onClose={onDismissApproval}
        role="alertdialog"
        layer="approval"
        closeOnBackdrop={false}
        overlayId="approval-overlay"
        overlayClassName="modal-overlay approval-overlay"
        panelClassName="approval-modal"
        ariaLabelledBy="approval-title"
      >
        {activeApprovalRequest ? (
          <div className="approval-shell">
            <div className="approval-title" id="approval-title">
              {activeApprovalRequest.title}
            </div>
            <span className={`approval-type ${approvalClass}`} id="approval-type-badge">
              {activeApprovalRequest.badge}
            </span>
            <div className="approval-detail" id="approval-detail">
              {activeApprovalRequest.detail}
            </div>

            {approvalSections.length ? (
              <div className="approval-sections" aria-label="Approval context">
                {approvalSections.map((section) => (
                  <section key={section.title} className="approval-section-card">
                    <div className="approval-section-title">{section.title}</div>
                    <div className="approval-section-list">
                      {section.items.map((item) => (
                        <div
                          key={`${section.title}-${item.label}`}
                          className="approval-section-row"
                        >
                          <span className="approval-section-label">{item.label}</span>
                          <code className="approval-section-value">{item.value}</code>
                        </div>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            ) : null}

            {needsText ? (
              <div className="approval-input-area" id="approval-input-area">
                <label htmlFor="approval-user-input">
                  {activeApprovalRequest.textInputLabel || 'Response'}
                </label>
                <textarea
                  id="approval-user-input"
                  name="approval-user-input"
                  rows={4}
                  value={text}
                  placeholder={activeApprovalRequest.textInputPlaceholder || 'Write your response'}
                  onChange={(event) => setText(event.target.value)}
                />
              </div>
            ) : null}

            {questions.length > 0 ? (
              <div className="approval-question-list">
                {questions.map((question) => (
                  <div key={question.id} className="approval-input-area">
                    <label htmlFor={`approval-question-${question.id}`}>
                      {question.header ? `${question.header}: ` : ''}
                      {question.question}
                    </label>
                    {question.options?.length ? (
                      <select
                        id={`approval-question-${question.id}`}
                        value={selectedOptions[question.id] || ''}
                        onChange={(event) =>
                          setSelectedOptions((current) => ({
                            ...current,
                            [question.id]: event.target.value,
                          }))
                        }
                      >
                        <option value="">Select an option</option>
                        {question.options.map((option) => (
                          <option key={option.label} value={option.label}>
                            {option.label}
                            {option.description ? ` - ${option.description}` : ''}
                          </option>
                        ))}
                      </select>
                    ) : null}
                    {!question.options?.length || question.isOther ? (
                      <input
                        id={
                          question.options?.length
                            ? `approval-question-other-${question.id}`
                            : `approval-question-${question.id}`
                        }
                        type={question.isSecret ? 'password' : 'text'}
                        value={answers[question.id] || ''}
                        placeholder={question.isOther ? 'Optional custom answer' : undefined}
                        onChange={(event) =>
                          setAnswers((current) => ({
                            ...current,
                            [question.id]: event.target.value,
                          }))
                        }
                      />
                    ) : null}
                  </div>
                ))}
              </div>
            ) : null}

            {activeApprovalRequest.authFields ? (
              <div className="approval-auth-grid">
                <div className="approval-input-area">
                  <label htmlFor="approval-access-token">Access Token</label>
                  <textarea
                    id="approval-access-token"
                    rows={4}
                    value={authFields.accessToken}
                    onChange={(event) =>
                      setAuthFields((current) => ({
                        ...current,
                        accessToken: event.target.value,
                      }))
                    }
                  />
                </div>
                <div className="approval-input-area">
                  <label htmlFor="approval-account-id">ChatGPT Account ID</label>
                  <input
                    id="approval-account-id"
                    type="text"
                    value={authFields.chatgptAccountId}
                    onChange={(event) =>
                      setAuthFields((current) => ({
                        ...current,
                        chatgptAccountId: event.target.value,
                      }))
                    }
                  />
                </div>
                <div className="approval-input-area">
                  <label htmlFor="approval-plan-type">Plan Type</label>
                  <input
                    id="approval-plan-type"
                    type="text"
                    value={authFields.chatgptPlanType}
                    onChange={(event) =>
                      setAuthFields((current) => ({
                        ...current,
                        chatgptPlanType: event.target.value,
                      }))
                    }
                  />
                </div>
              </div>
            ) : null}

            <div className="approval-btns" id="approval-btns">
              <button
                type="button"
                className="btn-approve"
                disabled={!canSubmit}
                onClick={() =>
                  onResolveApproval('confirm', {
                    text,
                    answers: buildQuestionAnswers(),
                    accessToken: authFields.accessToken,
                    chatgptAccountId: authFields.chatgptAccountId,
                    chatgptPlanType: authFields.chatgptPlanType,
                  })
                }
              >
                {activeApprovalRequest.confirmLabel}
              </button>
              {activeApprovalRequest.alternateLabel ? (
                <button
                  type="button"
                  className="btn-approve-session"
                  onClick={() =>
                    onResolveApproval('alternate', {
                      text,
                      answers: buildQuestionAnswers(),
                      accessToken: authFields.accessToken,
                      chatgptAccountId: authFields.chatgptAccountId,
                      chatgptPlanType: authFields.chatgptPlanType,
                    })
                  }
                >
                  {activeApprovalRequest.alternateLabel}
                </button>
              ) : null}
              <button
                type="button"
                className="btn-deny"
                onClick={() => onResolveApproval('deny', {})}
              >
                {activeApprovalRequest.denyLabel || 'Deny'}
              </button>
              <button type="button" className="btn-sm btn-outline" onClick={onDismissApproval}>
                Close
              </button>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal
        isOpen={settingsOpen}
        onClose={onCloseSettings}
        layer="settings"
        overlayId="settings-overlay"
        overlayClassName="modal-overlay settings-overlay"
        panelClassName="settings-modal"
        ariaLabelledBy="settings-title"
      >
        <div className="settings-shell">
          <div className="settings-title" id="settings-title">
            App Settings
          </div>
          <div className="settings-row">
            <label>Active target</label>
            <input type="text" value={connectionTarget} readOnly />
          </div>
          <div className="settings-row">
            <label htmlFor="browser-log-level">Browser log level</label>
            <select
              id="browser-log-level"
              value={logSettings.level}
              onChange={(event) => onUpdateLogSettings({ level: event.target.value as LogLevel })}
            >
              <option value="trace">Trace</option>
              <option value="debug">Debug</option>
              <option value="info">Info</option>
              <option value="warn">Warn</option>
              <option value="error">Error</option>
              <option value="silent">Silent</option>
            </select>
          </div>
          <label className="settings-checkbox-row">
            <input
              type="checkbox"
              checked={logSettings.timestamps}
              onChange={(event) => onUpdateLogSettings({ timestamps: event.target.checked })}
            />
            <span>Show timestamps in browser logs</span>
          </label>
          <div className="config-help">
            Browser logs update instantly and are persisted locally. Server and launcher logs use
            <code> CODEX_LOG_LEVEL</code> and <code>CODEX_LOG_TIMESTAMPS</code>.
          </div>
          <div className="settings-btns">
            <button
              type="button"
              className="btn-sm btn-primary"
              id="btn-save-settings"
              onClick={() => {
                onReconnect();
                onCloseSettings();
              }}
            >
              Reconnect
            </button>
            <button
              type="button"
              className="btn-sm btn-outline"
              id="btn-close-settings"
              onClick={onCloseSettings}
            >
              Close
            </button>
          </div>
        </div>
      </Modal>

      <div id="toast-container">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast ${toast.type}`}>
            <span className="toast-message">{toast.message}</span>
            <button
              type="button"
              className="toast-dismiss"
              aria-label="Dismiss"
              onClick={() => onDismissToast?.(toast.id)}
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </>
  );
}
