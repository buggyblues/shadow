import { Link } from '@tanstack/react-router'
import { Eye, Heart, Lock, MessageCircle } from 'lucide-react'
import type { SpaceArtwork } from '../../types.js'
import { compactNumber, currentVersion, previewUrl, versionDisplayTitle } from '../utils.js'

const PIN_SHAPES = ['is-portrait', 'is-tall', 'is-square', 'is-large', 'is-soft'] as const

export function ArtworkCard({
  artwork,
  index,
  compact = false,
}: {
  artwork: SpaceArtwork
  index: number
  compact?: boolean
}) {
  const version = currentVersion(artwork)
  const shape = PIN_SHAPES[index % PIN_SHAPES.length]
  return (
    <Link
      className={compact ? `artworkTile is-compact ${shape}` : `artworkTile ${shape}`}
      to="/preview/$artworkId"
      params={{ artworkId: artwork.id }}
      search={{ toolbar: 1 }}
      aria-label={`打开作品 ${artwork.title || '未命名作品'}`}
    >
      <div className="cardPreview">
        {artwork.coverUrl ? (
          <img src={artwork.coverUrl} alt="" />
        ) : version ? (
          <iframe title={artwork.title} src={previewUrl(artwork, version)} />
        ) : null}
        {artwork.visibility === 'private' ? (
          <span className="privatePin" aria-label="私密">
            <Lock />
          </span>
        ) : null}
      </div>
      <div className="cardMeta">
        <div className="pinTitleRow">
          <h3>{artwork.title || '未命名作品'}</h3>
        </div>
        <p>{artwork.description || versionDisplayTitle(version) || '还没有描述'}</p>
        <div className="tileSignals" aria-label="作品数据">
          <span>
            <Eye /> {compactNumber(artwork.viewCount)}
          </span>
          <span>
            <Heart /> {artwork.likedBy.length}
          </span>
          <span>
            <MessageCircle /> {artwork.comments.length}
          </span>
        </div>
      </div>
    </Link>
  )
}
