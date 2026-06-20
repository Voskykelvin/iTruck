import { Component } from 'react';

class AppErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error, info) {
    console.error('iTruck workspace render failed', error, info);
  }

  render() {
    if (!this.state.failed) return this.props.children;

    return (
      <main className="app-crash-shell">
        <section className="app-crash-card" role="alert">
          <h1>We could not open the workspace.</h1>
          <p>Your saved account data is still intact. Reload to retry with a clean application state.</p>
          <button type="button" className="primary" onClick={() => window.location.reload()}>
            Reload workspace
          </button>
        </section>
      </main>
    );
  }
}

export default AppErrorBoundary;
