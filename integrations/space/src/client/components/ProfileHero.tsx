import type { SpaceArtwork, SpaceProfile } from '../../types.js'
import { compactNumber, titleCaseTag } from '../utils.js'

export function ProfileHero({
  profile,
  artworks,
}: {
  profile?: SpaceProfile
  artworks: SpaceArtwork[]
}) {
  const publicCount = artworks.filter((artwork) => artwork.visibility === 'public').length
  const likes = artworks.reduce((sum, artwork) => sum + artwork.likedBy.length, 0)
  const displayName = profile?.displayName || '未命名创作者'
  const identity = profile?.headline || '还没有身份'
  const intro = profile?.bio || '还没有介绍'
  return (
    <section className="profileHero">
      <div className="portrait">
        {profile?.coverUrl ? (
          <img src={profile.coverUrl} alt="" />
        ) : (
          <span>{displayName.slice(0, 1)}</span>
        )}
      </div>
      <div className="profileCopy">
        <span className="eyebrow">{profile?.handle ? `@${profile.handle}` : '个人空间'}</span>
        <h1 className="profileName">{displayName}</h1>
        <p className="headline">{identity}</p>
        <p className="bio">{intro}</p>
        <div className="profileTags">
          {(profile?.tags ?? []).map((item) => (
            <span key={item}>{titleCaseTag(item)}</span>
          ))}
        </div>
      </div>
      <div className="profileStats" aria-label="作品统计">
        <a className="statLink" href="#portfolio">
          <span>作品</span>
          <strong>{artworks.length}</strong>
        </a>
        <a className="statLink" href="#portfolio">
          <span>公开</span>
          <strong>{publicCount}</strong>
        </a>
        <a className="statLink" href="#responses">
          <span>互动</span>
          <strong>{compactNumber(likes)}</strong>
        </a>
      </div>
    </section>
  )
}
