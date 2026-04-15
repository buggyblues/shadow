import {
  Button,
  Checkbox,
  Input,
  Modal,
  ModalBody,
  ModalButtonGroup,
  ModalContent,
  ModalFooter,
  ModalHeader,
} from '@shadowob/ui'
import { Eye, EyeOff, Loader2, Lock, Variable } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

interface EnvVarEditorDialogProps {
  mode: 'create' | 'edit'
  initial?: {
    key: string
    value: string
    isSecret: boolean
  }
  isSubmitting: boolean
  onSubmit: (data: { key: string; value: string; isSecret: boolean }) => void
  onClose: () => void
  overline?: string
  titleCreate: string
  titleEdit: string
  subtitleCreate?: string
  subtitleEdit?: string
}

export function EnvVarEditorDialog({
  mode,
  initial,
  isSubmitting,
  onSubmit,
  onClose,
  overline,
  titleCreate,
  titleEdit,
  subtitleCreate,
  subtitleEdit,
}: EnvVarEditorDialogProps) {
  const { t } = useTranslation()
  const [key, setKey] = useState(initial?.key ?? '')
  const [value, setValue] = useState(initial?.value ?? '')
  const [isSecret, setIsSecret] = useState(initial?.isSecret ?? true)
  const [showValue, setShowValue] = useState(mode === 'create')

  const title = mode === 'edit' ? titleEdit : titleCreate
  const subtitle = mode === 'edit' ? subtitleEdit : subtitleCreate

  return (
    <Modal open onClose={onClose}>
      <ModalContent maxWidth="max-w-lg">
        <ModalHeader
          overline={overline}
          icon={<Variable size={18} />}
          title={title}
          subtitle={subtitle}
          onClose={onClose}
        />

        <ModalBody>
          <Input
            label={t('secrets.keyName')}
            type="text"
            value={key}
            onChange={(event) => setKey(event.target.value)}
            placeholder="OPENAI_API_KEY"
            autoFocus
            disabled={mode === 'edit'}
          />

          <div className="space-y-1.5">
            <p className="ml-1 text-[11px] font-bold uppercase tracking-[0.14em] text-text-muted">
              {t('secrets.secretValue')}
            </p>
            <div className="relative">
              <Input
                type={showValue ? 'text' : 'password'}
                value={value}
                onChange={(event) => setValue(event.target.value)}
                placeholder={mode === 'edit' ? t('secrets.leaveEmptyKeep') : ''}
              />
              <Button
                type="button"
                variant="ghost"
                size="xs"
                className="dashboard-action-button"
                onClick={() => setShowValue((current) => !current)}
              >
                {showValue ? <EyeOff size={14} /> : <Eye size={14} />}
              </Button>
            </div>
          </div>

          <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-border-subtle bg-bg-secondary/50 px-4 py-3 text-sm font-semibold text-text-secondary">
            <Checkbox
              checked={isSecret}
              onCheckedChange={(checked) => setIsSecret(checked === true)}
            />
            <Lock size={14} className="text-text-muted" />
            <span>{t('secrets.secret')}</span>
          </label>
        </ModalBody>

        <ModalFooter>
          <ModalButtonGroup>
            <Button
              type="button"
              variant="ghost"
              className="dashboard-action-button"
              onClick={onClose}
            >
              {t('common.cancel')}
            </Button>
            <Button
              type="button"
              variant="primary"
              className="dashboard-action-button"
              onClick={() => key.trim() && onSubmit({ key: key.trim(), value, isSecret })}
              disabled={!key.trim() || isSubmitting}
            >
              {isSubmitting ? <Loader2 size={14} className="animate-spin" /> : null}
              {mode === 'edit' ? t('common.save') : t('common.add')}
            </Button>
          </ModalButtonGroup>
        </ModalFooter>
      </ModalContent>
    </Modal>
  )
}
