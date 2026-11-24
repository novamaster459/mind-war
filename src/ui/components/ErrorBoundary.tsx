// ============================================================================
// Top-level error boundary. Without this, a single render/effect crash unmounts
// the entire React tree and leaves the player staring at a frozen frame.
// This keeps the app alive and offers a way back to the menu.
// ============================================================================
import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  onReset?: () => void;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Surface in the console for debugging without taking the app down.
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  private reset = () => {
    this.setState({ error: null });
    this.props.onReset?.();
  };

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-4 bg-slate-950 p-6 text-center">
        <div className="font-display text-2xl font-bold uppercase tracking-wider text-danger">
          Signal Lost
        </div>
        <p className="max-w-md font-mono text-xs text-slate-400">
          The tactical display crashed. Your match state is still in memory.
        </p>
        <pre className="max-w-lg overflow-x-auto rounded border border-slate-700 bg-slate-900/70 p-3 text-left font-mono text-[10px] text-slate-500">
          {error.message}
        </pre>
        <div className="flex gap-3">
          <button className="btn-primary" onClick={this.reset}>
            ↻ Reconnect Display
          </button>
          <button
            className="btn-tac border-slate-600 text-slate-300"
            onClick={() => window.location.reload()}
          >
            Reload
          </button>
        </div>
      </div>
    );
  }
}