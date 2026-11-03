import React from 'react';
import { AlertTriangle, RefreshCw, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    this.setState({ errorInfo });
  }

  resetError = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="p-6 md:p-8 max-w-3xl mx-auto">
          <div className="bg-white border border-rose-200 rounded-2xl p-6 shadow-sm space-y-4">
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-xl bg-rose-50 text-rose-600 shrink-0">
                <AlertTriangle size={24} />
              </div>
              <div>
                <h2 className="text-base font-semibold text-stone-900">
                  {this.props.title || 'Tab Encountered a Runtime Error'}
                </h2>
                <p className="text-xs text-stone-500 mt-0.5">
                  An unexpected issue occurred while rendering this section. Your admin session is intact, and other tabs remain operational.
                </p>
              </div>
            </div>

            {this.state.error && (
              <div className="p-3 bg-stone-50 rounded-xl border border-stone-200 text-xs font-mono text-rose-700 whitespace-pre-wrap overflow-x-auto max-h-40">
                {this.state.error.toString()}
              </div>
            )}

            <div className="flex items-center gap-3 pt-2">
              <Button
                size="sm"
                onClick={this.resetError}
                className="bg-emerald-700 hover:bg-emerald-800 text-white text-xs rounded-full gap-1.5"
              >
                <RefreshCw size={13} />
                Try Reloading Tab
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => window.location.reload()}
                className="text-xs rounded-full gap-1.5 text-stone-600"
              >
                <RotateCcw size={13} />
                Full Page Reload
              </Button>
            </div>

            {this.state.errorInfo?.componentStack && (
              <details className="mt-2 text-[11px] text-stone-400">
                <summary className="cursor-pointer hover:text-stone-600 select-none">
                  View component stack trace
                </summary>
                <pre className="mt-2 p-2 bg-stone-900 text-stone-200 rounded-lg overflow-x-auto text-[10px] leading-relaxed">
                  {this.state.errorInfo.componentStack}
                </pre>
              </details>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;

