import type {
  ShadowWidgetCatalogEntry,
  ShadowWidgetDataResponse,
  ShadowWidgetDefinition,
  ShadowWidgetViewNode,
} from '@shadowob/shared'
import { resolveShadowWidgetValue } from '@shadowob/shared'
import {
  Button,
  Modal,
  ModalBody,
  ModalButtonGroup,
  ModalContent,
  ModalFooter,
  ModalHeader,
} from '@shadowob/ui'
import { useQuery } from '@tanstack/react-query'
import { SlidersHorizontal } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { fetchApi } from '../../../lib/api'
import type { OsDesktopRemoteWidget } from '../types'
import { DESKTOP_CELL_HEIGHT, DESKTOP_CELL_WIDTH } from './geometry'
import {
  type OsWidgetLayerDirection,
  OsWidgetResizeHandle,
  OsWidgetRotateHandle,
  OsWidgetToolbar,
  useWidgetTransformEditor,
  widgetActiveZIndex,
  widgetZIndex,
} from './widget-controls'

type ShadowWidgetViewElement = HTMLElement & {
  setContent: (
    definition: ShadowWidgetDefinition,
    data: Record<string, unknown> | null,
    state: 'loading' | 'ready' | 'error',
    message: string,
  ) => void
}

const SHADOW_WIDGET_STYLES = `
  :host { display: block; width: 100%; height: 100%; color: #f8fafc; }
  * { box-sizing: border-box; }
  .surface { container-type: inline-size; width: 100%; height: 100%; overflow: auto; padding: 18px; font-family: ui-sans-serif, system-ui, sans-serif; }
  .stack, .row, .grid { display: flex; min-width: 0; }
  .stack { flex-direction: column; }
  .row { flex-direction: row; flex-wrap: wrap; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(var(--min-column, 128px), 1fr)); }
  .gap-none { gap: 0; } .gap-sm { gap: 6px; } .gap-md { gap: 12px; } .gap-lg { gap: 18px; }
  .align-start { align-items: flex-start; } .align-center { align-items: center; }
  .align-end { align-items: flex-end; } .align-stretch { align-items: stretch; }
  .text { min-width: 0; overflow-wrap: anywhere; }
  .title { font-size: 17px; font-weight: 800; letter-spacing: -0.02em; }
  .body { font-size: 13px; line-height: 1.5; }
  .label { font-size: 11px; font-weight: 750; letter-spacing: .08em; text-transform: uppercase; }
  .caption { font-size: 11px; line-height: 1.4; }
  .value { font-size: clamp(24px, 14cqi, 52px); font-weight: 850; line-height: 1; letter-spacing: -0.055em; font-variant-numeric: tabular-nums; }
  .tone-muted { color: rgba(226,232,240,.62); } .tone-accent { color: #a5b4fc; }
  .tone-positive { color: #6ee7b7; } .tone-warning { color: #fde68a; } .tone-danger { color: #fda4af; }
  .metric { display: grid; gap: 5px; min-width: 0; padding: 12px; border: 1px solid rgba(255,255,255,.09); border-radius: 14px; background: rgba(255,255,255,.045); }
  .metric-label { font-size: 10px; font-weight: 760; letter-spacing: .07em; text-transform: uppercase; color: rgba(226,232,240,.6); }
  .metric-value { font-size: clamp(20px, 10cqi, 38px); font-weight: 850; line-height: 1.05; letter-spacing: -.045em; font-variant-numeric: tabular-nums; }
  .metric-detail { font-size: 11px; line-height: 1.35; color: rgba(226,232,240,.6); }
  .badge { width: fit-content; border-radius: 999px; padding: 5px 9px; background: rgba(165,180,252,.14); font-size: 10px; font-weight: 760; }
  .divider { height: 1px; width: 100%; background: rgba(255,255,255,.09); }
  .spacer { flex: 1 1 8px; min-height: 8px; }
  .state { display: grid; min-height: 100%; place-items: center; padding: 16px; color: rgba(226,232,240,.62); font-size: 12px; text-align: center; }
  @container (max-width: 260px) { .surface { padding: 13px; } .row { flex-direction: column; } .metric { padding: 10px; } }
`

