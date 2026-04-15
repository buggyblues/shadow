import { Button, Textarea } from '@shadowob/ui'
import { useMutation } from '@tanstack/react-query'
import { clsx } from 'clsx'
import { AlertTriangle, CheckCircle, Shield } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PageShell } from '@/components/PageShell'
import { api, type ValidateResult } from '@/lib/api'
import { useToast } from '@/stores/toast'

export function ValidatePage() {
  const { t } = useTranslation()
  const toast = useToast()
  const [configText, setConfigText] = useState('')
  const [result, setResult] = useState<ValidateResult | null>(null)

  const mutation = useMutation({
    mutationFn: (config: unknown) => api.validate(config),
    onSuccess: (data) => {
      setResult(data)
      if (data.valid) toast.success(t('validate.validationPassedToast', { agents: data.agents }))
      else {
        toast.error(t('validate.validationFailedToast', { count: data.violations.length }))
      }
    },
  })

  const handleValidate = () => {
    try {
      const parsed = JSON.parse(configText)
      setResult(null)
      mutation.mutate(parsed)
    } catch {
      toast.error(t('validate.invalidJsonCannotValidate'))
      setResult(null)
      mutation.reset()
    }
  }

  const handleLoadSample = async () => {
    try {
      const content = await api.init()
      setConfigText(JSON.stringify(content, null, 2))
      toast.info(t('validate.templateLoaded'))
    } catch {
      /* ignore */
    }
  }

  return (
    <PageShell
      breadcrumb={[{ label: t('validate.title') }]}
      title={t('validate.title')}
      description={t('validate.description')}
      actions={
        <Button type="button" onClick={handleLoadSample} variant="ghost" size="sm">
          {t('validate.loadTemplate')}
        </Button>
      }
      narrow
    >
      <div className="space-y-4">
        {/* Editor */}
        <Textarea
          value={configText}
          onChange={(e) => setConfigText(e.target.value)}
          placeholder={t('validate.pasteConfig')}
          spellCheck={false}
        />

        {/* Actions */}
        <div className="flex items-center gap-3">
          <Button
            type="button"
            onClick={handleValidate}
            disabled={!configText.trim() || mutation.isPending}
            loading={mutation.isPending}
            variant="primary"
          >
            <Shield size={14} />
            {mutation.isPending ? t('validate.validating') : t('validate.title')}
          </Button>
        </div>

        {/* Parse error */}
        {mutation.error && (
          <div className="bg-red-900/30 border border-red-800 rounded-lg p-4 text-red-400 text-sm">
            <div className="flex items-center gap-2 mb-1 font-medium">
              <AlertTriangle size={14} />
              {t('validate.validationError')}
            </div>
            <p className="font-mono text-xs">{mutation.error.message}</p>
          </div>
        )}

        {/* Results */}
        {result && (
          <div
            className={clsx(
              'border rounded-lg p-4',
              result.valid ? 'bg-green-900/20 border-green-800' : 'bg-red-900/20 border-red-800',
            )}
          >
            <div className="flex items-center gap-2 mb-3">
              {result.valid ? (
                <CheckCircle size={16} className="text-green-400" />
              ) : (
                <AlertTriangle size={16} className="text-red-400" />
              )}
              <span
                className={clsx(
                  'text-sm font-medium',
                  result.valid ? 'text-green-400' : 'text-red-400',
                )}
              >
                {result.valid ? t('validate.configValid') : t('validate.configHasIssues')}
              </span>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-3 mb-3">
              <div className="bg-bg-secondary/50 rounded p-2">
                <p className="text-xs text-text-muted">{t('validate.agents')}</p>
                <p className="text-lg font-semibold">{result.agents}</p>
              </div>
              <div className="bg-bg-secondary/50 rounded p-2">
                <p className="text-xs text-text-muted">{t('validate.configurations')}</p>
                <p className="text-lg font-semibold">{result.configurations}</p>
              </div>
              <div className="bg-bg-secondary/50 rounded p-2">
                <p className="text-xs text-text-muted">{t('validate.templateRefs')}</p>
                <p className="text-xs mt-1 text-text-secondary">
                  {result.templateRefs.env} {t('validate.env')}, {result.templateRefs.secret}{' '}
                  {t('validate.secret')}, {result.templateRefs.file} {t('validate.file')}
                </p>
              </div>
            </div>

            {/* Violations */}
            {result.violations.length > 0 && (
              <div className="space-y-1 mb-2">
                <p className="text-xs text-red-400 font-medium">{t('validate.inlineApiKeys')}</p>
                {result.violations.map((v, i) => (
                  <div key={i} className="text-xs text-red-300 font-mono pl-4">
                    {v.path} ({t('validate.prefixLabel')}: {v.prefix})
                  </div>
                ))}
              </div>
            )}

            {/* Extends errors */}
            {result.extendsErrors.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs text-red-400 font-medium">{t('validate.extendsErrors')}</p>
                {result.extendsErrors.map((e, i) => (
                  <div key={i} className="text-xs text-red-300 font-mono pl-4">
                    {e}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </PageShell>
  )
}
