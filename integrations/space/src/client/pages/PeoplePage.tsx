import { Link } from '@tanstack/react-router'
import { ArrowRight, UserRound } from 'lucide-react'
import { EmptyState } from '../components/EmptyState.js'
import { useArtworks, useProfile } from '../hooks.js'

export function PeoplePage() {
  const profileQuery = useProfile()
  const artworksQuery = useArtworks({ visibility: 'public' })
  const profile = profileQuery.data?.profile
  const artworks = artworksQuery.data?.artworks ?? []
  const hasProfile =
    !!profile &&
    Boolean(
      profile.displayName ||
        profile.handle ||
        profile.headline ||
        profile.bio ||
        profile.coverUrl ||
        artworks.length,
    )

  return (
    <section className="peoplePage">
      <header className="sectionIntro">
        <span>People</span>
        <h1>创作者</h1>
        <p>每个人都有自己的空间，用名字、身份和作品形成一组个人作品集。</p>
      </header>

      {hasProfile && profile ? (
        <div className="peopleList">
          <Link
            className="personRow"
            search={{ q: '', tag: '', visibility: 'all' }}
            to="/"
            aria-label={`Open ${profile.displayName || 'this person'}'s space`}
          >
            <div className="personAvatar">
              {profile.coverUrl ? <img src={profile.coverUrl} alt="" /> : <UserRound aria-hidden />}
            </div>
            <div className="personSummary">
              <span>{profile.handle ? `@${profile.handle}` : '个人空间'}</span>
              <h2>{profile.displayName || '未命名创作者'}</h2>
              <p>{profile.headline || profile.bio || '还没有介绍'}</p>
            </div>
            <div className="personMeta">
              <strong>{artworks.length}</strong>
              <span>公开作品</span>
            </div>
            <ArrowRight />
          </Link>
        </div>
      ) : (
        <EmptyState title="还没有创作者" body="当成员发布个人资料后，他们会出现在这里。" />
      )}
    </section>
  )
}