function appendTextNode(
  parent: HTMLElement,
  node: ShadowWidgetViewNode,
  data: Record<string, unknown>,
  strings: Record<string, string>,
) {
  if (node.type === 'divider' || node.type === 'spacer') {
    const element = document.createElement('div')
    element.className = node.type
    parent.append(element)
    return
  }

  if (node.type === 'stack' || node.type === 'row' || node.type === 'grid') {
    const element = document.createElement('div')
    element.className = `${node.type} gap-${node.gap ?? 'md'}`
    if ('align' in node && node.align) element.classList.add(`align-${node.align}`)
    if (node.type === 'grid') {
      element.style.setProperty('--min-column', `${node.minColumnWidth ?? 128}px`)
    }
    for (const child of node.children) appendTextNode(element, child, data, strings)
    parent.append(element)
    return
  }

  if (node.type === 'metric') {
    const element = document.createElement('div')
    element.className = `metric tone-${node.tone ?? 'default'}`
    const label = document.createElement('div')
    label.className = 'metric-label'
    label.textContent = resolveShadowWidgetValue(node.label, data, strings)
    const value = document.createElement('div')
    value.className = 'metric-value'
    value.textContent = resolveShadowWidgetValue(node.value, data, strings)
    element.append(label, value)
    if (node.detail) {
      const detail = document.createElement('div')
      detail.className = 'metric-detail'
      detail.textContent = resolveShadowWidgetValue(node.detail, data, strings)
      element.append(detail)
    }
    parent.append(element)
    return
  }

  if (node.type !== 'badge' && node.type !== 'text') return

  const element = document.createElement('div')
  if (node.type === 'badge') {
    element.className = `badge tone-${node.tone ?? 'default'}`
  } else {
    element.className = `text ${node.variant ?? 'body'} tone-${node.tone ?? 'default'}`
  }
  element.textContent = resolveShadowWidgetValue(node.value, data, strings)
  parent.append(element)
}

function ensureShadowWidgetElement() {
  if (typeof customElements === 'undefined' || customElements.get('shadow-widget-view')) return
  class ShadowWidgetElement extends HTMLElement implements ShadowWidgetViewElement {
    private readonly widgetRoot = this.attachShadow({ mode: 'closed' })

    setContent(
      definition: ShadowWidgetDefinition,
      data: Record<string, unknown> | null,
      state: 'loading' | 'ready' | 'error',
      message: string,
    ) {
      this.widgetRoot.replaceChildren()
      const style = document.createElement('style')
      style.textContent = SHADOW_WIDGET_STYLES
      this.widgetRoot.append(style)
      if (state !== 'ready' || !data) {
        const status = document.createElement('div')
        status.className = 'state'
        status.textContent = message
        this.widgetRoot.append(status)
        return
      }
      const surface = document.createElement('div')
      surface.className = 'surface'
      appendTextNode(surface, definition.view, data, definition.strings ?? {})
      this.widgetRoot.append(surface)
    }
  }
  customElements.define('shadow-widget-view', ShadowWidgetElement)
}

function ShadowWidgetView({
  definition,
  data,
  state,
  message,
}: {
  definition: ShadowWidgetDefinition
  data: Record<string, unknown> | null
  state: 'loading' | 'ready' | 'error'
  message: string
}) {
  const hostRef = useRef<HTMLDivElement>(null)
  const elementRef = useRef<ShadowWidgetViewElement | null>(null)

  useEffect(() => {
    ensureShadowWidgetElement()
    if (!hostRef.current) return
    const element = document.createElement('shadow-widget-view') as ShadowWidgetViewElement
    element.style.width = '100%'
    element.style.height = '100%'
    hostRef.current.replaceChildren(element)
    elementRef.current = element
    return () => {
      elementRef.current = null
      element.remove()
    }
  }, [])

  useEffect(() => {
    elementRef.current?.setContent(definition, data, state, message)
  }, [data, definition, message, state])

  return <div ref={hostRef} className="h-full w-full" />
}

