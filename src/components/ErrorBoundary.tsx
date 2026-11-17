import { Component, ErrorInfo, ReactNode } from 'react';
import { SafeStorage } from '../game/storage';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
  errorStack: string;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    hasError: false,
    errorMessage: '',
    errorStack: '',
  };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error?.message || 'Unexpected runtime error',
      errorStack: error?.stack ? error.stack.split('\n').slice(0, 6).join('\n') : '',
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    if (typeof console !== 'undefined' && console.error) {
      console.error('[Syndicate Idle ErrorBoundary]', error, info);
    }
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleResetAndReload = () => {
    SafeStorage.clear();
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="flex h-[100dvh] w-[100vw] items-center justify-center bg-[#121216] p-4 text-zinc-100">
        <div className="w-full max-w-[400px] rounded-xl border border-[#8B1E24] bg-[#1a1920] p-5 shadow-2xl">
          <div className="mb-1 text-[10px] font-bold uppercase tracking-widest text-amber-400">
            Syndicate Idle · Safe Mode Recovery
          </div>
          <h1 className="mb-2 text-lg font-extrabold text-white">
            Operations Hit a Snag
          </h1>
          <p className="mb-3 text-xs leading-relaxed text-zinc-300">
            A runtime error occurred inside the embedded viewport. You can reload immediately or clear local cache if a corrupted save caused the crash.
          </p>
          <div className="mb-4 max-h-36 overflow-auto rounded-lg border border-zinc-800 bg-[#121216] p-2.5 font-mono text-[11px] text-rose-300">
            <div className="font-bold">{this.state.errorMessage}</div>
            {this.state.errorStack && (
              <pre className="mt-1 whitespace-pre-wrap text-[10px] text-zinc-400">
                {this.state.errorStack}
              </pre>
            )}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={this.handleReload}
              className="flex-1 cursor-pointer rounded-lg bg-amber-500 px-3 py-2 text-xs font-extrabold text-zinc-950 transition hover:bg-amber-400"
            >
              Reload Game
            </button>
            <button
              type="button"
              onClick={this.handleResetAndReload}
              className="flex-1 cursor-pointer rounded-lg border border-[#8B1E24] bg-[#8B1E24]/30 px-3 py-2 text-xs font-bold text-rose-200 transition hover:bg-[#8B1E24]/50"
            >
              Reset Cache & Reload
            </button>
          </div>
        </div>
      </div>
    );
  }
}
