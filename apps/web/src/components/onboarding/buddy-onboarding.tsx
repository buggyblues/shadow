import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import {
  Bot,
  ChevronRight,
  Download,
  MessageCircle,
  Plus,
  Rocket,
  Smartphone,
  Terminal,
  X,
} from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { fetchApi } from '../../lib/api'
import { useAuthStore } from '../../stores/auth.store'

interface BuddyOnboardingProps {
  serverId: string
  onClose: () => void
}

type Step = 'intro' | 'method' | 'desktop' | 'command' | 'add-to-channel'

export function BuddyOnboarding({ serverId, onClose }: BuddyOnboardingProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [step, setStep] = useState<Step>('intro')

  // Check if user has any buddies
  const { data: buddies = [] } = useQuery({
    queryKey: ['buddies'],
    queryFn: () =>
      fetchApi<Array<{ id: string; name: string }>>('/api/buddies'),
  })

  const hasBuddies = buddies.length > 0

  // If user already has buddies, skip to add-to-channel
  if (hasBuddies && step === 'intro') {
    // Could auto-advance, but let user choose
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="relative w-full max-w-lg bg-bg-secondary rounded-2xl shadow-2xl overflow-hidden">
        {/* Close button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-text-muted hover:text-text-primary hover:bg-bg-modifier-hover rounded-lg transition z-10"
        >
          <X size={20} />
        </button>

        {/* Step: Intro */}
        {step === 'intro' && (
          <div className="p-8">
            <div className="text-center mb-8">
              <div className="w-20 h-20 mx-auto mb-6 relative">
                <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-amber-400 via-orange-500 to-red-500 animate-pulse opacity-75" />
                <div className="relative w-20 h-20 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-lg shadow-amber-500/25">
                  <Bot size={40} class="text-white" />
                </div>
              </div>
              <h2 className="text-2xl font-bold text-text-primary mb-2">
                {t('buddyOnboarding.title', '给你的服务器添加 AI 助手')}
              </h2>
              <p className="text-text-muted">
                {t(
                  'buddyOnboarding.desc',
                  'Buddy 是你的 AI 队友，可以在频道中与你对话、回答问题、执行任务',
                )}
              </p>
            </div>

            <div className="space-y-3">
              <button
                type="button"
                onClick={() => setStep('method')}
                className="w-full flex items-center gap-4 p-4 bg-bg-tertiary hover:bg-bg-modifier-hover rounded-xl transition group"
              >
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center">
                  <Rocket size={24} className="text-white" />
                </div>
                <div className="flex-1 text-left">
                  <p className="font-semibold text-text-primary group-hover:text-primary transition">
                    {t('buddyOnboarding.getStarted', '开始设置 Buddy')}
                  </p>
                  <p className="text-sm text-text-muted">
                    {t(
                      'buddyOnboarding.getStartedDesc',
                      '只需几步，让 AI 加入你的社区',
                    )}
                  </p>
                </div>
                <ChevronRight
                  size={20}
                  className="text-text-muted group-hover:text-primary transition"
                />
              </button>

              <button
                type="button"
                onClick={onClose}
                className="w-full py-3 text-text-muted hover:text-text-primary transition"
              >
                {t('common.skipForNow', '暂时跳过')}
              </button>
            </div>
          </div>
        )}

        {/* Step: Choose Method */}
        {step === 'method' && (
          <div className="p-8">
            <div className="text-center mb-6">
              <h2 className="text-xl font-bold text-text-primary mb-2">
                {t('buddyOnboarding.chooseMethod', '选择绑定方式')}
              </h2>
              <p className="text-text-muted text-sm">
                {t(
                  'buddyOnboarding.chooseMethodDesc',
                  'Buddy 需要通过 OpenClaw 运行，选择适合你的方式',
                )}
              </p>
            </div>

            <div className="space-y-3">
              {/* Option 1: Download Desktop */}
              <button
                type="button"
                onClick={() => setStep('desktop')}
                className="w-full flex items-center gap-4 p-4 bg-bg-tertiary hover:bg-bg-modifier-hover rounded-xl transition group"
              >
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center">
                  <Download size={24} className="text-white" />
                </div>
                <div className="flex-1 text-left">
                  <p className="font-semibold text-text-primary">
                    {t('buddyOnboarding.downloadDesktop', '下载桌面端')}
                  </p>
                  <p className="text-sm text-text-muted">
                    {t(
                      'buddyOnboarding.downloadDesktopDesc',
                      '推荐新手，一键安装并配置',
                    )}
                  </p>
                </div>
                <span className="px-2 py-1 text-xs bg-primary/20 text-primary rounded-full">
                  {t('common.recommended', '推荐')}
                </span>
              </button>

              {/* Option 2: Already have OpenClaw */}
              <button
                type="button"
                onClick={() => setStep('command')}
                className="w-full flex items-center gap-4 p-4 bg-bg-tertiary hover:bg-bg-modifier-hover rounded-xl transition group"
              >
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-green-400 to-emerald-500 flex items-center justify-center">
                  <Terminal size={24} className="text-white" />
                </div>
                <div className="flex-1 text-left">
                  <p className="font-semibold text-text-primary">
                    {t(
                      'buddyOnboarding.haveOpenClaw',
                      '已有 OpenClaw 桌面端',
                    )}
                  </p>
                  <p className="text-sm text-text-muted">
                    {t(
                      'buddyOnboarding.haveOpenClawDesc',
                      '使用命令快速绑定 Buddy',
                    )}
                  </p>
                </div>
              </button>

              {/* Option 3: Mobile */}
              <button
                type="button"
                onClick={() => setStep('command')}
                className="w-full flex items-center gap-4 p-4 bg-bg-tertiary hover:bg-bg-modifier-hover rounded-xl transition group opacity-60"
              >
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-400 to-violet-500 flex items-center justify-center">
                  <Smartphone size={24} className="text-white" />
                </div>
                <div className="flex-1 text-left">
                  <p className="font-semibold text-text-primary">
                    {t('buddyOnboarding.mobileUser', '手机用户')}
                  </p>
                  <p className="text-sm text-text-muted">
                    {t(
                      'buddyOnboarding.mobileUserDesc',
                      '需要电脑端配合使用',
                    )}
                  </p>
                </div>
              </button>
            </div>

            <button
              type="button"
              onClick={() => setStep('intro')}
              className="mt-4 text-sm text-text-muted hover:text-text-primary transition"
            >
              ← {t('common.back', '返回')}
            </button>
          </div>
        )}

        {/* Step: Download Desktop */}
        {step === 'desktop' && (
          <div className="p-8">
            <div className="text-center mb-6">
              <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center">
                <Download size={32} className="text-white" />
              </div>
              <h2 className="text-xl font-bold text-text-primary mb-2">
                {t('buddyOnboarding.downloadTitle', '下载 OpenClaw 桌面端')}
              </h2>
              <p className="text-text-muted text-sm">
                {t(
                  'buddyOnboarding.downloadDesc',
                  '安装后打开，按设置向导完成 Buddy 绑定',
                )}
              </p>
            </div>

            {/* Download Links */}
            <div className="space-y-3 mb-6">
              <a
                href="https://openclaw.ai/download/windows"
                className="flex items-center gap-3 p-3 bg-bg-tertiary hover:bg-bg-modifier-hover rounded-xl transition"
              >
                <span className="text-2xl">🪟</span>
                <span className="font-medium text-text-primary">
                  Windows 版本
                </span>
              </a>
              <a
                href="https://openclaw.ai/download/macos"
                className="flex items-center gap-3 p-3 bg-bg-tertiary hover:bg-bg-modifier-hover rounded-xl transition"
              >
                <span className="text-2xl">🍎</span>
                <span className="font-medium text-text-primary">macOS 版本</span>
              </a>
              <a
                href="https://openclaw.ai/download/linux"
                className="flex items-center gap-3 p-3 bg-bg-tertiary hover:bg-bg-modifier-hover rounded-xl transition"
              >
                <span className="text-2xl">🐧</span>
                <span className="font-medium text-text-primary">Linux 版本</span>
              </a>
            </div>

            <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl mb-4">
              <p className="text-sm text-amber-400">
                💡 {t(
                  'buddyOnboarding.installTip',
                  '安装完成后，打开 OpenClaw，点击"添加 Buddy"即可',
                )}
              </p>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setStep('method')}
                className="flex-1 py-3 text-text-muted hover:text-text-primary transition"
              >
                {t('common.back', '返回')}
              </button>
              <button
                type="button"
                onClick={() => setStep('add-to-channel')}
                className="flex-1 py-3 bg-primary text-white font-semibold rounded-xl hover:opacity-90 transition"
              >
                {t('buddyOnboarding.installed', '已安装，下一步')}
              </button>
            </div>
          </div>
        )}

        {/* Step: Command */}
        {step === 'command' && (
          <div className="p-8">
            <div className="text-center mb-6">
              <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-green-400 to-emerald-500 flex items-center justify-center">
                <Terminal size={32} className="text-white" />
              </div>
              <h2 className="text-xl font-bold text-text-primary mb-2">
                {t('buddyOnboarding.commandTitle', '使用命令绑定')}
              </h2>
              <p className="text-text-muted text-sm">
                {t(
                  'buddyOnboarding.commandDesc',
                  '在 OpenClaw 对话框中输入以下命令',
                )}
              </p>
            </div>

            {/* Command */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-text-muted mb-2">
                {t('buddyOnboarding.command', '绑定命令')}
              </label>
              <div className="relative">
                <code className="block w-full p-4 bg-bg-tertiary rounded-xl text-primary font-mono text-sm overflow-x-auto">
                  /buddy bind --server {serverId}
                </code>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(
                      `/buddy bind --server ${serverId}`,
                    )
                  }}
                  className="absolute top-2 right-2 px-2 py-1 text-xs text-text-muted hover:text-text-primary bg-bg-modifier-hover rounded transition"
                >
                  {t('common.copy', '复制')}
                </button>
              </div>
            </div>

            <div className="space-y-2 text-sm text-text-muted mb-6">
              <p>1. 打开 OpenClaw 桌面端</p>
              <p>2. 在对话中粘贴并发送上述命令</p>
              <p>3. 等待确认消息</p>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setStep('method')}
                className="flex-1 py-3 text-text-muted hover:text-text-primary transition"
              >
                {t('common.back', '返回')}
              </button>
              <button
                type="button"
                onClick={() => setStep('add-to-channel')}
                className="flex-1 py-3 bg-primary text-white font-semibold rounded-xl hover:opacity-90 transition"
              >
                {t('buddyOnboarding.bound', '已绑定，下一步')}
              </button>
            </div>
          </div>
        )}

        {/* Step: Add to Channel */}
        {step === 'add-to-channel' && (
          <div className="p-8">
            <div className="text-center mb-6">
              <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-purple-400 to-violet-500 flex items-center justify-center">
                <Plus size={32} className="text-white" />
              </div>
              <h2 className="text-xl font-bold text-text-primary mb-2">
                {t('buddyOnboarding.addToChannel', '添加 Buddy 到频道')}
              </h2>
              <p className="text-text-muted text-sm">
                {t(
                  'buddyOnboarding.addToChannelDesc',
                  '让 Buddy 加入你的频道，开始对话',
                )}
              </p>
            </div>

            {/* Instructions */}
            <div className="space-y-3 mb-6">
              <div className="flex items-start gap-3 p-3 bg-bg-tertiary rounded-xl">
                <span className="w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center text-sm font-bold shrink-0">
                  1
                </span>
                <div>
                  <p className="font-medium text-text-primary">
                    {t('buddyOnboarding.step1', '进入你的服务器频道')}
                  </p>
                  <p className="text-sm text-text-muted">
                    {t(
                      'buddyOnboarding.step1Desc',
                      '点击左侧服务器列表中的频道',
                    )}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 bg-bg-tertiary rounded-xl">
                <span className="w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center text-sm font-bold shrink-0">
                  2
                </span>
                <div>
                  <p className="font-medium text-text-primary">
                    {t('buddyOnboarding.step2', '发送消息 @Buddy')}
                  </p>
                  <p className="text-sm text-text-muted">
                    {t(
                      'buddyOnboarding.step2Desc',
                      '在频道中输入 @Buddy 打招呼，例如：@Buddy 你好！',
                    )}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 bg-bg-tertiary rounded-xl">
                <span className="w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center text-sm font-bold shrink-0">
                  3
                </span>
                <div>
                  <p className="font-medium text-text-primary">
                    {t('buddyOnboarding.step3', '开始互动')}
                  </p>
                  <p className="text-sm text-text-muted">
                    {t(
                      'buddyOnboarding.step3Desc',
                      'Buddy 会自动回复，你也可以给它分配任务',
                    )}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setStep('command')}
                className="flex-1 py-3 text-text-muted hover:text-text-primary transition"
              >
                {t('common.back', '返回')}
              </button>
              <button
                type="button"
                onClick={() => {
                  onClose()
                  void navigate({
                    to: '/servers/$serverSlug',
                    params: { serverSlug: serverId },
                  })
                }}
                className="flex-1 py-3 bg-primary text-white font-semibold rounded-xl hover:opacity-90 transition"
              >
                {t('buddyOnboarding.goToServer', '进入服务器')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}