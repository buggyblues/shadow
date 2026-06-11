import * as Popover from '@radix-ui/react-popover'
import { ChevronDown, Trash2 } from 'lucide-react'
import type { FormEvent, KeyboardEvent } from 'react'
import { useEffect, useState } from 'react'
import type { BoardState, BoardSummary } from '../../types.js'
import { t } from '../i18n.js'
import { ConfirmDialog } from './confirm-dialog.js'

export function BoardMenu(props: {
  board: BoardState
  boards: BoardSummary[]
  createBoard: (title: string) => void
  deleteCurrentBoard: () => void
  updateBoard: (title: string) => void
  onSelectBoard: (board: BoardSummary) => void
}) {
  const [open, setOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [draftTitle, setDraftTitle] = useState(props.board.title)
  useEffect(() => {
    setDraftTitle(props.board.title)
  }, [props.board.boardId, props.board.projectId, props.board.title])

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const trimmed = title.trim()
    if (!trimmed) return
    props.createBoard(trimmed)
    setTitle('')
    setOpen(false)
  }
  const saveBoardTitle = () => {
    const trimmed = draftTitle.trim()
    if (!trimmed) {
      setDraftTitle(props.board.title)
      return
    }
    if (trimmed !== props.board.title) props.updateBoard(trimmed)
    setDraftTitle(trimmed)
  }
  const submitBoardTitle = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    saveBoardTitle()
    const input = event.currentTarget.elements.namedItem('boardTitle')
    if (input instanceof HTMLInputElement) input.blur()
  }
  const handleBoardTitleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Escape') return
    setDraftTitle(props.board.title)
    event.currentTarget.blur()
  }

  return (
    <div className="boardTitleControl">
      <form className="boardTitleForm" onSubmit={submitBoardTitle}>
        <input
          aria-label={t('board.titleLabel')}
          maxLength={120}
          name="boardTitle"
          onBlur={saveBoardTitle}
          onChange={(event) => setDraftTitle(event.target.value)}
          onKeyDown={handleBoardTitleKeyDown}
          value={draftTitle}
        />
      </form>
      <Popover.Root open={open} onOpenChange={setOpen}>
        <Popover.Trigger asChild>
          <button className="boardTitleButton" type="button" aria-label={t('board.openBoardMenu')}>
            <ChevronDown aria-hidden="true" className="buttonChevron" size={15} strokeWidth={2.5} />
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
              <Trash2 aria-hidden="true" size={14} strokeWidth={2.4} />
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
    </div>
  )
}
