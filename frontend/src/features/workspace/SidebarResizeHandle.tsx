import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { cn } from '@/lib/utils'
import { SIDEBAR_WIDTH } from './useSidebarWidth'

const KEYBOARD_STEP = 16
const KEYBOARD_STEP_LARGE = 64

type SidebarResizeHandleProps = {
  /** Id of the sidebar element this handle resizes. */
  controls: string
  label: string
  width: number
  min: number
  max: number
  onResize: (width: number, options?: { persist?: boolean }) => void
}

type Drag = { pointerId: number; startX: number; startWidth: number; width: number }

/**
 * Vertical separator between the sidebar and the main content. Drag it with a pointer, or focus it and use the arrow
 * keys, Home, and End. Double-click restores the default width.
 */
export function SidebarResizeHandle({ controls, label, width, min, max, onResize }: SidebarResizeHandleProps) {
  const drag = useRef<Drag | null>(null)
  const [dragging, setDragging] = useState(false)

  function startDrag(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return
    // Prevents text selection and keeps focus behaviour predictable while dragging.
    event.preventDefault()
    event.currentTarget.focus()
    // Capture keeps move and release events on the handle even when the pointer leaves it or the window.
    event.currentTarget.setPointerCapture(event.pointerId)
    drag.current = { pointerId: event.pointerId, startX: event.clientX, startWidth: width, width }
    document.body.classList.add('cursor-col-resize', 'select-none')
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
    document.body.classList.remove('cursor-col-resize', 'select-none')
    setDragging(false)
    onResize(current.width)
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
      onDoubleClick={() => onResize(SIDEBAR_WIDTH.default)}
      data-dragging={dragging || undefined}
      // Zero net width: the hit area straddles the sidebar border without shifting the layout.
      className={cn(
        'group relative z-10 -mx-1 w-2 shrink-0 cursor-col-resize touch-none outline-none',
        'after:absolute after:inset-y-0 after:left-1/2 after:w-0.5 after:-translate-x-1/2 after:transition-colors',
        'hover:after:bg-ring focus-visible:after:bg-ring data-dragging:after:bg-ring',
      )}
    />
  )
}
