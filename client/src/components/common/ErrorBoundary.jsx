import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
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
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          padding: '30px',
          margin: '20px auto',
          maxWidth: '600px',
          textAlign: 'center',
          background: '#ffffff',
          borderRadius: '12px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
          border: '1px solid #fee2e2'
        }}>
          <div style={{ fontSize: '2rem', marginBottom: '12px' }}>⚠️</div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: '800', color: '#991b1b', marginBottom: '8px' }}>
            Something went wrong
          </h2>
          <p style={{ fontSize: '0.875rem', color: '#64748b', marginBottom: '20px', lineHeight: '1.5' }}>
            An unexpected error occurred while displaying this content.
          </p>
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
            <button
              onClick={this.handleReset}
              className="btn btn-outline btn-sm"
              style={{ fontWeight: '700' }}
            >
              Try Again
            </button>
            <button
              onClick={this.handleReload}
              className="btn btn-primary btn-sm"
              style={{ fontWeight: '700' }}
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
