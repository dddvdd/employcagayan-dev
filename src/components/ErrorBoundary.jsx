import React from 'react'

import ThemeToggle from './ThemeToggle.jsx'

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('Uncaught error caught by ErrorBoundary:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="relative mx-auto grid min-h-screen max-w-xl place-items-center bg-slate-50 px-6 text-center dark:bg-slate-950">
          <div className="absolute right-4 top-4"><ThemeToggle /></div>
          <section className="rounded-2xl bg-white p-8 shadow-sm ring-1 ring-slate-200">
            <h1 className="text-2xl font-bold text-red-600">Something went wrong</h1>
            <p className="mt-3 text-slate-600">
              An unexpected error occurred: {this.state.error?.message || 'Unknown error'}
            </p>
            <button
              onClick={() => {
                this.setState({ hasError: false, error: null })
                window.location.reload()
              }}
              className="mt-6 rounded-lg bg-blue-700 px-4 py-2 font-semibold text-white hover:bg-blue-800"
            >
              Reload Page
            </button>
          </section>
        </main>
      )
    }

    return this.props.children
  }
}
