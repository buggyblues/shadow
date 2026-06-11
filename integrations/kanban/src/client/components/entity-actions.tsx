import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { Check, Copy, Eye, MoreHorizontal, RotateCcw, Trash2 } from 'lucide-react'
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

interface CardActionsMenuProps {
  completed?: boolean
  deleteDisabled?: boolean
  onCopyLink?: () => void
  onDelete: () => void
  onOpen?: () => void
  onToggleComplete?: () => void
}

export function CardActionsMenu(props: CardActionsMenuProps) {
  return <CardActionsMenuContent {...props} />
}

function CardActionsMenuContent(props: CardActionsMenuProps) {
  const [confirmOpen, setConfirmOpen] = useState(false)
  const stopCardOpen = (event: { stopPropagation: () => void }) => event.stopPropagation()
  return (
    <span
      className="cardActionsShell"
      data-card-action-menu="true"
      onClick={stopCardOpen}
      onDragStart={stopCardOpen}
      onKeyDown={stopCardOpen}
    >
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button
            className="cardDeleteButton"
            title={t('board.cardActions')}
            type="button"
            aria-label={t('board.cardActions')}
            draggable={false}
          >
            <MoreHorizontal aria-hidden="true" size={16} strokeWidth={2.5} />
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align="end"
            className="actionMenu"
            collisionPadding={12}
            data-card-action-menu="true"
            sideOffset={4}
            onClick={stopCardOpen}
            onDragStart={stopCardOpen}
            onKeyDown={stopCardOpen}
          >
            {props.onOpen ? (
              <DropdownMenu.Item
                className="actionMenuItem"
                onSelect={(event) => {
                  event.stopPropagation()
                  props.onOpen?.()
                }}
              >
                <Eye aria-hidden="true" size={14} strokeWidth={2.3} />
                {t('card.openDetails')}
              </DropdownMenu.Item>
            ) : null}
            {props.onToggleComplete ? (
              <DropdownMenu.Item
                className="actionMenuItem"
                onSelect={(event) => {
                  event.stopPropagation()
                  props.onToggleComplete?.()
                }}
              >
                {props.completed ? (
                  <RotateCcw aria-hidden="true" size={14} strokeWidth={2.3} />
                ) : (
                  <Check aria-hidden="true" size={14} strokeWidth={2.3} />
                )}
                {props.completed ? t('card.reopen') : t('card.markComplete')}
              </DropdownMenu.Item>
            ) : null}
            {props.onCopyLink ? (
              <DropdownMenu.Item
                className="actionMenuItem"
                onSelect={(event) => {
                  event.stopPropagation()
                  props.onCopyLink?.()
                }}
              >
                <Copy aria-hidden="true" size={14} strokeWidth={2.3} />
                {t('card.copyLink')}
              </DropdownMenu.Item>
            ) : null}
            {props.onOpen || props.onToggleComplete || props.onCopyLink ? (
              <DropdownMenu.Separator className="actionMenuSeparator" />
            ) : null}
            <DropdownMenu.Item
              className="actionMenuItem danger"
              disabled={props.deleteDisabled}
              onSelect={(event) => {
                event.preventDefault()
                event.stopPropagation()
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
        busy={props.deleteDisabled}
        onConfirm={() => {
          setConfirmOpen(false)
          props.onDelete()
        }}
        onOpenChange={setConfirmOpen}
      />
    </span>
  )
}
