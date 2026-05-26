import { useMutation } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Eye, Lock, Palette, PenLine, Settings2, Sparkles } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { SpaceArtwork } from '../../types.js'
import { updateProfile } from '../api.js'
import { ArtworkCard } from '../components/ArtworkCard.js'
import { CoverUpload } from '../components/CoverUpload.js'
import { EmptyState } from '../components/EmptyState.js'
import { Modal } from '../components/Modal.js'
import { useArtworks, useInvalidateSpace, useProfile } from '../hooks.js'
import { compactNumber, currentVersion, previewUrl, splitTags, titleCaseTag } from '../utils.js'

type ProfileTab = 'works' | 'collections'

export function ProfilePage() {
  const profileQuery = useProfile()
  const artworksQuery = useArtworks({ visibility: 'all' })
  const invalidate = useInvalidateSpace()
  const profile = profileQuery.data?.profile
  const artworks = artworksQuery.data?.artworks ?? []
  const publicCount = artworks.filter((artwork) => artwork.visibility === 'public').length
  const reactionCount = artworks.reduce(
    (total, artwork) => total + artwork.likedBy.length + artwork.comments.length,
    0,
  )

  const [editing, setEditing] = useState(false)
  const [tab, setTab] = useState<ProfileTab>('collections')
  const [privateOnly, setPrivateOnly] = useState(false)
  const [profileShareState, setProfileShareState] = useState<'idle' | 'copied'>('idle')
  const [displayName, setDisplayName] = useState(profile?.displayName ?? '')
  const [handle, setHandle] = useState(profile?.handle ?? '')
  const [headline, setHeadline] = useState(profile?.headline ?? '')
  const [bio, setBio] = useState(profile?.bio ?? '')
  const [tags, setTags] = useState((profile?.tags ?? []).join(', '))
  const [customCss, setCustomCss] = useState(profile?.customCss ?? '')
  const mutation = useMutation({
    mutationFn: () =>
      updateProfile({
        patch: {
          displayName,
          handle,
          headline,
          bio,
          tags: splitTags(tags),
          customCss,
        },
      }),
    onSuccess: () => {
      setEditing(false)
      void invalidate()
    },
  })

  useEffect(() => {
    if (!profile) return
    setDisplayName(profile.displayName)
    setHandle(profile.handle)
    setHeadline(profile.headline)
    setBio(profile.bio)
    setTags(profile.tags.join(', '))
    setCustomCss(profile.customCss)
  }, [profile])

  const visibleArtworks = privateOnly
    ? artworks.filter((artwork) => artwork.visibility === 'private')
    : artworks
  const boards = useMemo(() => buildBoards(visibleArtworks), [visibleArtworks])

  if (!profile && profileQuery.isLoading) {
    return <EmptyState title="正在打开个人资料" body="你的作品集马上就绪。" />
  }

  return (
    <section className="profilePage">
      <header className="boardsHero">
        <div className="boardsTitle">
          <h1>你的作品</h1>
          <nav className="profileTabs" aria-label="个人内容">
            <button
              type="button"
              className={tab === 'works' ? 'is-active' : ''}
              onClick={() => setTab('works')}
            >
              作品
            </button>
            <button
              type="button"
              className={tab === 'collections' ? 'is-active' : ''}
              onClick={() => setTab('collections')}
            >
              作品集
            </button>
          </nav>
        </div>
        <div className="profileSummary">
          <div className="profileMiniAvatar">
            {profile?.coverUrl ? (
              <img src={profile.coverUrl} alt="" />
            ) : (
              (profile?.displayName || 'S').slice(0, 1).toUpperCase()
            )}
          </div>
          <div>
            <strong>{profile?.displayName || '未命名创作者'}</strong>
            <span>
              {profile?.handle ? `@${profile.handle}` : `${publicCount} 个公开作品`} ·{' '}
              {compactNumber(reactionCount)} 互动
            </span>
          </div>
          <button
            type="button"
            className="shareButton"
            onClick={async () => {
              await navigator.clipboard?.writeText(window.location.href)
              setProfileShareState('copied')
              window.setTimeout(() => setProfileShareState('idle'), 1400)
            }}
          >
            {profileShareState === 'copied' ? '已复制链接' : '分享个人资料'}
          </button>
          <button
            type="button"
            className="profileEditButton"
            aria-label="编辑资料"
            onClick={() => setEditing(true)}
          >
            <Settings2 />
          </button>
        </div>
      </header>

      <div className="profileToolbar">
        <button
          type="button"
          className={privateOnly ? 'softChip is-active' : 'softChip'}
          onClick={() => setPrivateOnly((value) => !value)}
        >
          私密
        </button>
        <Link className="createFloating" to="/upload">
          创建
        </Link>
      </div>

      {editing ? (
        <Modal title="编辑个人资料" onClose={() => setEditing(false)}>
          <form
            className="settingsPanel profileSettings"
            onSubmit={(event) => {
              event.preventDefault()
              mutation.mutate()
            }}
          >
            <div className="panelHeader">
              <div>
                <span>Profile</span>
                <h2>公开展示</h2>
              </div>
              <PenLine />
            </div>
            <div className="twoCols">
              <label>
                名字
                <input
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                />
              </label>
              <label>
                代号
                <input value={handle} onChange={(event) => setHandle(event.target.value)} />
              </label>
            </div>
            <label>
              身份
              <input value={headline} onChange={(event) => setHeadline(event.target.value)} />
            </label>
            <label>
              介绍
              <textarea value={bio} onChange={(event) => setBio(event.target.value)} />
            </label>
            <label>
              标签
              <input value={tags} onChange={(event) => setTags(event.target.value)} />
            </label>
            <CoverUpload targetType="profile" label="更换头像或封面" />
            <details className="advancedSettings">
              <summary>
                <Palette />
                自定义样式
              </summary>
              <label>
                样式
                <textarea
                  className="codeTextarea"
                  value={customCss}
                  onChange={(event) => setCustomCss(event.target.value)}
                />
              </label>
            </details>
            {mutation.error ? <div className="errorText">{mutation.error.message}</div> : null}
            <button type="submit" disabled={mutation.isPending}>
              <Sparkles />
              {mutation.isPending ? '保存中' : '保存'}
            </button>
          </form>
        </Modal>
      ) : null}

      <section id="profile-content">
        {tab === 'works' ? (
          visibleArtworks.length ? (
            <div className="pinMasonry">
              {visibleArtworks.map((artwork, index) => (
                <ArtworkCard artwork={artwork} index={index} key={artwork.id} />
              ))}
            </div>
          ) : (
            <EmptyState title="还没有作品" body="创建第一个作品后，它会出现在这里。" />
          )
        ) : null}

        {tab === 'collections' ? (
          <div className="boardGrid">
            {boards.map((board) => (
              <BoardCard board={board} key={board.title} />
            ))}
            <Link className="createBoardCard" to="/upload">
              <span>创建</span>
            </Link>
          </div>
        ) : null}
      </section>
    </section>
  )
}

