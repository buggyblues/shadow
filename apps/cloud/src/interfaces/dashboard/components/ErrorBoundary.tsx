import { AlertTriangle, RefreshCw } from 'lucide-react'
import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Button } from '@shadowob/ui'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      if (this.props.fallback) return this.props.fallback
      return (
        <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
          <AlertTriangle size={40} className="text-yellow-500 mb-4" />
          <h2 className="text-lg font-semibold mb-2">Something went wrong</h2>
          <p className="text-sm text-gray-400 mb-1 max-w-md">{this.state.error.message}</p>
          <Button
            type="button"
            onClick={() => this.setState({ error: null })}
            variant="ghost"
            className="!mt-4 !flex !items-center !gap-1.5 !text-sm !text-gray-400 hover:!text-white !border !border-gray-700 hover:!border-gray-500 !rounded !px-4 !py-2 !transition-colors"
          >
            <RefreshCw size={14} />
            Retry
          </Button>
        </div>
      )
    }
    return this.props.children
  }
}
