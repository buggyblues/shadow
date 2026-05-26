import { useMutation } from '@tanstack/react-query'
import { Link, useParams } from '@tanstack/react-router'
import {
  Bookmark,
  Eye,
  Heart,
  ImagePlus,
  MessageCircle,
  RotateCcw,
  Settings2,
  Wand2,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import type { SpaceVisibility } from '../../types.js'
import { addComment, rollbackVersion, updateArtwork } from '../api.js'
import { ArtworkUploadForm } from '../components/ArtworkUploadForm.js'
import { CoverUpload } from '../components/CoverUpload.js'
import { EmptyState } from '../components/EmptyState.js'
import { useArtwork, useArtworks, useInvalidateSpace } from '../hooks.js'
import {
  compactNumber,
  currentVersion,
  previewUrl,
  splitTags,
  versionDisplayTitle,
} from '../utils.js'

export function ArtworkManagePage() {
  const params = useParams({ strict: false }) as { artworkId?: string }
  const artworkQuery = useArtwork(params.artworkId)
  const allArtworks = useArtworks()
  const invalidate = useInvalidateSpace()
  const artwork = artworkQuery.data?.artwork
  const version = currentVersion(artwork)
  const [comment, setComment] = useState('')
  const [title, setTitle] = useState(artwork?.title ?? '')
  const [description, setDescription] = useState(artwork?.description ?? '')
  const [tags, setTags] = useState((artwork?.tags ?? []).join(', '))
  const [visibility, setVisibility] = useState<SpaceVisibility>(artwork?.visibility ?? 'public')

  const patch = useMutation({
    mutationFn: () =>
      artwork
        ? updateArtwork({
            artworkId: artwork.id,
            title,
            description,
            tags: splitTags(tags),
            visibility,
          })
        : Promise.reject(new Error('作品未加载')),
    onSuccess: () => {
      void invalidate()
    },
  })
  const sendComment = useMutation({
    mutationFn: () =>
      artwork
        ? addComment({ artworkId: artwork.id, body: comment })
        : Promise.reject(new Error('作品未加载')),
    onSuccess: () => {
      setComment('')
      void invalidate()
    },
  })
  const rollback = useMutation({
    mutationFn: (versionId: string) =>
      artwork
        ? rollbackVersion({ artworkId: artwork.id, versionId })
        : Promise.reject(new Error('作品未加载')),
    onSuccess: invalidate,
  })

  useEffect(() => {
    if (!artwork) return
    setTitle(artwork.title)
    setDescription(artwork.description)
    setTags(artwork.tags.join(', '))
    setVisibility(artwork.visibility)
  }, [artwork])

  if (!params.artworkId) {
    return <EmptyState title="没有找到作品" body="请从个人页进入管理。" />
  }
  if (!artwork && artworkQuery.isLoading) {
    return <EmptyState title="正在打开作品" body="正在准备管理视图。" />
  }
  if (!artwork) {
    return <EmptyState title="没有找到作品" body="请从个人页进入管理。" />
  }

  return (
    <section className="managePage">
      <div className="manageHeader">
        <div>
          <Link to="/profile">个人页</Link>
          <h1>{artwork.title || '未命名作品'}</h1>
          <p>管理封面、说明、评论、版本和回退点。</p>
        </div>
        <Link
          className="primaryLink"
          to="/preview/$artworkId"
          params={{ artworkId: artwork.id }}
          search={{ toolbar: 1 }}
        >
          <Eye />
          全屏预览
        </Link>
      </div>

      <div className="manageGrid">
        <section className="managePreviewPanel">
          <div className="panelHeader">
            <div>
              <span>当前版本</span>
              <h2>预览</h2>
            </div>
            <span className="versionBadge">版本 {version?.number ?? 0}</span>
          </div>
          <div className="managedPreview">
            {artwork.coverUrl ? (
              <img src={artwork.coverUrl} alt="" />
            ) : version ? (
              <iframe title={artwork.title} src={previewUrl(artwork, version)} />
            ) : null}
          </div>
          <CoverUpload targetType="artwork" artworkId={artwork.id} label="更换封面" />
          <div className="signalGrid">
            <span>
              <Eye /> {compactNumber(artwork.viewCount)}
            </span>
            <span>
              <Heart /> {artwork.likedBy.length}
            </span>
            <span>
              <Bookmark /> {artwork.favoritedBy.length}
            </span>
            <span>
              <Wand2 /> {artwork.remixCount}
            </span>
          </div>
        </section>

        <form
          className="settingsPanel"
          onSubmit={(event) => {
            event.preventDefault()
            patch.mutate()
          }}
        >
          <div className="panelHeader">
            <div>
              <span>展示信息</span>
              <h2>作品详情</h2>
            </div>
            <Settings2 />
          </div>
          <label>
            标题
            <input value={title} onChange={(event) => setTitle(event.target.value)} />
          </label>
          <label>
            说明
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </label>
          <div className="twoCols">
            <label>
              标签
              <input value={tags} onChange={(event) => setTags(event.target.value)} />
            </label>
            <label>
              可见性
              <select
                value={visibility}
                onChange={(event) => setVisibility(event.target.value as SpaceVisibility)}
              >
                <option value="public">公开</option>
                <option value="private">私密</option>
              </select>
            </label>
          </div>
          {patch.error ? <div className="errorText">{patch.error.message}</div> : null}
          <button type="submit" disabled={patch.isPending}>
            <Settings2 />
            保存
          </button>
        </form>

        <section className="settingsPanel">
          <div className="panelHeader">
            <div>
              <span>版本</span>
              <h2>添加新版本</h2>
            </div>
            <ImagePlus />
          </div>
          <ArtworkUploadForm
            artworks={allArtworks.data?.artworks ?? []}
            defaultArtworkId={artwork.id}
            mode="version"
            compact
            redirectTo="manage"
          />
        </section>

        <section className="settingsPanel">
          <div className="panelHeader">
            <div>
              <span>历史</span>
              <h2>版本</h2>
            </div>
            <RotateCcw />
          </div>
          <div className="versionList">
            {artwork.versions
              .slice()
              .reverse()
              .map((item) => (
                <article
                  className={
                    item.id === artwork.currentVersionId ? 'versionItem is-current' : 'versionItem'
                  }
                  key={item.id}
                >
                  <div>
                    <strong>版本 {item.number}</strong>
                    <span>{versionDisplayTitle(item)}</span>
                  </div>
                  <button
                    type="button"
                    aria-label={`回退到版本 ${item.number}`}
                    disabled={item.id === artwork.currentVersionId || rollback.isPending}
                    onClick={() => rollback.mutate(item.id)}
                  >
                    <RotateCcw />
                  </button>
                </article>
              ))}
          </div>
        </section>

        <section className="settingsPanel">
          <div className="panelHeader">
            <div>
              <span>互动</span>
              <h2>评论</h2>
            </div>
            <MessageCircle />
          </div>
          <div className="comments">
            {artwork.comments.length ? (
              artwork.comments.map((item) => (
                <article className="commentItem" key={item.id}>
                  <div className="miniAvatar">{item.author.displayName.slice(0, 1)}</div>
                  <div>
                    <strong>{item.author.displayName}</strong>
                    <p>{item.body}</p>
                  </div>
                </article>
              ))
            ) : (
              <p className="mutedLine">还没有评论。</p>
            )}
          </div>
          <form
            className="inlineComposer"
            onSubmit={(event) => {
              event.preventDefault()
              if (comment.trim()) sendComment.mutate()
            }}
          >
            <MessageCircle aria-hidden />
            <input
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              placeholder="写下评论..."
            />
            <button type="submit" disabled={!comment.trim() || sendComment.isPending}>
              发送
            </button>
          </form>
        </section>
      </div>
    </section>
  )
}
