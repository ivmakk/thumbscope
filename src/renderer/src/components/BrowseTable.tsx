import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { ChevronDown, ChevronUp } from 'lucide-react'
import type { ThumbMeta } from '../../../preload'
import type { SortDir, SortKey } from '@core/view'
import { FileName } from './FileName'
import { useResetScrollOnVersion } from '@/lib/useResetScrollOnVersion'
import { cn } from '@/lib/utils'
import { fmtSize, fmtDate, fmtDims } from '@/lib/tableFormat'
import { autoFitWidth, gridTemplate, minTemplateWidth, resizeWidth, COLUMN_ORDER, type ColKey, type WidthOverrides } from '@/lib/tableColumns'

const ROW_H = 30
const CELL_PAD_PX = 16 // px-2 both sides
const NAME_EXTRA_PX = 14 // orphan dot + gap allowance

const HEADER: Record<ColKey, { label: string; sort?: SortKey }> = {
  index: { label: '#', sort: 'index' },
  name: { label: 'Name', sort: 'name' },
  size: { label: 'Size', sort: 'size' },
  date: { label: 'Date', sort: 'date' },
  dims: { label: 'Dims' }
}

// The string each column renders for a given entry - also what auto-fit measures.
function cellText(k: ColKey, e: ThumbMeta): string {
  switch (k) {
    case 'index':
      return String(e.index ?? '')
    case 'name':
      return e.label
    case 'size':
      return fmtSize(e.size)
    case 'date':
      return fmtDate(e.date)
    case 'dims':
      return fmtDims(e.width, e.height)
  }
}

function fontOf(el: Element): string {
  const s = getComputedStyle(el)
  return `${s.fontStyle} ${s.fontWeight} ${s.fontSize} ${s.fontFamily}`
}

// Shared canvas: measures real rendered text width for auto-fit (proportional-font accurate).
let measureCtx: CanvasRenderingContext2D | null = null
function measureText(text: string, font: string): number {
  if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d')
  if (!measureCtx) return 0
  measureCtx.font = font
  return measureCtx.measureText(text).width
}

