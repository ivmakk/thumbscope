import { useLayoutEffect, useRef, useState } from 'react'
import { Maximize2, MoreHorizontal, RotateCcw, RotateCw, ZoomIn, ZoomOut } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'

// Toolbar overflow steps: level 1 moves rotate into the "..." menu, level 2 also moves zoom.
const MAX_COLLAPSE = 2

type Control = { icon: LucideIcon; label: string; run: () => void }

export function PreviewToolbar({
  fit,
  one,
  onZoomOut,
  onZoomIn,
  onFit,
  onOne,
  onRotate
}: {
  fit: boolean
  one: boolean
  onZoomOut: () => void
  onZoomIn: () => void
  onFit: () => void
  onOne: () => void
  onRotate: (delta: number) => void
}): React.JSX.Element {
  const barRef = useRef<HTMLDivElement>(null)
  // widthsRef[level] = the row's full scrollWidth at that collapse level, recorded each
  // measure. Used as the expand threshold: to step back to level-1 the container must be
  // at least as wide as the row was there (hysteresis, no oscillation).
  const widthsRef = useRef<number[]>([])
  const [collapsed, setCollapsed] = useState(0) // 0 = all inline, 1 = rotate in menu, 2 = + zoom in menu

  // Priority-ordered overflow: collapse the lowest-priority controls into the "..." menu
  // when the inline row actually overflows (bar is overflow-hidden + buttons shrink-0, so
  // scrollWidth > clientWidth means it doesn't fit), one group at a time - rotate first,
  // then zoom; fit/1:1 always stay inline. Runs as a layout effect (pre-paint) so the
  // initial level is settled before the bar is shown, avoiding a clipped flash.
  useLayoutEffect(() => {
    const el = barRef.current
    if (!el) return
    const measure = (): void => {
      widthsRef.current[collapsed] = el.scrollWidth
      if (el.scrollWidth > el.clientWidth) {
        if (collapsed < MAX_COLLAPSE) setCollapsed((c) => c + 1)
      } else if (collapsed > 0) {
        const prev = widthsRef.current[collapsed - 1]
        if (prev && el.clientWidth >= prev) setCollapsed((c) => c - 1)
      }
    }
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    measure()
    return () => ro.disconnect()
  }, [collapsed])

  // Declared once so the docked button and the overflow-menu item can't drift apart.
  const zoomControls: Control[] = [
    { icon: ZoomOut, label: 'Zoom out', run: onZoomOut },
    { icon: ZoomIn, label: 'Zoom in', run: onZoomIn }
  ]
  const rotateControls: Control[] = [
    { icon: RotateCcw, label: 'Rotate left', run: () => onRotate(-90) },
    { icon: RotateCw, label: 'Rotate right', run: () => onRotate(90) }
  ]

  const inlineButton = ({ icon: Icon, label, run }: Control): React.JSX.Element => (
    <Button key={label} size="sm" variant="outline" className="h-6 shrink-0 px-2" title={label} onClick={run}>
      <Icon className="h-4 w-4" />
    </Button>
  )
  // preventDefault keeps the menu open so repeated clicks (e.g. zooming several steps) work.
  const menuItem = ({ icon: Icon, label, run }: Control): React.JSX.Element => (
    <DropdownMenuItem
      key={label}
      onSelect={(e) => {
        e.preventDefault()
        run()
      }}
    >
      <Icon className="h-4 w-4" /> {label}
    </DropdownMenuItem>
  )

  return (
    <div ref={barRef} className="flex items-center gap-1.5 overflow-hidden border-t border-border px-3 py-1">
      {collapsed < 2 && zoomControls.map(inlineButton)}
      <Button size="sm" variant={fit ? 'default' : 'outline'} className="h-6 shrink-0 px-2" title="Fit to window" onClick={onFit}>
        <Maximize2 className="h-4 w-4" />
      </Button>
      <Button size="sm" variant={one ? 'default' : 'outline'} className="h-6 shrink-0 px-2" title="Actual size (1:1)" onClick={onOne}>
        1:1
      </Button>
      <div className="mx-1 h-4 w-px shrink-0 bg-border" />
      {collapsed === 0 ? (
        rotateControls.map(inlineButton)
      ) : (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="outline" className="h-6 shrink-0 px-2" aria-label="More controls" title="More controls">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {collapsed >= 2 && (
              <>
                {zoomControls.map(menuItem)}
                <DropdownMenuSeparator />
              </>
            )}
            {rotateControls.map(menuItem)}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  )
}
