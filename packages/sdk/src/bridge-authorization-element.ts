export interface ShadowSpaceAppAuthorizeElementData {
  appName?: string
  appLogoUrl?: string | null
  appOrigin?: string | null
  title?: string
  subtitle?: string
  permissionsLabel?: string
  approveLabel?: string
  denyLabel?: string
  approvingLabel?: string
  loading?: boolean
  approving?: boolean
  error?: string | null
  scopes?: string[]
  scopeLabels?: Record<string, string>
}

const defaultScopeLabels: Record<string, string> = {
  'user:read': 'Read your basic profile',
  'user:email': 'Read your email address',
  'servers:read': 'Read server information',
  'servers:write': 'Manage server information',
  'channels:read': 'Read channels',
  'channels:write': 'Manage channels',
  'messages:read': 'Read messages',
  'messages:write': 'Send and manage messages',
  'attachments:read': 'Read attachments',
  'attachments:write': 'Upload and manage attachments',
  'workspaces:read': 'Read workspace files',
  'workspaces:write': 'Manage workspace files',
  'buddies:create': 'Create Buddies',
  'buddies:manage': 'Manage Buddies',
  'commerce:read': 'Read commerce data',
  'commerce:write': 'Manage commerce data',
}

function boolAttr(value: string | null) {
  return value === '' || value === 'true'
}

function splitScopes(value: string | null | undefined) {
  return (value ?? 'user:read')
    .split(/\s+/u)
    .map((scope) => scope.trim())
    .filter(Boolean)
}

function escapeHtml(value: unknown) {
  return String(value ?? '').replace(/[&<>"']/gu, (char) => {
    switch (char) {
      case '&':
        return '&amp;'
      case '<':
        return '&lt;'
      case '>':
        return '&gt;'
      case '"':
        return '&quot;'
      case "'":
        return '&#39;'
      default:
        return char
    }
  })
}

