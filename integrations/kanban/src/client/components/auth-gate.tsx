import type { BoardState } from '../../types.js'
import type { KanbanOAuthSession } from '../api.js'
import { t } from '../i18n.js'
import { launchActorLabel, oauthProfileLabel, shortId } from '../identity.js'
import { initialBoardScope } from '../query-keys.js'

export function hasKanbanBoardAccess(session: KanbanOAuthSession | null | undefined) {
  if (!session) return false
  return session.required === false || session.authenticated === true
}

export function canAuthorizeKanbanOAuth(session: KanbanOAuthSession | null | undefined) {
  return (
    Boolean(session?.authorizeUrl) &&
    session?.authenticated !== true &&
    (session?.reason === 'oauth_required' || session?.reason === 'oauth_identity_mismatch')
  )
}

function authGateCopy(session: KanbanOAuthSession | null, error: string | null) {
  if (error) {
    return {
      eyebrow: t('authGate.eyebrow'),
      title: t('authGate.errorTitle'),
      body: error,
    }
  }
  if (!session) {
    return {
      eyebrow: t('authGate.eyebrow'),
      title: t('authGate.checkingTitle'),
      body: t('authGate.checkingBody'),
    }
  }
  if (session.required === false) {
    return {
      eyebrow: t('authGate.eyebrow'),
      title: t('authGate.localTitle'),
      body: t('authGate.localBody'),
    }
  }
  if (session.reason === 'oauth_not_configured' || session.configured === false) {
    return {
      eyebrow: t('authGate.eyebrow'),
      title: t('authGate.configureTitle'),
      body: t('authGate.configureBody'),
    }
  }
  if (session.reason === 'launch_required') {
    return {
      eyebrow: t('authGate.eyebrow'),
      title: t('authGate.launchTitle'),
      body: t('authGate.launchBody'),
    }
  }
  if (session.reason === 'oauth_identity_mismatch') {
    return {
      eyebrow: t('authGate.eyebrow'),
      title: t('authGate.mismatchTitle'),
      body: t('authGate.mismatchBody'),
    }
  }
  return {
    eyebrow: t('authGate.eyebrow'),
    title: t('authGate.authorizeTitle'),
    body: t('authGate.authorizeBody'),
  }
}

export function AuthGate(props: {
  error: string | null
  loading: boolean
  oauthPopupOpen: boolean
  session: KanbanOAuthSession | null
  onAuthorize: () => void
  onRefresh: () => void
}) {
  const copy = props.loading
    ? {
        eyebrow: t('authGate.eyebrow'),
        title: t('authGate.checkingTitle'),
        body: t('authGate.checkingBody'),
      }
    : authGateCopy(props.session, props.error)
  const canAuthorize = canAuthorizeKanbanOAuth(props.session)
  const launch = props.session?.launch
  return (
    <section className="authGate" aria-live="polite">
      <div className="authGatePanel">
        <div className="authGateHeader">
          <span className="authGateEyebrow">{copy.eyebrow}</span>
          <h2>{copy.title}</h2>
          <p>{copy.body}</p>
        </div>
        {launch ? (
          <dl className="authGateContext">
            <div>
              <dt>{t('session.server')}</dt>
              <dd>{shortId(launch.serverId)}</dd>
            </div>
            <div>
              <dt>{t('session.actor')}</dt>
              <dd>{launchActorLabel(launch.actor)}</dd>
            </div>
          </dl>
        ) : null}
        <div className="authGateActions">
          {canAuthorize ? (
            <button
              className="primary"
              disabled={props.oauthPopupOpen}
              type="button"
              onClick={props.onAuthorize}
            >
              {props.oauthPopupOpen ? t('authGate.waitingButton') : t('authGate.authorizeButton')}
            </button>
          ) : null}
          <button className="secondary" type="button" onClick={props.onRefresh}>
            {t('board.refresh')}
          </button>
        </div>
        {props.session?.reason === 'oauth_identity_mismatch' ? (
          <p className="authGateNote">{t('authGate.mismatchNote')}</p>
        ) : null}
      </div>
    </section>
  )
}

export function SessionStrip(props: {
  board: BoardState | null
  error: string | null
  loading: boolean
  oauthPopupOpen: boolean
  session: KanbanOAuthSession | null
  onAuthorize: () => void
}) {
  const session = props.session
  const scope = {
    projectId: props.board?.projectId ?? initialBoardScope.projectId ?? 'default',
    boardId: props.board?.boardId ?? initialBoardScope.boardId ?? 'kanban',
  }
  const serverId = session?.launch?.serverId ?? props.board?.serverId ?? 'local'
  const oauthLabel = session?.profile ? oauthProfileLabel(session.profile) : null
  const actorLabel = session?.launch ? launchActorLabel(session.launch.actor) : null
  return (
    <div className="sessionStrip">
      <span className="contextChip">
        {t('session.server')} <strong>{shortId(serverId)}</strong>
      </span>
      <span className="contextChip">
        {t('session.board')}{' '}
        <strong>
          {scope.projectId}/{scope.boardId}
        </strong>
      </span>
      {props.loading ? (
        <span className="contextChip muted">{t('session.checkingOAuth')}</span>
      ) : null}
      {props.error ? <span className="contextChip warning">{t('session.oauthError')}</span> : null}
      {oauthLabel ? (
        <span className="contextChip">
          {t('session.oauth')} <strong>{oauthLabel}</strong>
        </span>
      ) : session?.configured ? (
        <button className="authButton" type="button" onClick={props.onAuthorize}>
          {props.oauthPopupOpen ? t('session.waitingOAuth') : t('session.authorizeShadow')}
        </button>
      ) : (
        <span className="contextChip muted">{t('session.oauthNotConfigured')}</span>
      )}
      {actorLabel ? (
        <span className="contextChip">
          {t('session.actor')} <strong>{actorLabel}</strong>
        </span>
      ) : (
        <span className="contextChip muted">{t('session.noLaunch')}</span>
      )}
    </div>
  )
}
