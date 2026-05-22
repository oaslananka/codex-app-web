'use client';

import { Component, type ReactNode } from 'react';
import { createBrowserLogger } from '../../lib/logging/browser-logger';

const logger = createBrowserLogger('ui:error-boundary');

type ErrorBoundaryProps = {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, info: { componentStack: string }) => void;
};

type ErrorBoundaryState = {
  hasError: boolean;
  error: Error | null;
};

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    logger.error('Unhandled React error boundary event', error, info.componentStack);
    this.props.onError?.(error, info);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="error-boundary-fallback" role="alert">
          <div className="error-boundary-title">An unexpected error occurred</div>
          <div className="error-boundary-message">
            {this.state.error?.message ?? 'Unknown error'}
          </div>
          <button
            type="button"
            className="btn-sm btn-outline"
            onClick={() => this.setState({ hasError: false, error: null })}
          >
            Try Again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
