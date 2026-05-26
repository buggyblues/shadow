import { ArtworkCard } from '../components/ArtworkCard.js'
import { EmptyState } from '../components/EmptyState.js'
import { useFavorites } from '../hooks.js'

export function FavoritesPage() {
  const favorites = useFavorites()
  const items = favorites.data?.favorites ?? []
  return (
    <section className="pageStack favoritesPage">
      <header className="sectionIntro">
        <span>Saved</span>
        <h1>已保存的作品</h1>
        <p>收藏的作品会留在这里，方便再次查看和回应。</p>
      </header>
      {items.length ? (
        <div className="pinMasonry is-compact">
          {items.map(({ artwork }, index) => (
            <ArtworkCard artwork={artwork} compact index={index} key={artwork.id} />
          ))}
        </div>
      ) : (
        <EmptyState title="还没有收藏" body="收藏的作品会聚合到这里。" />
      )}
    </section>
  )
}
