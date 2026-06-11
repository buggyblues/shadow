import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { MoreHorizontal, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { t } from '../i18n.js'
import { ConfirmDialog } from './confirm-dialog.js'

export function ListActionsMenu(props: { onDelete: () => void; cardCount: number }) {
  const [confirmOpen, setConfirmOpen] = useState(false)
  return (
    <>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button className="listMenuButton" type="button" aria-label={t('board.listActions')}>
            <MoreHorizontal aria-hidden="true" size={16} strokeWidth={2.5} />
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align="end"
            className="actionMenu"
            collisionPadding={12}
            sideOffset={4}
          >
            <DropdownMenu.Item
              className="actionMenuItem danger"
              onSelect={(event) => {
                event.preventDefault()
                setConfirmOpen(true)
              }}
            >
              <Trash2 aria-hidden="true" size={14} strokeWidth={2.3} />
              {t('board.deleteList')}
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
      <ConfirmDialog
        description={
          props.cardCount > 0
            ? t('board.deleteListBodyWithCards', { count: props.cardCount })
            : t('board.deleteListBody')
        }
        open={confirmOpen}
        title={t('board.deleteListTitle')}
        onConfirm={() => {
          setConfirmOpen(false)
          props.onDelete()
        }}
        onOpenChange={setConfirmOpen}
      />
    </>
  )
}

export function CardActionsMenu(props: { onDelete: () => void }) {
  const [confirmOpen, setConfirmOpen] = useState(false)
  const stopCardOpen = (event: { stopPropagation: () => void }) => event.stopPropagation()
  return (
    <>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button
            className="cardDeleteButton"
            title={t('board.cardActions')}
            type="button"
            aria-label={t('board.cardActions')}
            onClick={stopCardOpen}
            onKeyDown={stopCardOpen}
            onMouseDown={stopCardOpen}
            onPointerDown={stopCardOpen}
          >
            <MoreHorizontal aria-hidden="true" size={16} strokeWidth={2.5} />
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align="end"
            className="actionMenu"
            collisionPadding={12}
            sideOffset={4}
            onClick={stopCardOpen}
            onKeyDown={stopCardOpen}
            onPointerDown={stopCardOpen}
          >
            <DropdownMenu.Item
              className="actionMenuItem danger"
              onSelect={(event) => {
                event.preventDefault()
                setConfirmOpen(true)
              }}
            >
              <Trash2 aria-hidden="true" size={14} strokeWidth={2.3} />
              {t('board.deleteCard')}
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
      <ConfirmDialog
        description={t('board.deleteCardBody')}
        open={confirmOpen}
        title={t('board.deleteCardTitle')}
        onConfirm={() => {
          setConfirmOpen(false)
          props.onDelete()
        }}
        onOpenChange={setConfirmOpen}
      />
    </>
  )
}
