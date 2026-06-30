import { useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { ChevronDown, ChevronUp } from 'lucide-react'
import type { ThumbMeta } from '../../../preload'
import type { SortDir, SortKey } from '@core/view'
import { FileName } from './FileName'
import { useResetScrollOnVersion } from '@/lib/useResetScrollOnVersion'
import { cn } from '@/lib/utils'

const ROW_H = 30
const COLS = '4rem minmax(8rem,1fr) 6rem 12rem 6rem'

function fmtSize(n: number): string {
  return n < 1024 ? `${n} B` : `${(n / 1024).toFixed(1)} KB`
}
function fmtDate(iso: string | null): string {
  // "2010-07-02T14:03:20.000Z" -> "2010-07-02 14:03:20" (drop T / Z / milliseconds).
  return iso ? iso.slice(0, 19).replace('T', ' ') : '—'
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
  const virt = useVirtualizer({
    count: entries.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_H,
    overscan: 10
  })

  useResetScrollOnVersion(virt, version)

  const Head = ({ k, label, className }: { k: SortKey; label: string; className?: string }) => (
    <button
      onClick={() => onSort(k)}
      className={cn('flex items-center gap-1 px-2 py-1.5 text-left font-medium text-muted-foreground hover:text-foreground', className)}
    >
      {label}
      {sortKey === k && (sortDir === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)}
    </button>
  )

  return (
    <div className="flex h-full flex-col select-none">
      <div className="grid border-b border-border text-sm" style={{ gridTemplateColumns: COLS }}>
        <Head k="index" label="#" />
        <Head k="name" label="Name" />
        <Head k="size" label="Size" />
        <Head k="date" label="Date" />
        <div className="px-2 py-1.5 font-medium text-muted-foreground">Dims</div>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-auto">
        <div style={{ height: virt.getTotalSize(), position: 'relative', width: '100%' }}>
          {virt.getVirtualItems().map((vr) => {
            const e = entries[vr.index]
            const isSel = selected.has(e.streamName)
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
                style={{ gridTemplateColumns: COLS, height: ROW_H, transform: `translateY(${vr.start}px)` }}
              >
                <span className="truncate px-2 text-muted-foreground">{e.index ?? '—'}</span>
                <span className="flex items-center gap-1.5 px-2" title={e.orphan ? `${e.label} — original not found, recoverable` : e.label}>
                  <FileName label={e.label} title={e.orphan ? `${e.label} — original not found, recoverable` : e.label} className="min-w-0" />
                  {e.orphan && <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" title="Original not found — recoverable" />}
                </span>
                <span className="px-2">{fmtSize(e.size)}</span>
                <span className="px-2">{fmtDate(e.date)}</span>
                <span className="px-2">{e.width && e.height ? `${e.width}×${e.height}` : '—'}</span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
