import { act, renderHook } from '@testing-library/react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { OsDesktopRemoteWidget } from '../types'
import { useWidgetTransformEditor } from './widget-controls'

function pointerEvent<Element extends HTMLElement>({
  currentTarget,
  clientX,
  clientY,
}: {
  currentTarget: Element
  clientX: number
  clientY: number
}) {
  return {
    button: 0,
    pointerId: 1,
    clientX,
    clientY,
    currentTarget,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  } as unknown as ReactPointerEvent<Element>
}

describe('useWidgetTransformEditor', () => {
  const widget: OsDesktopRemoteWidget = {
    id: 'exchange-rate',
    kind: 'remote-widget',
    sourceId: 'travel.exchange-rate',
    x: 80,
    y: 120,
    widthCells: 4,
    heightCells: 3,
    rotation: 0,
  }

  it('ignores direct movement until layout editing starts', () => {
    const onMove = vi.fn()
    const target = document.createElement('div')
    target.setPointerCapture = vi.fn()
    const { result } = renderHook(() =>
      useWidgetTransformEditor({
        widget,
        editable: true,
        onMove,
        onResize: vi.fn(),
        onRotate: vi.fn(),
      }),
    )

    act(() =>
      result.current.handleDragStart(
        pointerEvent({ currentTarget: target, clientX: 100, clientY: 140 }),
      ),
    )
    act(() =>
      result.current.handleDragMove(
        pointerEvent({ currentTarget: target, clientX: 180, clientY: 220 }),
      ),
    )
    act(() =>
      result.current.handleDragEnd(
        pointerEvent({ currentTarget: target, clientX: 180, clientY: 220 }),
      ),
    )

    expect(onMove).not.toHaveBeenCalled()
    expect(target.setPointerCapture).not.toHaveBeenCalled()

    act(() => result.current.beginTransformEdit())
    act(() =>
      result.current.handleDragStart(
        pointerEvent({ currentTarget: target, clientX: 100, clientY: 140 }),
      ),
    )
    act(() =>
      result.current.handleDragMove(
        pointerEvent({ currentTarget: target, clientX: 180, clientY: 220 }),
      ),
    )
    act(() =>
      result.current.handleDragEnd(
        pointerEvent({ currentTarget: target, clientX: 180, clientY: 220 }),
      ),
    )

    expect(onMove).toHaveBeenCalledTimes(1)
    expect(target.setPointerCapture).toHaveBeenCalledWith(1)
  })

  it('applies each widget size constraints through the shared controller', () => {
    const onResize = vi.fn()
    const target = document.createElement('button')
    target.setPointerCapture = vi.fn()
    const { result } = renderHook(() =>
      useWidgetTransformEditor({
        widget,
        editable: true,
        onMove: vi.fn(),
        onResize,
        onRotate: vi.fn(),
        constraints: {
          minWidthCells: 3,
          maxWidthCells: 6,
          minHeightCells: 2,
          maxHeightCells: 5,
        },
      }),
    )

    act(() => result.current.beginTransformEdit())
    act(() =>
      result.current.handleResizeStart(
        pointerEvent({ currentTarget: target, clientX: 100, clientY: 100 }),
      ),
    )
    act(() =>
      result.current.handleResizeMove(
        pointerEvent({ currentTarget: target, clientX: 1000, clientY: 1000 }),
      ),
    )
    act(() =>
      result.current.handleResizeEnd(
        pointerEvent({ currentTarget: target, clientX: 1000, clientY: 1000 }),
      ),
    )

    expect(onResize).toHaveBeenCalledWith(widget.id, {
      widthCells: 6,
      heightCells: 5,
    })
  })
})