export function BrowseTable({
  entries,
  selected,
  previewId,
  version,
  onClick,
  sortKey,
  sortDir,
  onSort
}: {
  entries: ThumbMeta[]
  selected: Set<string>
  previewId: string | null
  version: number
  onClick: (e: ThumbMeta, mods: { shift: boolean; ctrl: boolean }) => void
  sortKey: SortKey
  sortDir: SortDir
  onSort: (k: SortKey) => void
}): React.JSX.Element {
  const scrollRef = useRef<HTMLDivElement>(null)
  const headRef = useRef<HTMLDivElement>(null)
  const virt = useVirtualizer({
    count: entries.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_H,
    overscan: 10
  })

  useResetScrollOnVersion(virt, version)

  // Manual/auto-fit width overrides (px), ephemeral: reset on every new file open (`version` bump).
  // useLayoutEffect (not useEffect) so the reset runs before paint - otherwise the new file's rows
  // flash for one frame at the previous file's widths.
  const [overrides, setOverrides] = useState<WidthOverrides>({})
  useLayoutEffect(() => setOverrides({}), [version])
  const setOverride = useCallback((k: ColKey, px: number) => setOverrides((o) => ({ ...o, [k]: px })), [])

  const cols = gridTemplate(overrides)
  const minWidth = minTemplateWidth(overrides)

  // Border drag: push model - only the grabbed column changes; the rest shift, spacer absorbs.
  const dragRef = useRef<{ k: ColKey; startX: number; startW: number } | null>(null)
  const onHandleDown = (k: ColKey) => (ev: React.PointerEvent) => {
    ev.preventDefault()
    ev.stopPropagation()
    const cell = (ev.currentTarget as HTMLElement).closest('[data-col]') as HTMLElement | null
    const startW = overrides[k] ?? cell?.getBoundingClientRect().width ?? 0
    dragRef.current = { k, startX: ev.clientX, startW }
    ;(ev.currentTarget as HTMLElement).setPointerCapture(ev.pointerId)
  }
  const onHandleMove = (ev: React.PointerEvent) => {
    const d = dragRef.current
    if (d) setOverride(d.k, resizeWidth(d.startW, ev.clientX - d.startX))
  }
  // End the drag on up OR cancel; release capture only if we still hold it (avoids a throw when the
  // capture was already lost). A separate lost-capture handler clears state so an interrupted drag
  // can't leave dragRef set and keep resizing on later moves.
  const endDrag = (ev: React.PointerEvent) => {
    if (!dragRef.current) return
    dragRef.current = null
    const el = ev.currentTarget as HTMLElement
    if (el.hasPointerCapture(ev.pointerId)) el.releasePointerCapture(ev.pointerId)
  }
  const onLostCapture = () => {
    dragRef.current = null
  }

  // Double-click a border: auto-fit to the widest value. Measure the header label in its own font
  // and cell values in the cell font (they differ). Measure every distinct value - a character-count
  // prefilter would be wrong for a proportional font (short-but-wide glyphs) - deduping identical
  // strings (e.g. repeated sizes) so the pass stays cheap on large caches.
  const autoFitColumn = useCallback(
    (k: ColKey) => {
      const headEl = headRef.current?.querySelector<HTMLElement>(`[data-col="${k}"]`)
      if (!headEl) return
      const bodyEl = scrollRef.current?.querySelector<HTMLElement>(`[data-testid="table-row"] [data-col="${k}"]`)
      const headerFont = fontOf(headEl)
      const bodyFont = bodyEl ? fontOf(bodyEl) : headerFont
      let max = measureText(HEADER[k].label, headerFont)
      const seen = new Set<string>()
      for (const e of entries) {
        const t = cellText(k, e)
        if (seen.has(t)) continue
        seen.add(t)
        max = Math.max(max, measureText(t, bodyFont))
      }
      if (max <= 0) return // canvas unavailable -> don't collapse the column to padding width
      setOverride(k, autoFitWidth(max, { paddingPx: CELL_PAD_PX, extraPx: k === 'name' ? NAME_EXTRA_PX : 0 }))
    },
    [entries, setOverride]
  )

  return (
    <div ref={scrollRef} className="h-full select-none overflow-auto">
      <div
        ref={headRef}
        className="sticky top-0 z-10 grid border-b border-border bg-card text-sm"
        style={{ gridTemplateColumns: cols, minWidth }}
      >
        {COLUMN_ORDER.map((k) => {
          const h = HEADER[k]
          return (
            <div key={k} data-col={k} className="relative font-medium text-muted-foreground">
              {h.sort ? (
                <button
                  onClick={() => onSort(h.sort!)}
                  className="flex w-full items-center gap-1 px-2 py-1.5 text-left hover:text-foreground"
                >
                  {h.label}
                  {sortKey === h.sort && (sortDir === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)}
                </button>
              ) : (
                <span className="block px-2 py-1.5">{h.label}</span>
              )}
              <div
                data-testid={`resize-${k}`}
                onPointerDown={onHandleDown(k)}
                onPointerMove={onHandleMove}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                onLostPointerCapture={onLostCapture}
                onClick={(e) => e.stopPropagation()}
                onDoubleClick={(e) => {
                  e.stopPropagation()
                  autoFitColumn(k)
                }}
                className="absolute right-0 top-0 z-10 h-full w-2 translate-x-1/2 cursor-col-resize"
              />
            </div>
          )
        })}
        <div />
      </div>
      <div style={{ height: virt.getTotalSize(), position: 'relative', minWidth }}>
        {virt.getVirtualItems().map((vr) => {
          const e = entries[vr.index]
          const isSel = selected.has(e.streamName)
          const title = e.orphan ? `${e.label} — original not found, recoverable` : e.label
          return (
            <div
              key={e.streamName}
              data-testid="table-row"
              data-selected={isSel}
              onClick={(ev) => onClick(e, { shift: ev.shiftKey, ctrl: ev.ctrlKey || ev.metaKey })}
              className={cn(
                'absolute left-0 grid w-full cursor-default items-center border-b border-border text-sm',
                'hover:bg-muted/50',
                isSel && 'bg-primary/15',
                previewId === e.streamName && 'ring-1 ring-inset ring-ring'
              )}
              style={{ gridTemplateColumns: cols, height: ROW_H, transform: `translateY(${vr.start}px)` }}
            >
              <span data-col="index" className="truncate px-2 text-muted-foreground">
                {e.index}
              </span>
              <span data-col="name" className="flex items-center gap-1.5 px-2" title={title}>
                <FileName label={e.label} title={title} className="min-w-0" />
                {e.orphan && <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" title="Original not found — recoverable" />}
              </span>
              <span data-col="size" className="truncate px-2">
                {fmtSize(e.size)}
              </span>
              <span data-col="date" className="truncate px-2">
                {fmtDate(e.date)}
              </span>
              <span data-col="dims" className="truncate px-2">
                {fmtDims(e.width, e.height)}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
