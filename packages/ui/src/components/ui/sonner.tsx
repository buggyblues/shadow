import { Toaster as Sonner } from 'sonner'

type ToasterProps = React.ComponentProps<typeof Sonner>

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            'group toast group-[.toaster]:bg-bg-secondary group-[.toaster]:text-text-primary group-[.toaster]:border-border-subtle group-[.toaster]:shadow-[0_20px_60px_rgba(0,0,0,0.4)] group-[.toaster]:backdrop-blur-xl group-[.toaster]:rounded-[24px] group-[.toaster]:p-5',
          description:
            'group-[.toast]:text-text-muted group-[.toast]:font-bold group-[.toast]:italic',
          actionButton:
            'group-[.toast]:bg-primary group-[.toast]:text-bg-deep group-[.toast]:font-black group-[.toast]:uppercase group-[.toast]:rounded-xl',
          cancelButton:
            'group-[.toast]:bg-bg-tertiary group-[.toast]:text-text-muted group-[.toast]:rounded-xl',
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
