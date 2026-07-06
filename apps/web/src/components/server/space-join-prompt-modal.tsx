import { Modal, ModalBody, ModalContent } from '@shadowob/ui'
import { ServerLandingPanel } from './server-landing'

type SpaceJoinPromptMode = 'public' | 'private'

export function SpaceJoinPromptModal({
  open,
  server,
  mode,
  pending,
  loading,
  onClose,
  onJoin,
}: {
  open: boolean
  server?: {
    name?: string | null
    description?: string | null
    iconUrl?: string | null
    bannerUrl?: string | null
    isPublic?: boolean
  } | null
  mode: SpaceJoinPromptMode
  pending?: boolean
  loading?: boolean
  onClose: () => void
  onJoin: () => void
}) {
  return (
    <Modal open={open} onClose={onClose}>
      <ModalContent maxWidth="max-w-4xl" className="overflow-hidden border-none bg-transparent p-0">
        <ModalBody className="p-0">
          <ServerLandingPanel
            server={server}
            mode={mode}
            pending={pending}
            loading={loading}
            onJoin={onJoin}
          />
        </ModalBody>
      </ModalContent>
    </Modal>
  )
}
