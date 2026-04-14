import { useQuery } from '@tanstack/react-query'
import { clsx } from 'clsx'
import { Activity, AlertTriangle, CheckCircle, Clock, XCircle } from 'lucide-react'
import { Button, Card, EmptyState } from '@shadowob/ui'
import { api, type DoctorCheck } from '@/lib/api'

function CheckIcon({ status }: { status: DoctorCheck['status'] }) {
  if (status === 'pass') return <CheckCircle size={16} className="text-green-400" />
  if (status === 'warn') return <AlertTriangle size={16} className="text-yellow-400" />
  return <XCircle size={16} className="text-red-400" />
}

export function DoctorPage() {
  const { data, isLoading, error, refetch, dataUpdatedAt } = useQuery({
    queryKey: ['doctor'],
    queryFn: api.doctor,
  })

  const lastChecked = dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString() : null

  return (
    <div className="p-6 max-w-2xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold">System Health</h1>
          <p className="text-sm text-gray-500 mt-0.5">Prerequisites and dependency checks</p>
        </div>
        <div className="flex items-center gap-3">
          {lastChecked && (
            <span className="flex items-center gap-1 text-xs text-gray-600">
              <Clock size={11} />
              {lastChecked}
            </span>
          )}
          <Button type="button" onClick={() => refetch()} variant="ghost" size="sm">
            Re-check
          </Button>
        </div>
      </div>

      {isLoading && (
        <EmptyState
          icon={Activity}
          title="Running checks..."
          description="Checking prerequisites and dependencies"
        />
      )}
      {error && <EmptyState title="Failed to run health checks" description="Please try again." />}

      {data && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            <Card variant="surface">
              <div className="p-4">
                <div className="flex items-center gap-2 text-green-400 text-xs mb-1">
                  <CheckCircle size={13} /> Passing
                </div>
                <p className="text-2xl font-semibold text-green-400">{data.summary.pass}</p>
              </div>
            </Card>
            <Card variant="surface">
              <div className="p-4">
                <div className="flex items-center gap-2 text-yellow-400 text-xs mb-1">
                  <AlertTriangle size={13} /> Warnings
                </div>
                <p className="text-2xl font-semibold text-yellow-400">{data.summary.warn}</p>
              </div>
            </Card>
            <Card variant="surface">
              <div className="p-4">
                <div className="flex items-center gap-2 text-red-400 text-xs mb-1">
                  <XCircle size={13} /> Failed
                </div>
                <p className="text-2xl font-semibold text-red-400">{data.summary.fail}</p>
              </div>
            </Card>
          </div>

          {/* Check list */}
          <Card variant="surface">
            <div className="divide-y divide-gray-800">
              {data.checks.map((check) => (
                <div
                  key={check.name}
                  className={clsx(
                    'flex items-center gap-3 px-4 py-3',
                    check.status === 'fail' && 'bg-red-900/10',
                  )}
                >
                  <CheckIcon status={check.status} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{check.name}</p>
                    <p className="text-xs text-gray-500 truncate">{check.message}</p>
                  </div>
                  <span
                    className={clsx(
                      'text-xs px-2 py-0.5 rounded-full',
                      check.status === 'pass' && 'bg-green-900/50 text-green-400',
                      check.status === 'warn' && 'bg-yellow-900/50 text-yellow-400',
                      check.status === 'fail' && 'bg-red-900/50 text-red-400',
                    )}
                  >
                    {check.status}
                  </span>
                </div>
              ))}
            </div>
          </Card>

          {data.summary.fail === 0 && (
            <div className="mt-4 flex items-center gap-2 text-green-400 text-sm">
              <Activity size={14} />
              All checks passed — system is ready
            </div>
          )}
        </>
      )}
    </div>
  )
}
