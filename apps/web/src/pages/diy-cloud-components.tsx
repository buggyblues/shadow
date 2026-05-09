import {
  Alert,
  AlertDescription,
  Badge,
  Button,
  Checkbox,
  cn,
  GlassPanel,
  Modal,
  ModalBody,
  ModalButtonGroup,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Progress,
  Textarea,
} from '@shadowob/ui'
import {
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  Compass,
  EyeOff,
  KeyRound,
  ListChecks,
  Loader2,
  type LucideIcon,
  RefreshCcw,
  Rocket,
  Search,
  Settings2,
  ShieldCheck,
  Wallet,
  XCircle,
} from 'lucide-react'
import type { Dispatch, SetStateAction } from 'react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import {
  type DeployPhase,
  type DiyCloudDraft,
  type DiyCloudProgressEvent,
  STEP_ORDER,
  type StepId,
} from './diy-cloud-model'

type StepLabels = Record<StepId, { title: string; detail: string }>

export function StepHeading({
  index,
  title,
  detail,
  compact = false,
}: {
  index: number
  title: string
  detail: string
  compact?: boolean
}) {
  const stepIndex = index.toString().padStart(2, '0')

  return (
    <header className={cn('space-y-1', compact ? 'space-y-0.5' : 'space-y-2')}>
      <h2 className="inline-flex min-w-0 items-center gap-2 text-sm font-black leading-tight text-text-primary">
        <span className="inline-flex h-8 min-w-8 items-center justify-center rounded-[12px] border border-primary/35 bg-primary/12 text-sm font-black text-primary">
          {stepIndex}
        </span>
        <span
          className={cn(
            'min-w-0 flex-1 truncate leading-tight',
            compact ? 'text-sm' : 'text-[18px] md:text-[22px]',
          )}
        >
          {title}
        </span>
      </h2>
      <p
        className={cn(
          'font-bold leading-relaxed text-text-muted',
          compact ? 'mt-1 line-clamp-1 text-xs' : 'mt-1 text-sm',
        )}
      >
        {detail}
      </p>
    </header>
  )
}

export function DiyGenerationProgress({
  generating,
  percent,
  latestProgress,
}: {
  generating: boolean
  percent: number
  latestProgress: DiyCloudProgressEvent | null
}) {
  const { t } = useTranslation()

  return (
    <GlassPanel className="p-4 md:p-5">
      <div className="grid items-center gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-black text-text-primary">
            {generating ? (
              <Loader2 size={17} className="animate-spin text-primary" />
            ) : (
              <CheckCircle2 size={17} className="text-success" />
            )}
            {t('diyCloud.progressTitle')}
          </div>
          <Progress value={percent} showLabel />
        </div>
        <div className="min-w-0 rounded-[22px] border border-white/10 bg-white/[0.045] px-4 py-3">
          <div className="text-xs font-black uppercase tracking-[0.16em] text-primary">
            {t('diyCloud.realProgress')}
          </div>
          <p className="mt-2 text-sm font-black leading-relaxed text-text-primary">
            {latestProgress?.title ?? t('diyCloud.progressIdle')}
          </p>
          {latestProgress?.detail && (
            <p className="mt-1 text-xs font-bold leading-relaxed text-text-muted">
              {latestProgress.detail}
            </p>
          )}
        </div>
      </div>
    </GlassPanel>
  )
}

