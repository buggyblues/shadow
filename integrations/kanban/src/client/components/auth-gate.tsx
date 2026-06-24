import type { KanbanOAuthSession } from '../api.js'
import { t } from '../i18n.js'

export function hasKanbanBoardAccess(session: KanbanOAuthSession | null | undefined) {
  if (!session) return false
  return session.reason === null && session.authenticated === true
}

export function canAuthorizeKanbanOAuth(session: KanbanOAuthSession | null | undefined) {
  return (
    Boolean(session?.authorizeUrl) &&
    session?.oauthAuthenticated !== true &&
    (session?.reason === 'oauth_required' ||
      session?.reason === 'oauth_identity_mismatch' ||
      session?.required === false)
  )
}

export function shouldAutoAuthorizeKanbanOAuth(session: KanbanOAuthSession | null | undefined) {
  return (
    Boolean(session?.authorizeUrl) &&
    session?.launchAuthenticated === true &&
    session?.oauthAuthenticated !== true &&
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
  if (session.reason === 'launch_required') {
    return {
      eyebrow: t('authGate.eyebrow'),
      title: t('authGate.launchTitle'),
      body: t('authGate.launchBody'),
    }
  }
  if (session.reason === 'oauth_not_configured' || session.configured === false) {
    return {
      eyebrow: t('authGate.eyebrow'),
      title: t('authGate.configureTitle'),
      body: t('authGate.configureBody'),
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
  return (
    <section className="authGate" aria-live="polite">
      <div className="authGatePanel">
        <div className="authGateHeader">
          <span className="authGateEyebrow">{copy.eyebrow}</span>
          <h2>{copy.title}</h2>
          <p>{copy.body}</p>
        </div>
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
