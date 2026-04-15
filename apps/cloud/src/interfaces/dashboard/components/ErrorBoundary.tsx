import { Button } from '@shadowob/ui'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { Component, type ErrorInfo, type ReactNode } from 'react'
import { DashboardErrorState } from '@/components/DashboardState'
import i18n from '@/i18n'

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
        <div className="px-6 py-16">
          <DashboardErrorState
            icon={AlertTriangle}
            title={i18n.t('errorBoundary.title')}
            description={this.state.error.message}
            action={
              <Button
                type="button"
                onClick={() => this.setState({ error: null })}
                variant="ghost"
                size="sm"
                className="border border-border-subtle text-text-secondary hover:border-border hover:text-text-primary"
              >
                <RefreshCw size={14} />
                {i18n.t('common.retry')}
              </Button>
            }
          />
        </div>
      )
    }
    return this.props.children
  }
}
