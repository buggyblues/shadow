import { Toaster as SonnerToaster } from '@shadowob/ui'

export function Toaster() {
  return (
    <SonnerToaster
      position="bottom-right"
      offset={20}
      visibleToasts={3}
      expand={false}
      richColors
      closeButton
    />
  )
}
