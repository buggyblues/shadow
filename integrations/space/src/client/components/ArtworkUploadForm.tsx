import { useMutation } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { ImagePlus } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { SpaceArtwork, SpaceVisibility } from '../../types.js'
import { uploadArtwork } from '../api.js'
import { useInvalidateSpace } from '../hooks.js'
import { splitTags } from '../utils.js'

export function ArtworkUploadForm({
  artworks = [],
  defaultArtworkId,
  mode = 'new',
  compact = false,
  redirectTo = 'preview',
}: {
  artworks?: SpaceArtwork[]
  defaultArtworkId?: string
  mode?: 'new' | 'version'
  compact?: boolean
  redirectTo?: 'preview' | 'manage'
}) {
  const navigate = useNavigate()
  const invalidate = useInvalidateSpace()
  const [file, setFile] = useState<File | null>(null)
  const [uploadMode, setUploadMode] = useState<'new' | 'version'>(mode)
  const [artworkId, setArtworkId] = useState(defaultArtworkId ?? '')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [tags, setTags] = useState('')
  const [visibility, setVisibility] = useState<SpaceVisibility>('public')
  const [versionTitle, setVersionTitle] = useState('初版')
  const lockedVersion = compact && mode === 'version' && !!defaultArtworkId

  useEffect(() => {
    if (!title && file) setTitle(file.name.replace(/\.(html?|zip)$/i, ''))
  }, [file, title])

  const mutation = useMutation({
    mutationFn: () => {
      if (!file) throw new Error('请先选择作品文件')
      return uploadArtwork({
        file,
        artworkId: uploadMode === 'version' ? artworkId : undefined,
        title: title.trim() || file.name.replace(/\.(html?|zip)$/i, ''),
        description,
        tags: splitTags(tags),
        visibility,
        versionTitle,
      })
    },
    onSuccess: async (payload) => {
      await invalidate()
      void navigate({
        to: redirectTo === 'manage' ? '/manage/$artworkId' : '/preview/$artworkId',
        params: { artworkId: payload.artwork.id },
        search: redirectTo === 'manage' ? undefined : { toolbar: 1 },
      })
    },
  })

  return (
    <form
      className={compact ? 'uploadPanel is-compact' : 'uploadPanel'}
      onSubmit={(event) => {
        event.preventDefault()
        mutation.mutate()
      }}
    >
      <label className="dropZone">
        <ImagePlus />
        <strong>{file?.name ?? '选择作品文件或作品包'}</strong>
        <span>它会作为新的作品或新版本保存。</span>
        <input
          type="file"
          accept=".html,.htm,.zip,text/html,application/zip"
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
        />
      </label>
      <div className="twoCols">
        {lockedVersion ? (
          <div className="lockedField">
            <span>保存为</span>
            <strong>新版本</strong>
          </div>
        ) : (
          <label>
            保存为
            <select
              value={uploadMode}
              onChange={(event) => setUploadMode(event.target.value as 'new' | 'version')}
            >
              <option value="new">新作品</option>
              <option value="version">新版本</option>
            </select>
          </label>
        )}
        <label>
          可见范围
          <select
            value={visibility}
            onChange={(event) => setVisibility(event.target.value as SpaceVisibility)}
          >
            <option value="public">公开</option>
            <option value="private">私密</option>
          </select>
        </label>
      </div>
      {uploadMode === 'version' && !lockedVersion ? (
        <label>
          作品
          <select value={artworkId} onChange={(event) => setArtworkId(event.target.value)}>
            <option value="">选择作品</option>
            {artworks.map((artwork) => (
              <option key={artwork.id} value={artwork.id}>
                {artwork.title}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <label>
        标题
        <input value={title} onChange={(event) => setTitle(event.target.value)} />
      </label>
      <label>
        描述
        <textarea value={description} onChange={(event) => setDescription(event.target.value)} />
      </label>
      <label>
        标签
        <input value={tags} onChange={(event) => setTags(event.target.value)} />
      </label>
      <label>
        版本标题
        <input value={versionTitle} onChange={(event) => setVersionTitle(event.target.value)} />
      </label>
      {mutation.error ? <div className="errorText">{mutation.error.message}</div> : null}
      <button type="submit" disabled={!file || mutation.isPending}>
        <ImagePlus />
        {mutation.isPending ? '发布中' : '发布'}
      </button>
    </form>
  )
}
