import type { FC } from 'react'
import type { AppNavigate } from '../lib/app-navigation'

export interface CloudSaasAppProps {
  appNavigate?: AppNavigate
  embedded?: boolean
  initialPath?: string
}

export const CloudSaasApp: FC<CloudSaasAppProps>
export default CloudSaasApp
