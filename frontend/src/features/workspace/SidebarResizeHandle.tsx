import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { cn } from '@/lib/utils'

const KEYBOARD_STEP = 16
const KEYBOARD_STEP_LARGE = 64
const DRAG_BODY_CLASSES = ['cursor-col-resize', 'select-none']

type SidebarResizeHandleProps = {
  /** Id of the sidebar element this handle resizes. */
  controls: string
  label: string
  width: number
  min: number
  max: number
  /** Width restored on double-click. */
  defaultWidth: number
  onResize: (width: number, options?: { persist?: boolean }) => void
}

type Drag = { pointerId: number; startX: number; startWidth: number; width: number }

/**
 * Vertical separator between the sidebar and the main content. Drag it with a pointer, or focus it and use the arrow
 * keys, Home, and End. Double-click restores the default width.
 */
export function SidebarResizeHandle({ controls, label, width, min, max, defaultWidth, onResize }: SidebarResizeHandleProps) {
  const drag = useRef<Drag | null>(null)
  const [dragging, setDragging] = useState(false)

  // Unmounting mid-drag (e.g. navigating away while the button is held) must not leave the page unselectable.
  useEffect(() => () => {
    if (drag.current) document.body.classList.remove(...DRAG_BODY_CLASSES)
  }, [])

  function startDrag(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return
    // Prevents text selection and keeps focus behaviour predictable while dragging.
    event.preventDefault()
    event.currentTarget.focus()
    // Capture keeps move and release events on the handle even when the pointer leaves it or the window.
    event.currentTarget.setPointerCapture(event.pointerId)
    drag.current = { pointerId: event.pointerId, startX: event.clientX, startWidth: width, width }
    document.body.classList.add(...DRAG_BODY_CLASSES)
    setDragging(true)
  }

  function moveDrag(event: PointerEvent<HTMLDivElement>) {
    const current = drag.current
    if (!current || current.pointerId !== event.pointerId) return
    current.width = current.startWidth + event.clientX - current.startX
    onResize(current.width, { persist: false })
  }

  function endDrag(event: PointerEvent<HTMLDivElement>) {
    const current = drag.current
    if (!current || current.pointerId !== event.pointerId) return
    drag.current = null
    document.body.classList.remove(...DRAG_BODY_CLASSES)
    setDragging(false)
    // A click without movement must not save the rendered width, which a narrow window may have clamped.
    if (current.width !== current.startWidth) onResize(current.width)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const step = event.shiftKey ? KEYBOARD_STEP_LARGE : KEYBOARD_STEP
    const next = {
      ArrowLeft: width - step,
      ArrowRight: width + step,
      Home: min,
      End: max,
    }[event.key]
    if (next === undefined) return
    event.preventDefault()
    onResize(next)
  }

  return (
    <div
      // A focusable `separator` is the ARIA window-splitter widget; `<hr>` is a static divider and cannot take its place.
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-controls={controls}
      aria-valuenow={width}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      onPointerDown={startDrag}
      onPointerMove={moveDrag}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onLostPointerCapture={endDrag}
      onKeyDown={handleKeyDown}
      onDoubleClick={() => onResize(defaultWidth)}
      data-dragging={dragging || undefined}
      // Zero net width, and the hit area lies over the content's padding so it never covers the sidebar's scrollbar.
      className={cn(
        'relative z-10 -mr-2 w-2 shrink-0 cursor-col-resize touch-none outline-none',
        'after:absolute after:inset-y-0 after:left-0 after:w-0.5 after:-translate-x-1/2 after:transition-colors',
        'hover:after:bg-ring focus-visible:after:bg-ring data-dragging:after:bg-ring',
      )}
    />
  )
}
