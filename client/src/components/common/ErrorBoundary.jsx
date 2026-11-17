import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, showDetails: false };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  handleReload = () => {
    window.location.reload();
  };

  handleReset = () => {
    this.setState({ hasError: false, error: null, showDetails: false });
  };

  handleGoDashboard = () => {
    try {
      window.location.hash = '#dashboard';
      sessionStorage.setItem('nandini_current_tab', 'dashboard');
    } catch {}
    this.setState({ hasError: false, error: null, showDetails: false });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      const errorMsg = this.state.error?.message || String(this.state.error || 'An unexpected error occurred');
      const errorStack = this.state.error?.stack || '';

      return (
        <div style={{
          padding: '32px 24px',
          margin: '30px auto',
          maxWidth: '680px',
          textAlign: 'center',
          background: '#ffffff',
          borderRadius: '16px',
          boxShadow: '0 8px 30px rgba(0,0,0,0.1)',
          border: '1.5px solid #fee2e2'
        }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '10px' }}>⚠️</div>
          <h2 style={{ fontSize: '1.35rem', fontWeight: '800', color: '#991b1b', marginBottom: '8px' }}>
            Something went wrong
          </h2>
          <p style={{ fontSize: '0.9rem', color: '#64748b', marginBottom: '16px', lineHeight: '1.5' }}>
            An unexpected error occurred while displaying this content.
          </p>

          {errorMsg && (
            <div style={{
              background: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: '8px',
              padding: '10px 14px',
              color: '#991b1b',
              fontSize: '0.825rem',
              fontWeight: '600',
              fontFamily: 'monospace',
              textAlign: 'left',
              marginBottom: '18px',
              wordBreak: 'break-word'
            }}>
              {errorMsg}
            </div>
          )}

          <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap', marginBottom: '14px' }}>
            <button
              onClick={this.handleReset}
              className="btn btn-outline btn-sm"
              style={{ fontWeight: '700' }}
            >
              Try Again
            </button>
            <button
              onClick={this.handleGoDashboard}
              className="btn btn-outline btn-sm"
              style={{ fontWeight: '700', color: '#0284c7', borderColor: '#7dd3fc' }}
            >
              Go to Dashboard
            </button>
            <button
              onClick={this.handleReload}
              className="btn btn-primary btn-sm"
              style={{ fontWeight: '700' }}
            >
              Reload Page
            </button>
          </div>

          {errorStack && (
            <div style={{ marginTop: '12px', textAlign: 'left' }}>
              <button
                type="button"
                onClick={() => this.setState(prev => ({ showDetails: !prev.showDetails }))}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#64748b',
                  fontSize: '0.78rem',
                  cursor: 'pointer',
                  textDecoration: 'underline',
                  padding: 0
                }}
              >
                {this.state.showDetails ? 'Hide technical details' : 'Show technical details'}
              </button>
              {this.state.showDetails && (
                <pre style={{
                  marginTop: '8px',
                  background: '#0f172a',
                  color: '#f8fafc',
                  padding: '12px',
                  borderRadius: '6px',
                  fontSize: '0.72rem',
                  maxHeight: '220px',
                  overflow: 'auto',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word'
                }}>
                  {errorStack}
                </pre>
              )}
            </div>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}
