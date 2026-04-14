import { useQuery } from '@tanstack/react-query'
import { Cpu, Server } from 'lucide-react'
import { Button, Card, EmptyState } from '@shadowob/ui'
import { api, type RuntimeInfo } from '@/lib/api'

export function RuntimesPage() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['runtimes'],
    queryFn: api.runtimes,
  })

  return (
    <div className="p-6 max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold">Runtimes</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Available agent runtimes and their default images
          </p>
        </div>
        <Button type="button" onClick={() => refetch()} variant="ghost" size="sm">
          Refresh
        </Button>
      </div>

      {isLoading && (
        <div className="text-center text-gray-500 text-sm py-8">Loading runtimes...</div>
      )}
      {error && (
        <div className="text-center text-red-400 text-sm py-8">Failed to load runtimes</div>
      )}

      {data && data.length === 0 && (
        <EmptyState
          icon={Server}
          title="No runtimes found"
          description="Check runtime registration in your configuration."
        />
      )}

      {data && data.length > 0 && (
        <>
          <Card variant="surface">
            <div className="p-4 mb-6">
              <div className="flex items-center gap-2 text-gray-400 text-xs mb-1">
                <Cpu size={13} /> Available runtimes
              </div>
              <p className="text-2xl font-semibold">{data.length}</p>
            </div>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {data.map((rt: RuntimeInfo) => (
              <Card key={rt.id} variant="surface">
                <div className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Cpu size={16} className="text-blue-400" />
                    <h3 className="text-sm font-semibold">{rt.name}</h3>
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-gray-500">ID:</span>
                      <span className="font-mono text-gray-400">{rt.id}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-gray-500">Image:</span>
                      <span className="font-mono text-gray-400 truncate">{rt.defaultImage}</span>
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
