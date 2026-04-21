import React from 'react'

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { error: null, info: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary] Caught error:', error)
    console.error('[ErrorBoundary] Component stack:', info.componentStack)
    this.setState({ info })
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 40, fontFamily: 'monospace', background: '#fff5f5', minHeight: '100vh' }}>
          <h1 style={{ color: '#c00' }}>React Error Caught</h1>
          <h2 style={{ marginTop: 24 }}>Error:</h2>
          <pre style={{ background: '#fff', padding: 16, border: '1px solid #fcc', borderRadius: 4, overflow: 'auto' }}>
            {String(this.state.error?.stack || this.state.error)}
          </pre>
          {this.state.info && (
            <>
              <h2 style={{ marginTop: 24 }}>Component Stack:</h2>
              <pre style={{ background: '#fff', padding: 16, border: '1px solid #fcc', borderRadius: 4, overflow: 'auto' }}>
                {this.state.info.componentStack}
              </pre>
            </>
          )}
        </div>
      )
    }
    return this.props.children
  }
}
