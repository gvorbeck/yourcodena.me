import { Component, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { isStaleChunk, reloadForNewBuild } from './lib/staleBuild';
import { Win } from './ui/Win';
import { Page } from './pages/Page';

/** Catches a crash while rendering, so the visitor gets a way out instead of a blank page. Keyed by path in App, so navigating resets it. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(e: unknown) {
    // A page file missing after a deploy: reload once onto the new build.
    if (!(isStaleChunk(e) && reloadForNewBuild())) console.error(e);
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <Page title="Error">
        <Win title="SOMETHING WENT WRONG">
          <p className="warn" role="alert">This page hit an error. Your saved work is not affected.</p>
          <div className="row">
            <button className="btn" onClick={() => location.reload()}>Reload</button>
            <Link className="btn" to="/">Home</Link>
          </div>
        </Win>
      </Page>
    );
  }
}
