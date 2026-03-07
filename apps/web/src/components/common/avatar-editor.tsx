import { Dices, Upload } from 'lucide-react'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { fetchApi } from '../../lib/api'
import { type CatConfig, generateRandomCatConfig, renderCatSvg } from '../../lib/avatar-generator'

interface AvatarEditorProps {
  value?: string
  onChange: (url: string) => void
}

export function AvatarEditor({ value, onChange }: AvatarEditorProps) {
  const { t } = useTranslation()
  const [tab, setTab] = useState<'preset' | 'upload'>('preset')
  const [catConfig, setCatConfig] = useState<CatConfig>(() => generateRandomCatConfig())
  const [isUploading, setIsUploading] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleRollDice = () => {
    const config = generateRandomCatConfig()
    setCatConfig(config)
    onChange(renderCatSvg(config))
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

      if (res && res.url) {
        onChange(res.url)
      }
    } catch (err) {
      console.error('Failed to upload avatar', err)
    } finally {
      setIsUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-4">
        {/* Current Avatar Display */}
        <div className="w-20 h-20 rounded-[12px] border-4 border-[#1e1f22] bg-[#2b2d31] overflow-hidden flex items-center justify-center shrink-0">
          {value ? (
            <img src={value} alt="Avatar" className="w-full h-full object-cover" />
          ) : (
            <img src={renderCatSvg(catConfig)} alt="Cat" className="w-full h-full object-cover" />
          )}
        </div>

        <div className="flex flex-col gap-2 flex-1">
          <div className="flex bg-[#1e1f22] p-1 rounded-lg self-start">
            <button
              type="button"
              onClick={() => setTab('preset')}
              className={`px-4 py-1.5 rounded-[5px] text-[13px] font-bold transition flex items-center gap-1 ${
                tab === 'preset'
                  ? 'bg-[#313338] text-[#f2f3f5] shadow-sm'
                  : 'text-[#949ba4] hover:text-[#dbdee1] hover:bg-[#2b2d31]'
              }`}
            >
              <Dices size={16} />
              {t('agentMgmt.presetAvatar')}
            </button>
            <button
              type="button"
              onClick={() => setTab('upload')}
              className={`px-4 py-1.5 rounded-[5px] text-[13px] font-bold transition flex items-center gap-1 ${
                tab === 'upload'
                  ? 'bg-[#313338] text-[#f2f3f5] shadow-sm'
                  : 'text-[#949ba4] hover:text-[#dbdee1] hover:bg-[#2b2d31]'
              }`}
            >
              <Upload size={16} />
              {t('agentMgmt.uploadAvatar')}
            </button>
          </div>
          <p className="text-[12px] text-[#949ba4]">{t('agentMgmt.avatarDesc')}</p>
        </div>
      </div>

      {tab === 'preset' && (
        <div className="bg-[#2b2d31] border border-[#1e1f22] rounded-[8px] p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-[48px] h-[48px] rounded-[10px] bg-[#1e1f22] border-[2px] border-transparent overflow-hidden">
              <img
                src={renderCatSvg(catConfig)}
                alt="Preview"
                className="w-full h-full object-contain"
              />
            </div>
            <div>
              <h4 className="text-[14px] font-bold text-[#f2f3f5]">{t('agentMgmt.diceCat')}</h4>
              <p className="text-[12px] text-[#949ba4]">{t('agentMgmt.diceCatDesc')}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleRollDice}
            className="flex items-center gap-2 px-4 py-1.5 bg-[#5865F2] hover:bg-[#4752C4] text-white text-[14px] font-bold rounded-[3px] transition"
          >
            {t('agentMgmt.generateBtn')}
          </button>
        </div>
      )}

      {tab === 'upload' && (
        <div className="bg-[#1e1f22] border-2 border-dashed border-[#383a40] hover:border-[#5865F2] rounded-[8px] p-6 flex flex-col items-center justify-center gap-2 transition-colors relative cursor-pointer group">
          <div className="w-10 h-10 rounded-full bg-[#2b2d31] group-hover:bg-[#5865F2] flex items-center justify-center transition-colors">
            <Upload size={20} className="text-[#dbdee1] group-hover:text-white" />
          </div>
          <p className="text-[14px] text-[#dbdee1] font-bold mt-2">
            {isUploading ? t('common.uploading') : t('agentMgmt.clickToUpload')}
          </p>
          <p className="text-[12px] text-[#949ba4]">{t('agentMgmt.uploadTip')}</p>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileUpload}
            disabled={isUploading}
            className="absolute inset-0 opacity-0 cursor-pointer w-full h-full disabled:cursor-not-allowed"
          />
        </div>
      )}
    </div>
  )
}
