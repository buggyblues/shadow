import { useUIStore } from '../../stores/ui.store'
import {
  type PreviewAttachment,
  UniversalFilePreviewPanel,
} from '../file-preview/universal-file-preview-panel'

interface FilePreviewPanelProps {
  attachment: PreviewAttachment
  onClose: () => void
  initialFullscreen?: boolean
  presentation?: 'inline' | 'overlay'
}

export function FilePreviewPanel(props: FilePreviewPanelProps) {
  const setFilePreviewOpen = useUIStore((state) => state.setFilePreviewOpen)

  return <UniversalFilePreviewPanel {...props} onOpenChange={setFilePreviewOpen} />
}
