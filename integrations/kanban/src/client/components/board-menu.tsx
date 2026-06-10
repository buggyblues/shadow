import * as Popover from '@radix-ui/react-popover'
import type { FormEvent } from 'react'
import { useState } from 'react'
import type { BoardState, BoardSummary } from '../../types.js'
import { t } from '../i18n.js'
import { ConfirmDialog } from './confirm-dialog.js'

export function BoardMenu(props: {
  board: BoardState
  boards: BoardSummary[]
  createBoard: (title: string) => void
  deleteCurrentBoard: () => void
  onSelectBoard: (board: BoardSummary) => void
}) {
  const [open, setOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [title, setTitle] = useState('')
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const trimmed = title.trim()
    if (!trimmed) return
    props.createBoard(trimmed)
    setTitle('')
    setOpen(false)
  }

  return (
    <>
      <Popover.Root open={open} onOpenChange={setOpen}>
        <Popover.Trigger asChild>
          <button className="boardTitleButton" type="button" aria-label={t('board.openBoardMenu')}>
            <span>{props.board.title}</span>
            <span className="buttonChevron" aria-hidden="true" />
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content align="start" className="boardMenu" collisionPadding={12} sideOffset={6}>
            <div className="boardMenuSectionTitle">{t('board.boards')}</div>
            <div className="boardMenuList">
              {props.boards.map((board) => (
                <button
                  className={
                    board.boardId === props.board.boardId ? 'boardMenuItem active' : 'boardMenuItem'
                  }
                  key={`${board.projectId}:${board.boardId}`}
                  type="button"
                  onClick={() => {
                    props.onSelectBoard(board)
                    setOpen(false)
                  }}
                >
                  <span>{board.title}</span>
                  <small>{t('board.cardCount', { count: board.cardCount })}</small>
                </button>
              ))}
            </div>
            <form className="boardCreateForm" onSubmit={submit}>
              <input
                maxLength={120}
                onChange={(event) => setTitle(event.target.value)}
                placeholder={t('board.newBoardPlaceholder')}
                value={title}
              />
              <button disabled={!title.trim()} type="submit">
                {t('board.createBoard')}
              </button>
            </form>
            <button className="dangerTextButton" type="button" onClick={() => setConfirmOpen(true)}>
              {t('board.deleteBoard')}
            </button>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
      <ConfirmDialog
        description={t('board.deleteBoardBody')}
        open={confirmOpen}
        title={t('board.deleteBoardTitle')}
        onConfirm={() => {
          setConfirmOpen(false)
          setOpen(false)
          props.deleteCurrentBoard()
        }}
        onOpenChange={setConfirmOpen}
      />
    </>
  )
}
