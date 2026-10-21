import React from 'react'

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('App crash:', error, info)
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 40, color: '#e57373', background: '#0f1114', minHeight: '100vh', fontFamily: 'monospace' }}>
          <h2 style={{ color: '#ffd54f' }}>App crashed — but here's why:</h2>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>{String(this.state.error)}</pre>
          <button
            onClick={() => { this.setState({ error: null }); localStorage.removeItem('session') }}
            style={{ marginTop: 20, padding: '10px 20px', background: '#2a2f38', color: '#4fc3f7', border: '1px solid #4fc3f7', borderRadius: 6, cursor: 'pointer' }}
          >
            Reset session & retry (clears saved curves)
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
