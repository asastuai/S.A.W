"use client";

import React from "react";

type State = { hasError: boolean; message: string };

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  State
> {
  state: State = { hasError: false, message: "" };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error?.message || String(error) };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[ErrorBoundary]", error, info);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <main className="min-h-screen flex items-center justify-center p-6 bg-ink text-bone">
        <div className="border border-rust max-w-md w-full p-6 text-center">
          <p className="text-rust uppercase tracking-widest text-xs mb-3">
            Something broke
          </p>
          <h2 className="font-display text-2xl mb-3">The demo crashed.</h2>
          <p className="text-bone/70 text-sm mb-4 leading-relaxed">
            This usually happens when the wallet adapter can't initialize on this
            browser (common on mobile Safari without Phantom installed).
          </p>
          <pre className="text-xs text-bone/50 bg-smoke p-3 mb-4 overflow-auto max-h-32 text-left">
            {this.state.message}
          </pre>
          <button
            onClick={() => location.reload()}
            className="border border-gold text-gold px-4 py-2 text-xs uppercase tracking-widest hover:bg-gold hover:text-ink"
          >
            Reload
          </button>
        </div>
      </main>
    );
  }
}
