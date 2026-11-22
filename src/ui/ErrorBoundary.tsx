import { Component, type ReactNode } from 'react';

/**
 * Catches a crash in part of the screen (e.g. on an older iPhone that lacks a
 * newer browser feature) so the rest of the app keeps working instead of
 * going blank.
 */
export class ErrorBoundary extends Component<
  { fallback?: ReactNode; resetKey?: unknown; children: ReactNode },
  { failed: boolean; key: unknown }
> {
  state = { failed: false, key: this.props.resetKey };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  static getDerivedStateFromProps(p: { resetKey?: unknown }, s: { failed: boolean; key: unknown }) {
    return p.resetKey !== s.key ? { failed: false, key: p.resetKey } : null;
  }
  componentDidCatch(err: unknown) {
    console.error('[ErrorBoundary]', err);
  }
  render() {
    return this.state.failed ? (this.props.fallback ?? null) : this.props.children;
  }
}

/** Shown if the whole app crashes: a way back instead of a blank screen. */
export function CrashScreen() {
  return (
    <div className="crash-screen">
      <div className="crash-emoji">🙈</div>
      <b>Oops, something went wrong.</b>
      <button className="btn" onClick={() => location.reload()}>
        Start again
      </button>
    </div>
  );
}
