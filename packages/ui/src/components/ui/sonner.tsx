import { Toaster as Sonner, toast } from 'sonner'

type ToasterProps = React.ComponentProps<typeof Sonner>

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            'group toast group-[.toaster]:bg-[rgba(18,18,26,0.96)] group-[.toaster]:text-text-primary group-[.toaster]:border-[rgba(255,255,255,0.12)] group-[.toaster]:shadow-[0_20px_60px_rgba(0,0,0,0.45)] group-[.toaster]:backdrop-blur-xl group-[.toaster]:rounded-[20px] group-[.toaster]:p-4',
          description: 'group-[.toast]:text-text-muted',
          actionButton:
            'group-[.toast]:bg-primary group-[.toast]:text-bg-deep group-[.toast]:font-black group-[.toast]:uppercase group-[.toast]:rounded-xl',
          cancelButton:
            'group-[.toast]:bg-bg-tertiary group-[.toast]:text-text-muted group-[.toast]:rounded-xl',
          success:
            'group-[.toaster]:!bg-[rgba(6,78,59,0.96)] group-[.toaster]:!border-[rgba(16,185,129,0.55)] group-[.toaster]:!text-[rgb(220,252,231)]',
          error:
            'group-[.toaster]:!bg-[rgba(127,29,29,0.96)] group-[.toaster]:!border-[rgba(248,113,113,0.58)] group-[.toaster]:!text-[rgb(254,226,226)]',
          info: 'group-[.toaster]:!bg-[rgba(12,74,110,0.96)] group-[.toaster]:!border-[rgba(56,189,248,0.58)] group-[.toaster]:!text-[rgb(224,242,254)]',
          warning:
            'group-[.toaster]:!bg-[rgba(120,53,15,0.97)] group-[.toaster]:!border-[rgba(251,191,36,0.6)] group-[.toaster]:!text-[rgb(254,243,199)]',
        },
      }}
      {...props}
    />
  )
}

export { Toaster, toast }
