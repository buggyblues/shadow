import {
  Alert,
  AlertDescription,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  Input,
} from '@shadowob/ui'
import { Ticket, X } from 'lucide-react'
import type React from 'react'
import { useEffect, useRef, useState } from 'react'

export type InviteCodeRedeemText = {
  codeLabel: string
  codePlaceholder: string
  submit: string
  submitting: string
  required: string
}

export type InviteCodeDialogText = InviteCodeRedeemText & {
  title: string
  description: string
  cancel: string
  close: string
  success: string
  failed: string
  capability?: (capability: string) => string
}

export type InviteCodeRedeemFormProps = {
  text: InviteCodeRedeemText
  value: string
  onValueChange: (value: string) => void
  onSubmit: (code: string) => void | Promise<void>
  submitting?: boolean
  error?: string
  layout?: 'stacked' | 'inline'
  className?: string
}

export function InviteCodeRedeemForm({
  text,
  value,
  onValueChange,
  onSubmit,
  submitting = false,
  error,
  layout = 'stacked',
  className,
}: InviteCodeRedeemFormProps) {
  const [localError, setLocalError] = useState('')
  const visibleError = error || localError

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    const code = value.trim()
    if (!code) {
      setLocalError(text.required)
      return
    }
    setLocalError('')
    void onSubmit(code)
  }

  return (
    <form className={className} onSubmit={submit}>
      <div
        className={layout === 'inline' ? 'flex flex-col gap-3 sm:flex-row' : 'flex flex-col gap-3'}
      >
        <Input
          value={value}
          onChange={(event) => {
            setLocalError('')
            onValueChange(event.currentTarget.value.toUpperCase().replace(/\s+/g, ''))
          }}
          placeholder={text.codePlaceholder}
          className="font-mono tracking-widest"
          label={layout === 'stacked' ? text.codeLabel : undefined}
          autoComplete="one-time-code"
          disabled={submitting}
        />
        <Button
          type="submit"
          icon={Ticket}
          loading={submitting}
          disabled={!value.trim() || submitting}
          className={layout === 'inline' ? 'sm:min-w-32' : 'w-full'}
        >
          {submitting ? text.submitting : text.submit}
        </Button>
      </div>
      {visibleError ? (
        <Alert variant="destructive" className="mt-3 p-4 text-left">
          <AlertDescription className="not-italic">{visibleError}</AlertDescription>
        </Alert>
      ) : null}
    </form>
  )
}

export type InviteCodeDialogProps = {
  open: boolean
  text: InviteCodeDialogText
  capability?: string
  error?: string
  submitting?: boolean
  onSubmit: (code: string) => void | Promise<void>
  onClose: () => void
}

export function InviteCodeDialog({
  open,
  text,
  capability,
  error,
  submitting = false,
  onSubmit,
  onClose,
}: InviteCodeDialogProps) {
  const inputResetKeyRef = useRef(0)
  const [code, setCode] = useState('')

  useEffect(() => {
    if (!open) return
    inputResetKeyRef.current += 1
    setCode('')
  }, [open])

  return (
    <Dialog isOpen={open} onClose={onClose}>
      <DialogContent
        hideCloseButton
        maxWidth="max-w-[520px]"
        className="max-h-[calc(100dvh-24px)] w-[calc(100vw-24px)] overflow-y-auto overscroll-contain rounded-[28px] border-white/70 px-5 py-6 sm:w-full sm:px-7"
      >
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="absolute right-4 top-4 z-20"
          onClick={onClose}
          aria-label={text.close}
          disabled={submitting}
        >
          <X size={20} />
        </Button>

        <div className="flex flex-col items-center text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-primary/25 bg-primary/10 text-primary">
            <Ticket size={28} strokeWidth={2.4} aria-hidden="true" />
          </div>
          <DialogTitle className="normal-case tracking-normal">{text.title}</DialogTitle>
          <DialogDescription className="mt-2 max-w-[380px] text-[14px] font-semibold leading-6 not-italic">
            {text.description}
          </DialogDescription>
          {capability && text.capability ? (
            <p className="mt-3 rounded-full border border-border-subtle bg-bg-secondary/40 px-3 py-1 text-xs font-bold text-text-secondary">
              {text.capability(capability)}
            </p>
          ) : null}
        </div>

        <InviteCodeRedeemForm
          key={inputResetKeyRef.current}
          text={text}
          value={code}
          onValueChange={setCode}
          onSubmit={onSubmit}
          submitting={submitting}
          error={error}
          className="mt-2"
        />

        <Button
          type="button"
          variant="ghost"
          className="w-full normal-case tracking-normal"
          onClick={onClose}
          disabled={submitting}
        >
          {text.cancel}
        </Button>
      </DialogContent>
    </Dialog>
  )
}