function buildBoards(artworks: SpaceArtwork[]) {
  const grouped = new Map<string, SpaceArtwork[]>()
  for (const artwork of artworks) {
    const boardName = titleCaseTag(artwork.tags[0] || '未分类')
    grouped.set(boardName, [...(grouped.get(boardName) ?? []), artwork])
  }
  return Array.from(grouped.entries()).map(([title, items]) => ({
    title,
    items,
    privateCount: items.filter((item) => item.visibility === 'private').length,
    count: items.length,
  }))
}

function BoardCard({
  board,
}: {
  board: { title: string; items: SpaceArtwork[]; count: number; privateCount: number }
}) {
  return (
    <article className="boardCard">
      <div className="boardPreview">
        {board.privateCount ? (
          <span className="boardLock">
            <Lock />
          </span>
        ) : null}
        {board.items.slice(0, 3).map((artwork, index) => (
          <BoardThumb artwork={artwork} index={index} key={artwork.id} />
        ))}
      </div>
      <h2>{board.title}</h2>
      <p>
        {board.count} 件作品{board.privateCount ? ` · ${board.privateCount} 私密` : ''}
      </p>
    </article>
  )
}

function BoardThumb({ artwork, index }: { artwork: SpaceArtwork; index: number }) {
  const version = currentVersion(artwork)
  return (
    <Link
      className={`boardThumb boardThumb-${index + 1}`}
      params={{ artworkId: artwork.id }}
      search={{ toolbar: 1 }}
      to="/preview/$artworkId"
      aria-label={`打开作品 ${artwork.title || '未命名作品'}`}
    >
      {artwork.coverUrl ? (
        <img src={artwork.coverUrl} alt="" />
      ) : version ? (
        <iframe title={artwork.title} src={previewUrl(artwork, version)} />
      ) : (
        <Eye />
      )}
    </Link>
  )
}
