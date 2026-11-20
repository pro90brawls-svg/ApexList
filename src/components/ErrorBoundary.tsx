import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    hasError: false,
    message: '',
  };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    let readable = 'An unexpected error occurred while rendering this view.';
    try {
      const parsed = JSON.parse(error.message) as { error?: string; operationType?: string };
      if (parsed && typeof parsed.error === 'string') {
        readable = parsed.error.includes('Missing or insufficient permissions')
          ? 'You do not have permission for this operation. Please verify your email or sign in again.'
          : parsed.error;
      }
    } catch {
      if (error.message) {
        readable = error.message;
      }
    }
    return { hasError: true, message: readable };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Application boundary caught error:', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-[#090B10] px-4 text-slate-100">
          <div className="w-full max-w-md rounded-2xl border border-white/[0.1] bg-[#10131C] p-6 shadow-2xl">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-rose-500/15 text-rose-400">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <h1 className="mt-4 font-display text-lg font-semibold text-white">Something went wrong</h1>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">{this.state.message}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-5 inline-flex items-center gap-2 rounded-lg bg-rose-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-rose-500"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reload ApexList
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