export function defineShadowSpaceAppAuthorizeElement(
  tagName = 'shadow-space-app-authorize',
): CustomElementConstructor | null {
  if (typeof window === 'undefined' || typeof HTMLElement === 'undefined') return null
  if (!window.customElements) return null
  const existing = window.customElements.get(tagName)
  if (existing) return existing

  class ShadowSpaceAppAuthorizeElement extends HTMLElement {
    static observedAttributes = [
      'app-name',
      'app-logo-url',
      'app-origin',
      'title',
      'subtitle',
      'permissions-label',
      'approve-label',
      'deny-label',
      'approving-label',
      'loading',
      'approving',
      'error',
      'scopes',
    ]

    private dataValue: ShadowSpaceAppAuthorizeElementData = {}

    constructor() {
      super()
      this.attachShadow({ mode: 'open' })
    }

    set data(value: ShadowSpaceAppAuthorizeElementData) {
      this.dataValue = value
      this.render()
    }

    get data() {
      return this.dataValue
    }

    connectedCallback() {
      this.render()
    }

    attributeChangedCallback() {
      this.render()
    }

    private value(name: string, fallback = '') {
      return this.getAttribute(name) ?? fallback
    }

    private mergedData(): Required<Omit<ShadowSpaceAppAuthorizeElementData, 'scopeLabels'>> & {
      scopeLabels: Record<string, string>
    } {
      return {
        appName: this.dataValue.appName ?? this.value('app-name', 'Application'),
        appLogoUrl: this.dataValue.appLogoUrl ?? this.getAttribute('app-logo-url'),
        appOrigin: this.dataValue.appOrigin ?? this.getAttribute('app-origin'),
        title: this.dataValue.title ?? this.value('title', 'Authorize application'),
        subtitle:
          this.dataValue.subtitle ??
          this.value('subtitle', 'This application is requesting access to your Shadow account.'),
        permissionsLabel:
          this.dataValue.permissionsLabel ?? this.value('permissions-label', 'Requested access'),
        approveLabel: this.dataValue.approveLabel ?? this.value('approve-label', 'Authorize'),
        denyLabel: this.dataValue.denyLabel ?? this.value('deny-label', 'Deny'),
        approvingLabel:
          this.dataValue.approvingLabel ?? this.value('approving-label', 'Authorizing'),
        loading: this.dataValue.loading ?? boolAttr(this.getAttribute('loading')),
        approving: this.dataValue.approving ?? boolAttr(this.getAttribute('approving')),
        error: this.dataValue.error ?? this.getAttribute('error'),
        scopes: this.dataValue.scopes ?? splitScopes(this.getAttribute('scopes')),
        scopeLabels: { ...defaultScopeLabels, ...(this.dataValue.scopeLabels ?? {}) },
      }
    }

    private render() {
      if (!this.shadowRoot) return
      const data = this.mergedData()
      const initial = escapeHtml(data.appName[0]?.toUpperCase() ?? 'A')
      const scopes = data.scopes.length ? data.scopes : ['user:read']
      const logoUrl = data.appLogoUrl ? escapeHtml(data.appLogoUrl) : null
      const title = escapeHtml(data.title)
      this.shadowRoot.innerHTML = `
        <style>
          :host {
            display: block;
            color: #f8fafc;
            font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", sans-serif;
          }
          .card {
            width: min(460px, calc(100vw - 48px));
            border: 1px solid rgba(255, 255, 255, 0.14);
            border-radius: 24px;
            background:
              linear-gradient(180deg, rgba(20, 24, 33, 0.96), rgba(11, 15, 23, 0.98)),
              #0b0f17;
            box-shadow: 0 28px 90px rgba(0, 0, 0, 0.48);
            overflow: hidden;
          }
          .top {
            padding: 24px 24px 18px;
            text-align: center;
          }
          .logo {
            width: 54px;
            height: 54px;
            margin: 0 auto 14px;
            display: grid;
            place-items: center;
            border-radius: 16px;
            background: rgba(255, 255, 255, 0.1);
            border: 1px solid rgba(255, 255, 255, 0.12);
            color: white;
            font-weight: 900;
            overflow: hidden;
          }
          .logo img {
            width: 100%;
            height: 100%;
            object-fit: cover;
          }
          h2 {
            margin: 0;
            font-size: 20px;
            line-height: 1.15;
            letter-spacing: 0;
            font-weight: 850;
          }
          .subtitle {
            margin: 8px auto 0;
            max-width: 34ch;
            color: rgba(248, 250, 252, 0.68);
            font-size: 13px;
            line-height: 1.55;
            font-weight: 600;
          }
          .app {
            display: flex;
            gap: 12px;
            align-items: center;
            margin: 0 20px 18px;
            padding: 14px;
            border-radius: 16px;
            background: rgba(255, 255, 255, 0.07);
          }
          .app-name {
            min-width: 0;
            font-size: 14px;
            font-weight: 800;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }
          .app-origin {
            margin-top: 3px;
            min-width: 0;
            color: rgba(248, 250, 252, 0.52);
            font-size: 12px;
            font-weight: 650;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }
          .body {
            padding: 0 24px 22px;
          }
          .label {
            margin: 0 0 10px;
            color: rgba(248, 250, 252, 0.7);
            font-size: 13px;
            font-weight: 750;
          }
          ul {
            list-style: none;
            margin: 0;
            padding: 0;
            display: grid;
            gap: 8px;
          }
          li {
            display: flex;
            align-items: center;
            gap: 9px;
            color: rgba(248, 250, 252, 0.88);
            font-size: 13px;
            font-weight: 650;
          }
          .check {
            width: 20px;
            height: 20px;
            flex: 0 0 auto;
            display: grid;
            place-items: center;
            border-radius: 999px;
            background: rgba(52, 211, 153, 0.16);
            color: #34d399;
            font-size: 13px;
            font-weight: 950;
          }
          .error {
            margin: 0 24px 16px;
            padding: 11px 12px;
            border: 1px solid rgba(248, 113, 113, 0.28);
            border-radius: 14px;
            background: rgba(248, 113, 113, 0.1);
            color: #fecaca;
            font-size: 13px;
            font-weight: 700;
          }
          .actions {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 10px;
            padding: 0 24px 24px;
          }
          button {
            min-height: 44px;
            border: 0;
            border-radius: 14px;
            font: inherit;
            font-size: 14px;
            font-weight: 850;
            cursor: pointer;
          }
          button:disabled {
            cursor: default;
            opacity: 0.56;
          }
          .deny {
            color: #f8fafc;
            background: rgba(255, 255, 255, 0.09);
          }
          .approve {
            color: #061018;
            background: #f8fafc;
          }
          .loading {
            display: grid;
            min-height: 180px;
            place-items: center;
          }
          .spinner {
            width: 24px;
            height: 24px;
            border-radius: 999px;
            border: 3px solid rgba(255, 255, 255, 0.16);
            border-top-color: #f8fafc;
            animation: spin 0.8s linear infinite;
          }
          @keyframes spin { to { transform: rotate(360deg); } }
        </style>
        <section class="card" role="dialog" aria-modal="true" aria-label="${title}">
          <div class="top">
            <div class="logo">
              ${logoUrl ? `<img alt="" src="${logoUrl}" />` : `<span>${initial}</span>`}
            </div>
            <h2>${title}</h2>
            <p class="subtitle">${escapeHtml(data.subtitle)}</p>
          </div>
          ${
            data.loading
              ? '<div class="loading"><div class="spinner"></div></div>'
              : `
                <div class="app">
                  <div class="logo" style="width:42px;height:42px;margin:0;border-radius:13px">
                    ${logoUrl ? `<img alt="" src="${logoUrl}" />` : `<span>${initial}</span>`}
                  </div>
                  <div style="min-width:0">
                    <div class="app-name">${escapeHtml(data.appName)}</div>
                    ${
                      data.appOrigin
                        ? `<div class="app-origin">${escapeHtml(data.appOrigin)}</div>`
                        : ''
                    }
                  </div>
                </div>
                ${data.error ? `<div class="error">${escapeHtml(data.error)}</div>` : ''}
                <div class="body">
                  <p class="label">${escapeHtml(data.permissionsLabel)}</p>
                  <ul>
                    ${scopes
                      .map(
                        (scope) =>
                          `<li><span class="check">✓</span><span>${escapeHtml(
                            data.scopeLabels[scope] ?? scope,
                          )}</span></li>`,
                      )
                      .join('')}
                  </ul>
                </div>
                <div class="actions">
                  <button class="deny" ${data.approving ? 'disabled' : ''}>${escapeHtml(
                    data.denyLabel,
                  )}</button>
                  <button class="approve" ${data.approving ? 'disabled' : ''}>${
                    data.approving ? escapeHtml(data.approvingLabel) : escapeHtml(data.approveLabel)
                  }</button>
                </div>
              `
          }
        </section>
      `
      this.shadowRoot
        .querySelector('.approve')
        ?.addEventListener('click', () => this.emit('shadow-authorize-approve'))
      this.shadowRoot
        .querySelector('.deny')
        ?.addEventListener('click', () => this.emit('shadow-authorize-deny'))
    }

    private emit(type: string) {
      this.dispatchEvent(new CustomEvent(type, { bubbles: true, composed: true }))
    }
  }

  window.customElements.define(tagName, ShadowSpaceAppAuthorizeElement)
  return ShadowSpaceAppAuthorizeElement
}
