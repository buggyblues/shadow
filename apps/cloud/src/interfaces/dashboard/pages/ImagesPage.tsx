import { useQuery } from '@tanstack/react-query'
import { clsx } from 'clsx'
import { Container, FileCode, Package } from 'lucide-react'
import { Button, Card, EmptyState } from '@shadowob/ui'
import { api, type ImageInfo } from '@/lib/api'

export function ImagesPage() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['images'],
    queryFn: api.images,
  })

  const withDockerfile = data?.filter((i) => i.hasDockerfile).length ?? 0

  return (
    <div className="p-6 max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold">Images</h1>
          <p className="text-sm text-gray-500 mt-0.5">Available container images for agents</p>
        </div>
        <Button type="button" onClick={() => refetch()} variant="ghost" size="sm">
          Refresh
        </Button>
      </div>

      {isLoading && <div className="text-center text-gray-500 text-sm py-8">Loading images...</div>}
      {error && <div className="text-center text-red-400 text-sm py-8">Failed to load images</div>}

      {data && data.length === 0 && (
        <EmptyState
          icon={Package}
          title="No images found"
          description="Images are defined in your templates and configuration"
        />
      )}

      {data && data.length > 0 && (
        <>
          <div className="grid grid-cols-2 gap-4 mb-6">
            <Card variant="surface">
              <div className="p-4">
                <div className="flex items-center gap-2 text-gray-400 text-xs mb-1">
                  <Container size={13} /> Total images
                </div>
                <p className="text-2xl font-semibold">{data.length}</p>
              </div>
            </Card>
            <Card variant="surface">
              <div className="p-4">
                <div className="flex items-center gap-2 text-blue-400 text-xs mb-1">
                  <FileCode size={13} /> With Dockerfile
                </div>
                <p className="text-2xl font-semibold text-blue-400">{withDockerfile}</p>
              </div>
            </Card>
          </div>

          <Card variant="surface">
            <div className="divide-y divide-gray-800">
              {data.map((img: ImageInfo) => (
                <div key={img.name} className="flex items-center gap-3 px-4 py-3">
                  <Container size={16} className="text-gray-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-mono">{img.name}</p>
                  </div>
                  <span
                    className={clsx(
                      'text-xs px-2 py-0.5 rounded-full flex items-center gap-1',
                      img.hasDockerfile
                        ? 'bg-blue-900/50 text-blue-400'
                        : 'bg-gray-800 text-gray-500',
                    )}
                  >
                    <FileCode size={10} />
                    {img.hasDockerfile ? 'Dockerfile' : 'No Dockerfile'}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        </>
      )}
    </div>
  )
}
