import { Button, GlassPanel, Input, Switch } from '@shadowob/ui'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { fetchApi } from '../lib/api'
import { showToast } from '../lib/toast'
import { OsBackground } from './os-experiment/shell'

type CreatedSpace = {
  id: string
  slug: string | null
}

function spaceRouteKey(space: CreatedSpace) {
  return space.slug?.trim() || space.id
}

export function CreateSpacePage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [isPublic, setIsPublic] = useState(true)

  const createSpace = useMutation({
    mutationFn: (input: { name: string; isPublic: boolean }) =>
      fetchApi<CreatedSpace>('/api/servers', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: async (space) => {
      await queryClient.invalidateQueries({ queryKey: ['servers'] })
      navigate({
        to: '/spaces/$serverIdOrSlug',
        params: { serverIdOrSlug: spaceRouteKey(space) },
        search: { tour: 'space-setup' },
        replace: true,
      })
    },
    onError: (error) => {
      showToast(error instanceof Error ? error.message : t('common.unknown'), 'error')
    },
  })

  const trimmedName = name.trim()

  return (
    <div className="relative h-full min-h-0 w-full overflow-hidden bg-[#071018] text-white">
      <OsBackground />
      <main className="relative z-10 grid h-full place-items-center px-5 py-12">
        <form
          className="w-full max-w-xl"
          onSubmit={(event) => {
            event.preventDefault()
            if (!trimmedName || createSpace.isPending) return
            createSpace.mutate({ name: trimmedName, isPublic })
          }}
        >
          <GlassPanel className="overflow-hidden rounded-[30px] border border-white/12 bg-black/28 p-6 shadow-[0_28px_90px_rgba(0,0,0,0.34)] backdrop-blur-2xl sm:p-8">
            <div className="text-center">
              <p className="text-xs font-black uppercase tracking-[0.32em] text-white/48">
                {t('os.createSpaceEyebrow')}
              </p>
              <h1 className="mt-4 text-3xl font-black leading-tight text-white sm:text-4xl">
                {t('os.createSpaceTitle')}
              </h1>
              <p className="mx-auto mt-4 max-w-md text-sm font-semibold leading-7 text-white/62">
                {t('os.createSpaceSubtitle')}
              </p>
            </div>

            <div className="mt-8 space-y-5">
              <label className="block">
                <span className="mb-2 block text-sm font-black text-white/78">
                  {t('os.createSpaceNameLabel')}
                </span>
                <Input
                  value={name}
                  onChange={(event) => setName(event.currentTarget.value)}
                  placeholder={t('os.createSpaceNamePlaceholder')}
                  className="h-12 w-full rounded-2xl border-white/12 bg-white/10 px-4 text-base font-bold text-white placeholder:text-white/34"
                  autoFocus
                />
              </label>

              <div className="flex items-center justify-between gap-4 rounded-3xl border border-white/10 bg-white/10 p-4">
                <div className="min-w-0">
                  <p className="text-sm font-black text-white">
                    {isPublic ? t('server.publicServer') : t('server.privateServer')}
                  </p>
                  <p className="mt-1 text-xs font-semibold leading-5 text-white/54">
                    {isPublic ? t('server.publicServerDesc') : t('server.privateServerDesc')}
                  </p>
                </div>
                <Switch checked={isPublic} onCheckedChange={setIsPublic} />
              </div>
            </div>

            <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-center">
              <Button
                type="button"
                variant="ghost"
                className="justify-center px-5 font-black"
                onClick={() => navigate({ to: '/discover/browse' })}
              >
                {t('os.createSpaceBack')}
              </Button>
              <Button
                type="submit"
                variant="primary"
                className="justify-center px-7 font-black"
                disabled={!trimmedName || createSpace.isPending}
                loading={createSpace.isPending}
              >
                {t(createSpace.isPending ? 'os.createSpaceCreating' : 'os.createSpaceSubmit')}
              </Button>
            </div>
          </GlassPanel>
        </form>
      </main>
    </div>
  )
}
