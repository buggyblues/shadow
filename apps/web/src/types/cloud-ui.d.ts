declare module '@shadowob/cloud-ui/web-saas' {
  import type { FC } from 'react'
  import type { AppNavigate } from '@shadowob/cloud-ui/lib/app-navigation'

  export interface CloudSaasAppProps {
    appNavigate?: AppNavigate
    embedded?: boolean
    initialPath?: string
  }

  export const CloudSaasApp: FC<CloudSaasAppProps>
  export default CloudSaasApp
}
