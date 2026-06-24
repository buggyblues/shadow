import { Button, GlassPanel } from '@shadowob/ui'
import { useNavigate, useParams } from '@tanstack/react-router'
import { ArrowLeft, Users } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { MemberList } from '../components/member/member-list'

export function ServerMembersPageRoute() {
  const { t } = useTranslation()
  const { serverSlug } = useParams({ strict: false }) as { serverSlug?: string }
  const navigate = useNavigate()

  return (
    <GlassPanel className="flex h-full min-w-0 flex-1 flex-col overflow-hidden">
      <div className="desktop-drag-titlebar app-header sticky top-0 z-20 flex shrink-0 items-center gap-3 border-b border-border-subtle/80 px-4">
        <Button
          variant="ghost"
          size="icon"
          icon={ArrowLeft}
          onClick={() =>
            navigate({
              to: '/servers/$serverSlug',
              params: { serverSlug: serverSlug ?? '' },
            })
          }
          className="-ml-2"
        />
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
          <Users size={20} className="text-primary" />
        </span>
        <div className="min-w-0">
          <h2 className="truncate text-base font-black tracking-tight text-text-primary">
            {t('member.members')}
          </h2>
          <p className="truncate text-xs font-semibold text-text-muted">
            {t('server.membersPanelSubtitle')}
          </p>
        </div>
      </div>
      <MemberList serverId={serverSlug ?? null} channelId={null} embedded variant="cards" />
    </GlassPanel>
  )
}