export function DiyStepDirectory({
  activeStep,
  completedSteps,
  embedded = false,
  generating,
  progressByStep,
  selectedStep,
  stepLabels,
  onSelectStep,
}: {
  activeStep: StepId | null
  completedSteps: Set<StepId>
  embedded?: boolean
  generating: boolean
  progressByStep: Map<StepId, DiyCloudProgressEvent>
  selectedStep: StepId
  stepLabels: StepLabels
  onSelectStep: (id: StepId) => void
}) {
  const { t } = useTranslation()
  const stepIcons: Record<StepId, LucideIcon> = {
    think: Compass,
    search: Search,
    generate: Settings2,
    validate: ShieldCheck,
    review: ClipboardCheck,
  }

  const content = (
    <>
      <div className="px-3 py-3">
        <div className="flex items-center gap-2 text-sm font-black text-text-primary">
          <ListChecks size={17} className="text-primary" />
          {t('diyCloud.tocTitle')}
        </div>
        <p className="mt-1 text-xs font-bold leading-relaxed text-text-muted">
          {t('diyCloud.tocSubtitle')}
        </p>
      </div>
      <nav className="space-y-1">
        {STEP_ORDER.map((id, index) => {
          const Icon = stepIcons[id]
          const progress = progressByStep.get(id)
          const complete = completedSteps.has(id)
          const running = generating && activeStep === id
          const active = selectedStep === id
          return (
            <button
              key={id}
              type="button"
              onClick={() => onSelectStep(id)}
              className={cn(
                'flex w-full items-center gap-3 rounded-[20px] px-3 py-3 text-left transition',
                active
                  ? 'border border-primary/20 bg-primary/15 text-primary'
                  : 'border border-transparent text-text-secondary hover:border-white/10 hover:bg-white/[0.04] hover:text-text-primary',
              )}
            >
              <span
                className={cn(
                  'flex h-9 w-9 shrink-0 items-center justify-center rounded-[16px] border text-xs font-black',
                  running
                    ? 'border-primary/30 bg-primary/15 text-primary'
                    : complete
                      ? 'border-success/25 bg-success/10 text-success'
                      : 'border-white/10 bg-white/[0.04] text-text-muted',
                )}
              >
                {running ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : complete ? (
                  <CheckCircle2 size={15} />
                ) : progress ? (
                  <Icon size={15} />
                ) : (
                  index + 1
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-black">{stepLabels[id].title}</span>
                <span className="mt-0.5 block truncate text-[11px] font-bold text-text-muted">
                  {progress?.title ?? stepLabels[id].detail}
                </span>
              </span>
            </button>
          )
        })}
      </nav>
    </>
  )

  if (embedded) return <div className="p-3">{content}</div>

  return (
    <GlassPanel as="aside" className="h-fit p-3 lg:sticky lg:top-4">
      {content}
    </GlassPanel>
  )
}

export function DiyFeedbackModal({
  deployBusy,
  feedback,
  generating,
  open,
  onApply,
  onClose,
  setFeedback,
}: {
  deployBusy: boolean
  feedback: string
  generating: boolean
  open: boolean
  onApply: () => void
  onClose: () => void
  setFeedback: Dispatch<SetStateAction<string>>
}) {
  const { t } = useTranslation()

  return (
    <Modal open={open} onClose={onClose}>
      <ModalContent size="md">
        <ModalHeader
          icon={<RefreshCcw size={20} />}
          title={t('diyCloud.feedbackTitle')}
          subtitle={t('diyCloud.feedbackBody')}
          onClose={onClose}
        />
        <ModalBody>
          <Textarea
            value={feedback}
            onChange={(event) => setFeedback(event.currentTarget.value)}
            placeholder={t('diyCloud.feedbackPlaceholder')}
            className="min-h-[160px]"
            aria-label={t('diyCloud.feedbackTitle')}
          />
        </ModalBody>
        <ModalFooter>
          <ModalButtonGroup>
            <Button type="button" variant="glass" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button
              type="button"
              icon={RefreshCcw}
              loading={generating}
              disabled={!feedback.trim() || generating || deployBusy}
              onClick={onApply}
            >
              {t('diyCloud.applyFeedback')}
            </Button>
          </ModalButtonGroup>
        </ModalFooter>
      </ModalContent>
    </Modal>
  )
}

type DeployGate = {
  kind: 'membership' | 'wallet' | 'generic'
  title: string
  body: string
  primaryHref?: string
  primaryLabel?: string
  secondaryHref?: string
  secondaryLabel?: string
}

type DeployWizardItem =
  | { kind: 'overview'; id: 'overview' }
  | { kind: 'key'; id: string; key: DiyCloudDraft['requiredKeys'][number] }
  | { kind: 'confirm'; id: 'confirm' }

export function DiyDeployWizardModal({
  deployBusy,
  deployError,
  deployGuideIndex,
  deployGuideOpen,
  deployPhase,
  deployPhaseText,
  draft,
  gate,
  generating,
  keyValues,
  preparedKeyCount,
  requiredKeysReady,
  saveTemplate,
  setDeployGuideIndex,
  setKeyValues,
  setSaveTemplate,
  setSkippedKeys,
  skippedKeys,
  onClose,
  onDeploy,
}: {
  deployBusy: boolean
  deployError: string
  deployGuideIndex: number
  deployGuideOpen: boolean
  deployPhase: DeployPhase
  deployPhaseText: string
  draft: DiyCloudDraft | null
  gate: DeployGate | null
  generating: boolean
  keyValues: Record<string, string>
  preparedKeyCount: number
  requiredKeysReady: boolean
  saveTemplate: boolean
  setDeployGuideIndex: Dispatch<SetStateAction<number>>
  setKeyValues: Dispatch<SetStateAction<Record<string, string>>>
  setSaveTemplate: Dispatch<SetStateAction<boolean>>
  setSkippedKeys: Dispatch<SetStateAction<Set<string>>>
  skippedKeys: Set<string>
  onClose: () => void
  onDeploy: () => void
}) {
  const { t } = useTranslation()
  const deployWizardItems = useMemo<DeployWizardItem[]>(() => {
    if (!draft) return []
    return [
      { kind: 'overview', id: 'overview' },
      ...draft.requiredKeys.map((key) => ({ kind: 'key' as const, id: key.key, key })),
      { kind: 'confirm', id: 'confirm' },
    ]
  }, [draft])
  const deployWizardItem = deployWizardItems[deployGuideIndex] ?? deployWizardItems[0] ?? null
  const deployWizardPercent =
    deployWizardItems.length > 0
      ? Math.round(((deployGuideIndex + 1) / deployWizardItems.length) * 100)
      : 0
  const deployWizardKey = deployWizardItem?.kind === 'key' ? deployWizardItem.key : null
  const deployWizardKeyReady = deployWizardKey
    ? Boolean(keyValues[deployWizardKey.key]?.trim()) || skippedKeys.has(deployWizardKey.key)
    : true
  const canAdvanceDeployWizard = deployWizardItem
    ? (deployWizardItem.kind !== 'key' || deployWizardKeyReady) && !deployBusy
    : false

  return (
    <Modal open={deployGuideOpen} onClose={onClose}>
      <ModalContent size="lg">
        <ModalHeader
          icon={<Rocket size={20} />}
          title={t('diyCloud.deployWizardTitle')}
          subtitle={t('diyCloud.deployWizardSubtitle')}
          onClose={onClose}
          hideCloseButton={deployBusy}
        />
        <ModalBody>
          {draft && deployWizardItem && (
            <div className="space-y-5">
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3 text-xs font-black uppercase tracking-[0.16em] text-text-muted">
                  <span>
                    {t('diyCloud.deployWizardStep', {
                      current: deployGuideIndex + 1,
                      total: deployWizardItems.length,
                    })}
                  </span>
                  <span>{deployWizardPercent}%</span>
                </div>
                <Progress value={deployWizardPercent} />
              </div>

              {deployWizardItem.kind === 'overview' && (
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
                  <div className="rounded-[24px] border border-white/10 bg-white/[0.045] p-5">
                    <h3 className="m-0 text-lg font-black text-text-primary">
                      {t('diyCloud.deployWizardOverviewTitle')}
                    </h3>
                    <p className="mt-3 text-sm font-bold leading-relaxed text-text-muted">
                      {draft.guidebook.beforeDeploy.join(' ')}
                    </p>
                  </div>
                  <label className="flex cursor-pointer items-start gap-3 rounded-[24px] border border-white/10 bg-white/[0.045] p-5">
                    <Checkbox
                      checked={saveTemplate}
                      onCheckedChange={(value) => setSaveTemplate(value === true)}
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-black text-text-primary">
                        {t('diyCloud.saveTemplate')}
                      </span>
                      <span className="mt-1 block text-xs font-bold leading-relaxed text-text-muted">
                        {t('diyCloud.saveTemplateHint')}
                      </span>
                    </span>
                  </label>
                </div>
              )}

              {deployWizardKey && (
                <div className="rounded-[24px] border border-white/10 bg-white/[0.045] p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="m-0 text-lg font-black text-text-primary">
                        {deployWizardKey.label}
                      </h3>
                      <p className="mt-2 text-sm font-bold leading-relaxed text-text-muted">
                        {deployWizardKey.description}
                      </p>
                    </div>
                    <Badge variant="neutral">{deployWizardKey.source}</Badge>
                  </div>
                  <ol className="mt-5 grid gap-2 p-0 md:grid-cols-2">
                    {deployWizardKey.setupSteps.map((step, index) => (
                      <li
                        key={`${deployWizardKey.key}-${step}-${index}`}
                        className="flex gap-2 rounded-[18px] border border-white/10 bg-black/10 p-3 text-xs font-bold leading-relaxed text-text-secondary"
                      >
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-black text-bg-deep">
                          {index + 1}
                        </span>
                        <span>{step}</span>
                      </li>
                    ))}
                  </ol>
                  <Textarea
                    value={keyValues[deployWizardKey.key] ?? ''}
                    onChange={(event) => {
                      const value = event.currentTarget.value
                      setKeyValues((current) => ({
                        ...current,
                        [deployWizardKey.key]: value,
                      }))
                      if (value.trim()) {
                        setSkippedKeys((current) => {
                          const next = new Set(current)
                          next.delete(deployWizardKey.key)
                          return next
                        })
                      }
                    }}
                    placeholder={t('diyCloud.keyValuePlaceholder')}
                    className="mt-5 min-h-[96px]"
                    aria-label={deployWizardKey.label}
                  />
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant="glass"
                      size="sm"
                      icon={EyeOff}
                      onClick={() =>
                        setSkippedKeys((current) => {
                          const next = new Set(current)
                          next.add(deployWizardKey.key)
                          return next
                        })
                      }
                    >
                      {t('diyCloud.skipKey')}
                    </Button>
                    {skippedKeys.has(deployWizardKey.key) && (
                      <span className="text-xs font-bold leading-relaxed text-text-muted">
                        {deployWizardKey.skipImpact}
                      </span>
                    )}
                  </div>
                  {!deployWizardKeyReady && (
                    <Alert variant="warning" className="mt-4">
                      <KeyRound size={18} />
                      <AlertDescription>{t('diyCloud.deployWizardMissingKey')}</AlertDescription>
                    </Alert>
                  )}
                </div>
              )}

              {deployWizardItem.kind === 'confirm' && (
                <div className="space-y-4">
                  <div className="rounded-[24px] border border-white/10 bg-white/[0.045] p-5">
                    <h3 className="m-0 text-lg font-black text-text-primary">
                      {t('diyCloud.deployWizardConfirmTitle')}
                    </h3>
                    <p className="mt-3 text-sm font-bold leading-relaxed text-text-muted">
                      {draft.requiredKeys.length > 0
                        ? t('diyCloud.deployWizardConfirmBody')
                        : t('diyCloud.deployWizardNoKeys')}
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Badge variant={draft.validation.valid ? 'success' : 'warning'}>
                        {draft.validation.valid
                          ? t('diyCloud.validationPassed')
                          : t('diyCloud.validationNeedsReview')}
                      </Badge>
                      <Badge variant={requiredKeysReady ? 'success' : 'neutral'}>
                        {t('diyCloud.keyProgress', {
                          done: preparedKeyCount,
                          total: draft.requiredKeys.length,
                        })}
                      </Badge>
                    </div>
                  </div>

                  {gate && (
                    <Alert variant={gate.kind === 'wallet' ? 'warning' : 'info'}>
                      {gate.kind === 'wallet' ? <Wallet size={18} /> : <ShieldCheck size={18} />}
                      <AlertDescription>
                        <strong className="block text-sm">{gate.title}</strong>
                        <span className="mt-1 block">{gate.body}</span>
                        <div className="mt-4 flex flex-wrap gap-2">
                          {gate.primaryHref && gate.primaryLabel && (
                            <Button asChild variant="primary" size="sm">
                              <a href={gate.primaryHref}>{gate.primaryLabel}</a>
                            </Button>
                          )}
                          {gate.secondaryHref && gate.secondaryLabel && (
                            <Button asChild variant="glass" size="sm">
                              <a href={gate.secondaryHref}>{gate.secondaryLabel}</a>
                            </Button>
                          )}
                        </div>
                      </AlertDescription>
                    </Alert>
                  )}

                  {deployError && (
                    <Alert variant="destructive">
                      <XCircle size={18} />
                      <AlertDescription>{deployError}</AlertDescription>
                    </Alert>
                  )}

                  {deployPhaseText && (
                    <div className="rounded-[18px] border border-primary/15 bg-primary/10 p-4 text-sm font-black text-primary">
                      {deployPhase !== 'idle' && deployBusy && (
                        <Loader2 className="mr-2 inline animate-spin" size={16} />
                      )}
                      {deployPhaseText}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </ModalBody>
        <ModalFooter>
          <ModalButtonGroup>
            <Button
              type="button"
              variant="glass"
              disabled={deployGuideIndex === 0 || deployBusy}
              onClick={() => setDeployGuideIndex((index) => Math.max(0, index - 1))}
            >
              {t('diyCloud.deployWizardBack')}
            </Button>
            {deployWizardItem?.kind === 'confirm' ? (
              <Button
                type="button"
                icon={Rocket}
                loading={deployBusy}
                disabled={
                  !draft?.validation.valid || !requiredKeysReady || deployBusy || generating
                }
                onClick={onDeploy}
              >
                {t('diyCloud.deploy')}
              </Button>
            ) : (
              <Button
                type="button"
                iconRight={ArrowRight}
                disabled={!canAdvanceDeployWizard}
                onClick={() =>
                  setDeployGuideIndex((index) => Math.min(deployWizardItems.length - 1, index + 1))
                }
              >
                {t('diyCloud.deployWizardNext')}
              </Button>
            )}
          </ModalButtonGroup>
        </ModalFooter>
      </ModalContent>
    </Modal>
  )
}
