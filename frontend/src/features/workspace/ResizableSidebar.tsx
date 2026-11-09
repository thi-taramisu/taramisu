import { useId, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { SidebarResizeHandle } from './SidebarResizeHandle'
import { SIDEBAR_WIDTH, useSidebarWidth } from './useSidebarWidth'

type ResizableSidebarProps = {
  label: string
  className?: string
  children: ReactNode
}

/**
 * Navigation sidebar with a resize handle on its right edge. The width state lives here so that dragging re-renders
 * only the sidebar frame: `children` and the sibling content keep their element identity and are not re-rendered.
 */
export function ResizableSidebar({ label, className, children }: ResizableSidebarProps) {
  const id = useId()
  const { width, min, max, setWidth } = useSidebarWidth()

  return (
    <>
      <nav id={id} aria-label={label} style={{ width }} className={cn('shrink-0 overflow-y-auto border-r', className)}>
        {children}
      </nav>
      <SidebarResizeHandle
        controls={id}
        label={`Resize ${label.toLowerCase()}`}
        width={width}
        min={min}
        max={max}
        defaultWidth={SIDEBAR_WIDTH.default}
        onResize={setWidth}
      />
    </>
  )
}
