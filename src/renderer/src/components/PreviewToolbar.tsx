import { useEffect, useRef, useState } from 'react'
import { Maximize2, MoreHorizontal, RotateCcw, RotateCw, ZoomIn, ZoomOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'

// Toolbar overflow steps: level 1 moves rotate into the "..." menu, level 2 also moves zoom.
const MAX_COLLAPSE = 2

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
  // then zoom; fit/1:1 always stay inline.
  useEffect(() => {
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

  return (
    <div ref={barRef} className="flex items-center gap-1.5 overflow-hidden border-t border-border px-3 py-1">
      {collapsed < 2 && (
        <>
          <Button size="sm" variant="outline" className="h-6 shrink-0 px-2" title="Zoom out" onClick={onZoomOut}>
            <ZoomOut className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="outline" className="h-6 shrink-0 px-2" title="Zoom in" onClick={onZoomIn}>
            <ZoomIn className="h-4 w-4" />
          </Button>
        </>
      )}
      <Button size="sm" variant={fit ? 'default' : 'outline'} className="h-6 shrink-0 px-2" title="Fit to window" onClick={onFit}>
        <Maximize2 className="h-4 w-4" />
      </Button>
      <Button size="sm" variant={one ? 'default' : 'outline'} className="h-6 shrink-0 px-2" title="Actual size (1:1)" onClick={onOne}>
        1:1
      </Button>
      <div className="mx-1 h-4 w-px shrink-0 bg-border" />
      {collapsed === 0 ? (
        <>
          <Button size="sm" variant="outline" className="h-6 shrink-0 px-2" title="Rotate left" onClick={() => onRotate(-90)}>
            <RotateCcw className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="outline" className="h-6 shrink-0 px-2" title="Rotate right" onClick={() => onRotate(90)}>
            <RotateCw className="h-4 w-4" />
          </Button>
        </>
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
                <DropdownMenuItem onSelect={onZoomOut}>
                  <ZoomOut className="h-4 w-4" /> Zoom out
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={onZoomIn}>
                  <ZoomIn className="h-4 w-4" /> Zoom in
                </DropdownMenuItem>
                <DropdownMenuSeparator />
              </>
            )}
            <DropdownMenuItem onSelect={() => onRotate(-90)}>
              <RotateCcw className="h-4 w-4" /> Rotate left
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onRotate(90)}>
              <RotateCw className="h-4 w-4" /> Rotate right
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  )
}
