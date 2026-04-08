import { Button, cn } from '@shadowob/ui'
import { Check, Dices, Upload, X } from 'lucide-react'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { fetchApi } from '../../lib/api'
import { generateRandomCatConfig, renderCatSvg } from '../../lib/avatar-generator'

interface AvatarEditorProps {
  value?: string
  onChange: (url: string) => void
}

export function AvatarEditor({ value, onChange }: AvatarEditorProps) {
  const { t } = useTranslation()
  const [initialSvg] = useState(() => renderCatSvg(generateRandomCatConfig()))
  const [pendingPreview, setPendingPreview] = useState<string | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleRollDice = () => {
    const config = generateRandomCatConfig()
    setPendingPreview(renderCatSvg(config))
  }

  const handleApplyPreset = () => {
    if (pendingPreview) {
      onChange(pendingPreview)
      setPendingPreview(null)
    }
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setIsUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetchApi<{ url: string }>('/api/media/upload', {
        method: 'POST',
        body: formData,
      })
      if (res?.url) onChange(res.url)
    } catch (err) {
      console.error('Failed to upload avatar', err)
    } finally {
      setIsUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const currentSrc = value || initialSvg
  const hasPending = !!pendingPreview

  return (
    <div className="flex flex-col gap-3">
      {/* Row: current avatar + dice preview (if any) + actions */}
      <div className="flex items-center gap-4">
        {/* Current avatar */}
        <div className="relative shrink-0">
          <div
            className={cn(
              'w-16 h-16 rounded-full overflow-hidden border-2 bg-bg-tertiary/50',
              hasPending ? 'border-border-subtle opacity-60' : 'border-primary/40',
            )}
          >
            <img src={currentSrc} alt="Current" className="w-full h-full object-cover" />
          </div>
          {!hasPending && (
            <span className="absolute -bottom-1 -right-1 text-[9px] font-bold text-primary bg-bg-primary border border-border-subtle rounded px-1">
              {t('avatar.current', '当前')}
            </span>
          )}
        </div>

        {/* Pending preview with apply */}
        {hasPending && (
          <>
            <span className="text-text-muted/40 text-lg">→</span>
            <div className="relative shrink-0">
              <div className="w-16 h-16 rounded-full overflow-hidden border-2 border-primary ring-2 ring-primary/20 bg-bg-tertiary/50">
                <img src={pendingPreview} alt="New" className="w-full h-full object-cover" />
              </div>
              <span className="absolute -bottom-1 -right-1 text-[9px] font-bold text-bg-primary bg-primary rounded px-1">
                {t('avatar.new', '新')}
              </span>
            </div>
            <Button variant="primary" size="sm" onClick={handleApplyPreset} icon={Check}>
              {t('common.apply', '应用')}
            </Button>
            <button
              type="button"
              onClick={() => setPendingPreview(null)}
              className="w-8 h-8 rounded-xl flex items-center justify-center text-text-muted hover:text-danger hover:bg-danger/10 transition"
              title={t('common.cancel', '取消')}
            >
              <X size={16} />
            </button>
          </>
        )}
      </div>

      {/* Action buttons row */}
      <div className="flex items-center gap-2">
        <Button variant="secondary" size="sm" onClick={handleRollDice} icon={Dices}>
          {t('agentMgmt.generateBtn', '一键生成')}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          icon={Upload}
          loading={isUploading}
        >
          {t('agentMgmt.uploadAvatar', '本地上传')}
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileUpload}
          disabled={isUploading}
          className="hidden"
        />
      </div>
    </div>
  )
}
