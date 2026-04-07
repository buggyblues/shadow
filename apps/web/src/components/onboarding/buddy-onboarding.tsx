import { Button, Card, Dialog, DialogContent } from '@shadowob/ui'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { Bot, ChevronRight, Download, Plus, Rocket, Smartphone, Terminal, X } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { fetchApi } from '../../lib/api'

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
    queryFn: () => fetchApi<Array<{ id: string; name: string }>>('/api/buddies'),
  })

  const hasBuddies = buddies.length > 0

  // If user already has buddies, skip to add-to-channel
  if (hasBuddies && step === 'intro') {
    // Could auto-advance, but let user choose
  }

  return (
    <Dialog isOpen onClose={onClose}>
      <DialogContent className="!rounded-[40px] !max-w-lg !p-0">
        {/* Close button */}
        <Button
          variant="ghost"
          size="icon"
          icon={X}
          onClick={onClose}
          className="absolute top-4 right-4 z-10 !h-9 !w-9"
        />

        {/* Step: Intro */}
        {step === 'intro' && (
          <div className="p-8">
            <div className="text-center mb-8">
              <div className="w-20 h-20 mx-auto mb-6 relative">
                <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-warning via-warning to-danger animate-pulse opacity-75" />
                <div className="relative w-20 h-20 rounded-2xl bg-gradient-to-br from-warning to-warning flex items-center justify-center shadow-lg shadow-warning/25">
                  <Bot size={40} className="text-bg-deep" />
                </div>
              </div>
              <h2 className="text-2xl font-black uppercase tracking-tight text-text-primary mb-2">
                {t('buddyOnboarding.title', '给你的服务器添加 AI 搭子')}
              </h2>
              <p className="text-text-muted">
                {t(
                  'buddyOnboarding.desc',
                  'Buddy 是你的 AI 队友，可以在频道中与你对话、回答问题、执行任务',
                )}
              </p>
            </div>

            <div className="space-y-3">
              <Card
                variant="glass"
                hoverable
                className="!rounded-[40px] cursor-pointer"
                onClick={() => setStep('method')}
              >
                <div className="flex items-center gap-4 p-4 group">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-accent to-accent flex items-center justify-center shadow-lg shadow-accent/25">
                    <Rocket size={24} className="text-bg-deep" />
                  </div>
                  <div className="flex-1 text-left">
                    <p className="font-black text-text-primary group-hover:text-primary transition">
                      {t('buddyOnboarding.getStarted', '开始设置 Buddy')}
                    </p>
                    <p className="text-sm text-text-muted font-bold italic">
                      {t('buddyOnboarding.getStartedDesc', '只需几步，让 AI 加入你的社区')}
                    </p>
                  </div>
                  <ChevronRight
                    size={20}
                    className="text-text-muted group-hover:text-primary transition"
                  />
                </div>
              </Card>

              <Button variant="ghost" className="w-full" onClick={onClose}>
                {t('common.skipForNow', '暂时跳过')}
              </Button>
            </div>
          </div>
        )}

        {/* Step: Choose Method */}
        {step === 'method' && (
          <div className="p-8">
            <div className="text-center mb-6">
              <h2 className="text-xl font-black uppercase tracking-tight text-text-primary mb-2">
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
              <Card
                variant="glass"
                hoverable
                className="!rounded-[40px] cursor-pointer"
                onClick={() => setStep('desktop')}
              >
                <div className="flex items-center gap-4 p-4 group">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary to-primary flex items-center justify-center shadow-lg shadow-primary/25">
                    <Download size={24} className="text-bg-deep" />
                  </div>
                  <div className="flex-1 text-left">
                    <p className="font-black text-text-primary">
                      {t('buddyOnboarding.downloadDesktop', '下载桌面端')}
                    </p>
                    <p className="text-sm text-text-muted font-bold italic">
                      {t('buddyOnboarding.downloadDesktopDesc', '推荐新手，一键安装并配置')}
                    </p>
                  </div>
                  <span className="px-2.5 py-1 text-[11px] font-black uppercase tracking-widest bg-primary/10 text-primary rounded-full border border-primary/20">
                    {t('common.recommended', '推荐')}
                  </span>
                </div>
              </Card>

              {/* Option 2: Already have OpenClaw */}
              <Card
                variant="glass"
                hoverable
                className="!rounded-[40px] cursor-pointer"
                onClick={() => setStep('command')}
              >
                <div className="flex items-center gap-4 p-4 group">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-success to-success flex items-center justify-center shadow-lg shadow-success/25">
                    <Terminal size={24} className="text-bg-deep" />
                  </div>
                  <div className="flex-1 text-left">
                    <p className="font-black text-text-primary">
                      {t('buddyOnboarding.haveOpenClaw', '已有 OpenClaw 桌面端')}
                    </p>
                    <p className="text-sm text-text-muted font-bold italic">
                      {t('buddyOnboarding.haveOpenClawDesc', '使用命令快速绑定 Buddy')}
                    </p>
                  </div>
                </div>
              </Card>

              {/* Option 3: Mobile */}
              <Card
                variant="glass"
                className="!rounded-[40px] opacity-60"
                onClick={() => setStep('command')}
              >
                <div className="flex items-center gap-4 p-4 group">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-info to-info flex items-center justify-center shadow-lg shadow-info/25">
                    <Smartphone size={24} className="text-white" />
                  </div>
                  <div className="flex-1 text-left">
                    <p className="font-black text-text-primary">
                      {t('buddyOnboarding.mobileUser', '手机用户')}
                    </p>
                    <p className="text-sm text-text-muted font-bold italic">
                      {t('buddyOnboarding.mobileUserDesc', '需要电脑端配合使用')}
                    </p>
                  </div>
                </div>
              </Card>
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
              <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-primary to-primary flex items-center justify-center shadow-lg shadow-primary/25">
                <Download size={32} className="text-bg-deep" />
              </div>
              <h2 className="text-xl font-black uppercase tracking-tight text-text-primary mb-2">
                {t('buddyOnboarding.downloadTitle', '下载 OpenClaw 桌面端')}
              </h2>
              <p className="text-text-muted text-sm">
                {t('buddyOnboarding.downloadDesc', '安装后打开，按设置向导完成 Buddy 绑定')}
              </p>
            </div>

            {/* Download Links */}
            <div className="space-y-3 mb-6">
              <a
                href="https://openclaw.ai/download/windows"
                className="flex items-center gap-3 p-4 bg-bg-tertiary/30 backdrop-blur-xl border border-border-subtle hover:border-primary/30 rounded-2xl transition"
              >
                <span className="text-2xl">🪟</span>
                <span className="font-black text-text-primary">Windows 版本</span>
              </a>
              <a
                href="https://openclaw.ai/download/macos"
                className="flex items-center gap-3 p-4 bg-bg-tertiary/30 backdrop-blur-xl border border-border-subtle hover:border-primary/30 rounded-2xl transition"
              >
                <span className="text-2xl">🍎</span>
                <span className="font-black text-text-primary">macOS 版本</span>
              </a>
              <a
                href="https://openclaw.ai/download/linux"
                className="flex items-center gap-3 p-4 bg-bg-tertiary/30 backdrop-blur-xl border border-border-subtle hover:border-primary/30 rounded-2xl transition"
              >
                <span className="text-2xl">🐧</span>
                <span className="font-black text-text-primary">Linux 版本</span>
              </a>
            </div>

            <div className="p-4 bg-warning/10 border border-warning/20 rounded-2xl mb-4 backdrop-blur-sm">
              <p className="text-sm text-warning">
                💡{' '}
                {t('buddyOnboarding.installTip', '安装完成后，打开 OpenClaw，点击"添加 Buddy"即可')}
              </p>
            </div>

            <div className="flex gap-3">
              <Button variant="ghost" className="flex-1" onClick={() => setStep('method')}>
                {t('common.back', '返回')}
              </Button>
              <Button
                variant="primary"
                className="flex-1"
                onClick={() => setStep('add-to-channel')}
              >
                {t('buddyOnboarding.installed', '已安装，下一步')}
              </Button>
            </div>
          </div>
        )}

        {/* Step: Command */}
        {step === 'command' && (
          <div className="p-8">
            <div className="text-center mb-6">
              <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-success to-success flex items-center justify-center shadow-lg shadow-success/25">
                <Terminal size={32} className="text-bg-deep" />
              </div>
              <h2 className="text-xl font-black uppercase tracking-tight text-text-primary mb-2">
                {t('buddyOnboarding.commandTitle', '使用命令绑定')}
              </h2>
              <p className="text-text-muted text-sm">
                {t('buddyOnboarding.commandDesc', '在 OpenClaw 对话框中输入以下命令')}
              </p>
            </div>

            {/* Command */}
            <div className="mb-6">
              <label className="block text-sm font-black uppercase tracking-widest text-text-muted mb-2">
                {t('buddyOnboarding.command', '绑定命令')}
              </label>
              <div className="relative">
                <code className="block w-full p-4 bg-bg-tertiary/30 backdrop-blur-xl border border-border-subtle rounded-2xl text-primary font-mono text-sm overflow-x-auto">
                  /buddy bind --server {serverId}
                </code>
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => {
                    navigator.clipboard.writeText(`/buddy bind --server ${serverId}`)
                  }}
                  className="absolute top-2 right-2"
                >
                  {t('common.copy', '复制')}
                </Button>
              </div>
            </div>

            <div className="space-y-2 text-sm text-text-muted mb-6">
              <p>1. 打开 OpenClaw 桌面端</p>
              <p>2. 在对话中粘贴并发送上述命令</p>
              <p>3. 等待确认消息</p>
            </div>

            <div className="flex gap-3">
              <Button variant="ghost" className="flex-1" onClick={() => setStep('method')}>
                {t('common.back', '返回')}
              </Button>
              <Button
                variant="primary"
                className="flex-1"
                onClick={() => setStep('add-to-channel')}
              >
                {t('buddyOnboarding.bound', '已绑定，下一步')}
              </Button>
            </div>
          </div>
        )}

        {/* Step: Add to Channel */}
        {step === 'add-to-channel' && (
          <div className="p-8">
            <div className="text-center mb-6">
              <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-info to-info flex items-center justify-center shadow-lg shadow-info/25">
                <Plus size={32} className="text-white" />
              </div>
              <h2 className="text-xl font-black uppercase tracking-tight text-text-primary mb-2">
                {t('buddyOnboarding.addToChannel', '添加 Buddy 到频道')}
              </h2>
              <p className="text-text-muted text-sm">
                {t('buddyOnboarding.addToChannelDesc', '让 Buddy 加入你的频道，开始对话')}
              </p>
            </div>

            {/* Instructions */}
            <div className="space-y-3 mb-6">
              <Card variant="glass" className="!rounded-2xl">
                <div className="flex items-start gap-3 p-4">
                  <span className="w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center text-sm font-black shrink-0">
                    1
                  </span>
                  <div>
                    <p className="font-black text-text-primary">
                      {t('buddyOnboarding.step1', '进入你的服务器频道')}
                    </p>
                    <p className="text-sm text-text-muted font-bold italic">
                      {t('buddyOnboarding.step1Desc', '点击左侧服务器列表中的频道')}
                    </p>
                  </div>
                </div>
              </Card>

              <Card variant="glass" className="!rounded-2xl">
                <div className="flex items-start gap-3 p-4">
                  <span className="w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center text-sm font-black shrink-0">
                    2
                  </span>
                  <div>
                    <p className="font-black text-text-primary">
                      {t('buddyOnboarding.step2', '发送消息 @Buddy')}
                    </p>
                    <p className="text-sm text-text-muted font-bold italic">
                      {t(
                        'buddyOnboarding.step2Desc',
                        '在频道中输入 @Buddy 打招呼，例如：@Buddy 你好！',
                      )}
                    </p>
                  </div>
                </div>
              </Card>

              <Card variant="glass" className="!rounded-2xl">
                <div className="flex items-start gap-3 p-4">
                  <span className="w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center text-sm font-black shrink-0">
                    3
                  </span>
                  <div>
                    <p className="font-black text-text-primary">
                      {t('buddyOnboarding.step3', '开始互动')}
                    </p>
                    <p className="text-sm text-text-muted font-bold italic">
                      {t('buddyOnboarding.step3Desc', 'Buddy 会自动回复，你也可以给它分配任务')}
                    </p>
                  </div>
                </div>
              </Card>
            </div>

            <div className="flex gap-3">
              <Button variant="ghost" className="flex-1" onClick={() => setStep('command')}>
                {t('common.back', '返回')}
              </Button>
              <Button
                variant="primary"
                className="flex-1"
                onClick={() => {
                  onClose()
                  void navigate({
                    to: '/servers/$serverSlug',
                    params: { serverSlug: serverId },
                  })
                }}
              >
                {t('buddyOnboarding.goToServer', '进入服务器')}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