function RemoteWidgetOptionsModal({
  entry,
  options,
  open,
  onClose,
  onSave,
}: {
  entry: ShadowWidgetCatalogEntry
  options: Record<string, string>
  open: boolean
  onClose: () => void
  onSave: (options: Record<string, string>) => void
}) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState(options)

  useEffect(() => setDraft(options), [options])

  return (
    <Modal open={open} onClose={onClose}>
      <ModalContent className="z-[900] w-[min(92vw,460px)]">
        <ModalHeader
          icon={<SlidersHorizontal size={18} />}
          title={t('os.configureRemoteWidget', { name: entry.definition.title })}
          closeLabel={t('common.close')}
        />
        <ModalBody className="space-y-4 py-5">
          {(entry.definition.options ?? []).map((option) => (
            <label key={option.key} className="grid gap-2">
              <span className="text-xs font-black uppercase tracking-widest text-text-muted/70">
                {option.label}
              </span>
              <select
                value={draft[option.key] ?? option.defaultValue}
                className="h-11 w-full rounded-xl border border-border-subtle bg-bg-tertiary px-3 text-sm font-bold text-text-primary outline-none transition hover:border-primary/35 focus:border-primary/70"
                onChange={(event) => {
                  const value = event.currentTarget.value
                  setDraft((current) => ({
                    ...current,
                    [option.key]: value,
                  }))
                }}
              >
                {option.choices.map((choice) => (
                  <option key={choice.value} value={choice.value} className="bg-bg-primary">
                    {choice.label}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </ModalBody>
        <ModalFooter>
          <ModalButtonGroup>
            <Button type="button" variant="ghost" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button type="button" variant="primary" onClick={() => onSave(draft)}>
              {t('common.save')}
            </Button>
          </ModalButtonGroup>
        </ModalFooter>
      </ModalContent>
    </Modal>
  )
}

export function OsRemoteWidget({
  widget,
  entry,
  serverId,
  editable,
  wallpaperInteractive,
  onMove,
  onResize,
  onRotate,
  onUpdate,
  onDelete,
  onChangeLayer,
}: {
  widget: OsDesktopRemoteWidget
  entry: ShadowWidgetCatalogEntry | undefined
  serverId: string
  editable: boolean
  wallpaperInteractive: boolean
  onMove: (id: string, point: { x: number; y: number }) => void
  onResize: (id: string, size: { widthCells: number; heightCells: number }) => void
  onRotate: (id: string, rotation: number) => void
  onUpdate: (id: string, options: Record<string, string>) => void
  onDelete: (id: string) => void
  onChangeLayer: (id: string, direction: OsWidgetLayerDirection) => void
}) {
  const { t } = useTranslation()
  const [configuring, setConfiguring] = useState(false)
  const options = widget.options ?? {}
  const dataQuery = useQuery({
    queryKey: ['remote-widget-data', serverId, widget.sourceId, options],
    queryFn: () =>
      fetchApi<ShadowWidgetDataResponse>(
        `/api/servers/${serverId}/widgets/${encodeURIComponent(widget.sourceId)}/data`,
        { method: 'POST', body: JSON.stringify({ options }) },
      ),
    enabled: Boolean(entry),
    refetchInterval: entry?.definition.data.refreshIntervalSeconds
      ? Math.max(15, entry.definition.data.refreshIntervalSeconds) * 1000
      : false,
    staleTime: 10_000,
  })
  const minSize = entry?.definition.size.min
  const maxSize = entry?.definition.size.max
  const {
    transformEditing,
    beginTransformEdit,
    applyTransformEdit,
    cancelTransformEdit,
    currentX,
    currentY,
    currentWidthCells,
    currentHeightCells,
    currentRotation,
    handleDragStart,
    handleDragMove,
    handleDragEnd,
    handleResizeStart,
    handleResizeMove,
    handleResizeEnd,
    handleRotateStart,
    handleRotateMove,
    handleRotateEnd,
  } = useWidgetTransformEditor({
    widget,
    editable,
    onMove,
    onResize,
    onRotate,
    constraints: {
      minWidthCells: minSize?.widthCells,
      maxWidthCells: maxSize?.widthCells,
      minHeightCells: minSize?.heightCells,
      maxHeightCells: maxSize?.heightCells,
    },
  })
  const message = !entry
    ? t('os.remoteWidgetUnavailable')
    : dataQuery.isError
      ? t('os.remoteWidgetLoadFailed')
      : t('common.loading')
  const state = !entry || dataQuery.isError ? 'error' : dataQuery.data ? 'ready' : 'loading'
  const data = dataQuery.data?.data ?? null
  const actions = useMemo(
    () => [
      ...((entry?.definition.options?.length ?? 0) > 0
        ? [{ label: t('os.remoteWidgetConfigure'), onClick: () => setConfiguring(true) }]
        : []),
      { label: t('os.remoteWidgetRefresh'), onClick: () => void dataQuery.refetch() },
      { label: t('common.delete'), onClick: () => onDelete(widget.id), danger: true },
    ],
    [dataQuery.refetch, entry?.definition.options?.length, onDelete, t, widget.id],
  )

  return (
    <>
      <section
        className="group pointer-events-auto absolute overflow-visible rounded-[22px] border border-white/12 bg-slate-950/82 shadow-[0_18px_55px_rgba(0,0,0,.32)] backdrop-blur-2xl"
        style={{
          left: currentX,
          top: currentY,
          width: currentWidthCells * DESKTOP_CELL_WIDTH - 12,
          height: currentHeightCells * DESKTOP_CELL_HEIGHT - 12,
          zIndex: transformEditing ? widgetActiveZIndex(widget) : widgetZIndex(widget),
          transform: `rotate(${currentRotation}deg)`,
        }}
      >
        <OsWidgetToolbar
          title={entry?.definition.title ?? t('os.remoteWidget')}
          editable={editable}
          transformEditing={transformEditing}
          onBeginTransformEdit={beginTransformEdit}
          onApplyTransformEdit={applyTransformEdit}
          onCancelTransformEdit={cancelTransformEdit}
          onChangeLayer={(direction) => onChangeLayer(widget.id, direction)}
          actions={actions}
        />
        {transformEditing ? (
          <button
            type="button"
            className="absolute inset-x-0 top-0 z-10 h-7 cursor-grab rounded-t-[22px] bg-gradient-to-b from-white/5 to-transparent active:cursor-grabbing"
            aria-label={t('os.moveWidget')}
            onPointerDown={handleDragStart}
            onPointerMove={handleDragMove}
            onPointerUp={handleDragEnd}
            onPointerCancel={handleDragEnd}
          />
        ) : null}
        <div className={wallpaperInteractive ? 'pointer-events-none h-full' : 'h-full'}>
          {entry ? (
            <ShadowWidgetView
              definition={entry.definition}
              data={data}
              state={state}
              message={message}
            />
          ) : (
            <div className="grid h-full place-items-center p-4 text-center text-xs text-white/55">
              {message}
            </div>
          )}
        </div>
        <OsWidgetResizeHandle
          editable={transformEditing}
          label={t('os.resizeWidget')}
          onPointerDown={handleResizeStart}
          onPointerMove={handleResizeMove}
          onPointerUp={handleResizeEnd}
          onPointerCancel={handleResizeEnd}
        />
        <OsWidgetRotateHandle
          editable={transformEditing}
          label={t('os.rotateWidget')}
          onPointerDown={handleRotateStart}
          onPointerMove={handleRotateMove}
          onPointerUp={handleRotateEnd}
          onPointerCancel={handleRotateEnd}
        />
      </section>
      {configuring && entry ? (
        <RemoteWidgetOptionsModal
          entry={entry}
          options={options}
          open
          onClose={() => setConfiguring(false)}
          onSave={(next) => {
            onUpdate(widget.id, next)
            setConfiguring(false)
          }}
        />
      ) : null}
    </>
  )
}
