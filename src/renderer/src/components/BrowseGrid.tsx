import { useLayoutEffect, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { ThumbMeta } from '../../../preload'
import { ThumbImage } from './ThumbImage'
import { FileName } from './FileName'
import { useResetScrollOnVersion } from '@/lib/useResetScrollOnVersion'
import { cn } from '@/lib/utils'

const LABEL_H = 38 // label + dims rows below the image
const GAP = 8

export function BrowseGrid({
  entries,
  selected,
  previewId,
  cell = 150,
  version,
  onClick
}: {
  entries: ThumbMeta[]
  selected: Set<string>
  previewId: string | null
  cell?: number
  version: number
  onClick: (e: ThumbMeta, mods: { shift: boolean; ctrl: boolean }) => void
}): React.JSX.Element {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)

  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setWidth(el.clientWidth))
    ro.observe(el)
    setWidth(el.clientWidth)
    return () => ro.disconnect()
  }, [])

  const img = cell - 22
  const rowH = cell + LABEL_H
  const cols = Math.max(1, Math.floor((width || cell) / cell))
  const rowCount = Math.ceil(entries.length / cols)
  const virt = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowH,
    overscan: 4
  })

  useLayoutEffect(() => virt.measure(), [rowH, cols, virt])

  useResetScrollOnVersion(virt, version)

  return (
    <div ref={scrollRef} className="h-full overflow-auto p-2">
      <div style={{ height: virt.getTotalSize(), position: 'relative', width: '100%' }}>
        {virt.getVirtualItems().map((row) => {
          const start = row.index * cols
          const cells = entries.slice(start, start + cols)
          return (
            <div
              key={row.key}
              className="absolute left-0 flex w-full"
              style={{ top: 0, transform: `translateY(${row.start}px)`, height: rowH, gap: GAP }}
            >
              {cells.map((e) => {
                const isSel = selected.has(e.streamName)
                return (
                  <button
                    key={e.streamName}
                    data-testid="thumb-cell"
                    data-selected={isSel}
                    onClick={(ev) => onClick(e, { shift: ev.shiftKey, ctrl: ev.ctrlKey || ev.metaKey })}
                    title={e.label}
                    className={cn(
                      'relative flex flex-col items-center justify-start gap-1 overflow-hidden rounded-md border p-1.5 text-center',
                      'bg-card hover:bg-muted/60',
                      isSel ? 'border-ring bg-accent' : 'border-border',
                      previewId === e.streamName && 'ring-2 ring-ring'
                    )}
                    style={{ width: cell - GAP, height: rowH - GAP }}
                  >
                    {e.orphan && (
                      <span
                        className="absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full border border-card bg-emerald-500"
                        title="Original file not found — recoverable"
                      />
                    )}
                    <ThumbImage
                      streamName={e.streamName}
                      version={version}
                      alt={e.label}
                      className="rounded border border-border object-contain"
                      style={{ width: img, height: img }}
                    />
                    <FileName label={e.label} className="text-xs" />
                    <span className="w-full truncate text-[10px] text-muted-foreground">
                      {e.width && e.height ? `${e.width}×${e.height}` : '—'} · {e.format}
                    </span>
                  </button>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}
