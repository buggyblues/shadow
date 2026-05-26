import { useNavigate, useSearch } from '@tanstack/react-router'
import { ChevronDown, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { ArtworkCard } from '../components/ArtworkCard.js'
import { EmptyState } from '../components/EmptyState.js'
import { useArtworks } from '../hooks.js'
import { titleCaseTag } from '../utils.js'

const PRIMARY_TAG_LIMIT = 8

export function HomePage() {
  const navigate = useNavigate()
  const search = useSearch({ strict: false }) as {
    q?: string
    tag?: string
  }
  const [tagTrayOpen, setTagTrayOpen] = useState(false)
  const artworksQuery = useArtworks({
    query: search.q || undefined,
    tag: search.tag || undefined,
    visibility: 'public',
  })
  const artworks = artworksQuery.data?.artworks ?? []
  const tags = useMemo(() => {
    const counts = new Map<string, number>()
    for (const artwork of artworks) {
      for (const tag of artwork.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1)
    }
    return Array.from(counts.entries())
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
  }, [artworks])
  const primaryTags = useMemo(() => {
    const head = tags.slice(0, PRIMARY_TAG_LIMIT)
    if (!search.tag || head.some((item) => item.tag === search.tag)) return head
    const selected = tags.find((item) => item.tag === search.tag)
    return selected ? [...head.slice(0, PRIMARY_TAG_LIMIT - 1), selected] : head
  }, [search.tag, tags])
  const hiddenTags = tags.filter((item) => !primaryTags.some((primary) => primary.tag === item.tag))
  const selectTag = (tag: string) => {
    setTagTrayOpen(false)
    void navigate({
      to: '/',
      search: {
        q: search.q ?? '',
        visibility: 'all',
        tag: search.tag === tag ? '' : tag,
      },
    })
  }
  return (
    <section className="homePage">
      <div className="tagFilterBar">
        <div className="pinTabs" aria-label="作品分类">
          <button
            type="button"
            className={!search.tag ? 'is-active' : ''}
            onClick={() =>
              navigate({ to: '/', search: { q: search.q ?? '', tag: '', visibility: 'all' } })
            }
          >
            全部
          </button>
          {primaryTags.map(({ tag }) => (
            <button
              key={tag}
              type="button"
              className={search.tag === tag ? 'is-active' : ''}
              onClick={() => selectTag(tag)}
            >
              {titleCaseTag(tag)}
            </button>
          ))}
        </div>
        {hiddenTags.length ? (
          <button
            type="button"
            className={tagTrayOpen ? 'moreTagsButton is-open' : 'moreTagsButton'}
            onClick={() => setTagTrayOpen((value) => !value)}
          >
            {tagTrayOpen ? <X /> : <ChevronDown />}
            {tagTrayOpen ? '收起' : `更多 ${hiddenTags.length}`}
          </button>
        ) : null}
      </div>

      {tagTrayOpen ? (
        <div className="tagTray" aria-label="更多标签">
          {hiddenTags.map(({ tag, count }) => (
            <button
              type="button"
              key={tag}
              className={search.tag === tag ? 'is-active' : ''}
              onClick={() => selectTag(tag)}
            >
              <span>{titleCaseTag(tag)}</span>
              <small>{count}</small>
            </button>
          ))}
        </div>
      ) : null}

      {artworks.length ? (
        <section className="pinMasonry" aria-label="作品流">
          {artworks.map((artwork, index) => (
            <ArtworkCard artwork={artwork} index={index} key={artwork.id} />
          ))}
        </section>
      ) : (
        <EmptyState title="还没有公开作品" body="发布第一个作品后，瀑布流会从这里开始生长。" />
      )}
    </section>
  )
}
