import { ArtworkUploadForm } from '../components/ArtworkUploadForm.js'
import { useArtworks } from '../hooks.js'

export function UploadPage() {
  const artworks = useArtworks()
  return (
    <section className="uploadPage">
      <div className="sectionIntro">
        <span>Create</span>
        <h1>创建作品</h1>
        <p>上传你的作品，补上封面、标题和标签，它会进入个人作品集。</p>
      </div>
      <div className="uploadLayout">
        <ArtworkUploadForm artworks={artworks.data?.artworks ?? []} />
        <aside className="uploadAside">
          <span>Tips</span>
          <strong>让封面先说话。</strong>
          <p>清楚的封面和短标题会让作品在瀑布流里更容易被保存。</p>
        </aside>
      </div>
    </section>
  )
}
