import React from 'react';

/* No stylesheet of its own. Both surfaces below are built from primitives that
   already ship in App.css (.loading / .loading__strand / .sheet-error / .label
   / .btn-ghost / .shell), which is loaded on every route. Loading.css was
   untouched legacy — the old off-palette accent, gradient text, blurred
   shadows, round dots — and is deleted rather than patched.

   This matters more than its line count suggests: every page's copy is fetched
   at runtime, so this component IS first paint on all five routes. It was the
   largest surviving patch of the old accent on the site — and the first thing
   every visitor saw, on every visit, on every route. */

/* `variant` stays in the signature so no call site has to move (§5.8). The
   sheet has exactly one loading state, so it no longer selects between two
   loaders — the dead .ring-loader branch is gone. Accepted and ignored.

   .loading already carries its own --gutter padding, so it takes no .shell —
   that would inset it twice. .sheet-error below has none, so it does take one. */
// eslint-disable-next-line no-unused-vars
export const LoadingSpinner = ({ variant }) => (
  <div className="loading">
    {/* Not a spinner: a 96px strand drawn in with scaleX from origin left, over
        --dur-3. Under reduced motion App.css renders it at scaleX(1) — the
        final state, which is the whole point of animating by drawing. */}
    <div className="loading__strand" aria-hidden="true" />
    <p className="sr-only" role="status">Loading</p>
  </div>
);

export const ErrorState = ({ message, onRetry }) => (
  <div className="shell">
    <div className="sheet-error" role="alert">
      {/* There is no error red. Red is outside the hue jail — invalid is LIVE. */}
      <p className="label label--live">Signal lost</p>
      {message && <p className="caption">{message}</p>}
      {onRetry && (
        <button type="button" className="btn-ghost" onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  </div>
);

export default LoadingSpinner;
