import { useCallback, useEffect, useMemo, useState } from 'react'
import { FolderOpen, LayoutGrid, List, Download, ArrowUpNarrowWide, ArrowDownWideNarrow, TriangleAlert, X } from 'lucide-react'
import logoUrl from '../icon.png'
import type { OpenResult, ThumbMeta } from '../../preload'
import {
  sortEntries,
  updateSelection,
  selectAll,
  clearSelection,
  type SelectionState,
  type SortDir,
  type SortKey
} from '@core/view'
import { Button } from '@/components/ui/button'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Slider } from '@/components/ui/slider'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable'
import { BrowseGrid } from '@/components/BrowseGrid'
import { BrowseTable } from '@/components/BrowseTable'
import { Preview } from '@/components/Preview'
import { ExportDialog } from '@/components/ExportDialog'
import { MenuBar } from '@/components/MenuBar'
import { resetImageCache } from '@/lib/imageCache'
import { friendlyError } from '@/lib/errors'
import { previewMinPctFor } from '@/lib/layout'
import { parseThumbSize, DEFAULT_THUMB, THUMB_MIN, THUMB_MAX } from '@/lib/thumbSize'
import { keyToAction } from '@/lib/keys'
import { applyDark, getStoredChoice, storeChoice } from '@/lib/theme'
import type { ThemeChoice } from '../../preload'

type View = 'grid' | 'table'

const SORT_FIELDS: { key: SortKey; label: string }[] = [
  { key: 'index', label: 'Index' },
  { key: 'name', label: 'Name' },
  { key: 'size', label: 'Size' },
  { key: 'date', label: 'Date' }
]
const THUMB_KEY = 'grid.thumbSize' // remembered across sessions
function initThumbSize(): number {
  return parseThumbSize(localStorage.getItem(THUMB_KEY))
}

const SORT_OPTIONS = SORT_FIELDS.flatMap((f) => [
  { value: `${f.key}:asc`, label: f.label, dir: 'asc' as SortDir },
  { value: `${f.key}:desc`, label: f.label, dir: 'desc' as SortDir }
])

function App(): React.JSX.Element {
  const [result, setResult] = useState<OpenResult | null>(null)
  const [error, setError] = useState<{ msg: string; path?: string; raw: string } | null>(null)
  const [loading, setLoading] = useState(false)
  const [view, setView] = useState<View>('grid')
  const [sortKey, setSortKey] = useState<SortKey>('index')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [thumbSize, setThumbSize] = useState(initThumbSize)
  const [selection, setSelection] = useState<SelectionState>({ selected: new Set(), anchor: null })
  const [previewId, setPreviewId] = useState<string | null>(null)
  const [openId, setOpenId] = useState(0) // bumps each successful open; forces thumb refetch
  const [exportOpen, setExportOpen] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [orphanFilter, setOrphanFilter] = useState(false) // show only recoverable (orphan) thumbs
  const [theme, setThemeState] = useState<ThemeChoice>(getStoredChoice)
  // Store the coarse percent (not raw width) so setting it to the same value on most
  // resize ticks bails the re-render — only a boundary crossing re-renders App.
  const [previewMinPct, setPreviewMinPct] = useState(() => previewMinPctFor(window.innerWidth))
  useEffect(() => {
    const onResize = (): void => setPreviewMinPct(previewMinPctFor(window.innerWidth))
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // Remember the grid thumbnail size across sessions.
  useEffect(() => {
    localStorage.setItem(THUMB_KEY, String(thumbSize))
  }, [thumbSize])

  // Sync the chosen theme with main (source of truth for 'system'), apply the dark class,
  // and listen for live OS theme changes while 'system' is selected.
  useEffect(() => {
    let active = true
    window.api.setTheme(theme).then((dark) => active && applyDark(dark))
    const off = window.api.onThemeUpdated((dark) => {
      if (theme === 'system') applyDark(dark)
    })
    return () => {
      active = false
      off()
    }
  }, [theme])

  const setTheme = useCallback((choice: ThemeChoice) => {
    storeChoice(choice)
    setThemeState(choice)
  }, [])

  const entries = useMemo(() => {
    if (!result) return []
    const base = orphanFilter ? result.entries.filter((e) => e.orphan) : result.entries
    return sortEntries(base, sortKey, sortDir)
  }, [result, sortKey, sortDir, orphanFilter])
  const orderedIds = useMemo(() => entries.map((e) => e.streamName), [entries])
  const previewPos = previewId ? orderedIds.indexOf(previewId) + 1 : 0 // 1-based; 0 = none
  const orphanCount = result ? result.entries.filter((e) => e.orphan).length : 0
  const previewEntry = useMemo(
    () => result?.entries.find((e) => e.streamName === previewId) ?? null,
    [result, previewId]
  )

  useEffect(() => {
    document.title = result ? `Thumbscope · ${result.path}` : 'Thumbscope'
  }, [result])

  const applyOpen = useCallback((r: Awaited<ReturnType<typeof window.api.openFile>>) => {
    if (!r) return // cancelled
    if ('error' in r) {
      setError({ msg: friendlyError(r.error), path: r.path, raw: r.error })
      return
    }
    resetImageCache()
    setError(null)
    setResult(r)
    setOrphanFilter(false)
    setSelection(clearSelection())
    setPreviewId(r.entries[0]?.streamName ?? null)
    setOpenId((n) => n + 1)
  }, [])

  // Files opened via the OS (file association / context menu / second launch) arrive pushed from main.
  useEffect(() => window.api.onShellOpen((r) => applyOpen(r)), [applyOpen])


  const doOpen = useCallback(async () => {
    setLoading(true)
    try {
      applyOpen(await window.api.openFile())
    } finally {
      setLoading(false)
    }
  }, [applyOpen])

  const onDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault()
      setDragging(false)
      const file = e.dataTransfer.files[0]
      if (!file) return
      setLoading(true)
      try {
        applyOpen(await window.api.openPath(window.api.pathForFile(file)))
      } finally {
        setLoading(false)
      }
    },
    [applyOpen]
  )

  const doExport = useCallback(() => {
    if (result?.count) setExportOpen(true)
  }, [result])

  const doSelectAll = useCallback(() => {
    if (orderedIds.length) setSelection(selectAll(orderedIds))
  }, [orderedIds])

  // Keyboard shortcuts (the native menu's accelerators are gone with the custom menubar).
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      // Don't hijack Ctrl+A (or others) while typing in a field — e.g. the export dialog.
      const t = e.target as HTMLElement | null
      const typing =
        !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)
      const hit = keyToAction({ ctrlKey: e.ctrlKey, key: e.key, typing })
      if (!hit) return
      if (hit.preventDefault) e.preventDefault()
      switch (hit.action) {
        case 'open': doOpen(); break
        case 'export': doExport(); break
        case 'select-all': doSelectAll(); break
        case 'toggle-devtools': window.api.windowAction('toggle-devtools'); break
        case 'toggle-fullscreen': window.api.windowAction('toggle-fullscreen'); break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [doOpen, doExport, doSelectAll])

  const onEntryClick = useCallback(
    (e: ThumbMeta, mods: { shift: boolean; ctrl: boolean }) => {
      setSelection((s) => updateSelection(s, orderedIds, e.streamName, mods))
      setPreviewId(e.streamName)
    },
    [orderedIds]
  )

  const onSort = useCallback(
    (k: SortKey) => {
      if (k === sortKey) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
      } else {
        setSortKey(k)
        setSortDir('asc')
      }
    },
    [sortKey]
  )

  return (
    <div
      className="relative flex h-screen flex-col"
      onDragOver={(e) => {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'copy'
        if (!dragging) setDragging(true)
      }}
      onDragLeave={(e) => {
        if (e.relatedTarget === null) setDragging(false) // only when the cursor leaves the window
      }}
      onDrop={onDrop}
    >
      <MenuBar
        onOpen={doOpen}
        onExport={doExport}
        canExport={!!result?.count}
        onSelectAll={doSelectAll}
        canSelectAll={!!orderedIds.length}
        filePath={result?.path ?? null}
        theme={theme}
        onThemeChange={setTheme}
      />
      <header className="flex flex-wrap items-center gap-2 border-b border-border bg-card px-3 py-1.5">
        <Button size="sm" className="h-7" onClick={doOpen} disabled={loading}>
          <FolderOpen className="h-4 w-4" /> {loading ? 'Opening…' : 'Open…'}
        </Button>
        {/* Filter field hidden for now — low value. Restore to re-enable name filtering. */}
        {result && (
          <>
        <ToggleGroup
          type="single"
          className="p-0"
          value={view}
          onValueChange={(v) => v && setView(v as View)}
        >
          <ToggleGroupItem value="grid" aria-label="Grid view">
            <LayoutGrid className="h-4 w-4" /> Grid
          </ToggleGroupItem>
          <ToggleGroupItem value="table" aria-label="Table view">
            <List className="h-4 w-4" /> Table
          </ToggleGroupItem>
        </ToggleGroup>
        {view === 'grid' && (
          <Select
            value={`${sortKey}:${sortDir}`}
            onValueChange={(v) => {
              const [k, d] = v.split(':')
              setSortKey(k as SortKey)
              setSortDir(d as SortDir)
            }}
          >
            <SelectTrigger className="h-7 w-28 gap-1.5" aria-label="Sort by">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  <span className="flex items-center gap-2">
                    <span className="w-12">{o.label}</span>
                    {o.dir === 'asc' ? (
                      <ArrowUpNarrowWide className="h-3.5 w-3.5 shrink-0 opacity-70" />
                    ) : (
                      <ArrowDownWideNarrow className="h-3.5 w-3.5 shrink-0 opacity-70" />
                    )}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {orphanFilter && (
          <span className="flex h-5 items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/10 pl-2.5 pr-1 text-xs font-medium text-emerald-700 dark:text-emerald-300">
            Recoverable ({orphanCount})
            <button
              onClick={() => setOrphanFilter(false)}
              className="rounded-full opacity-70 hover:opacity-100"
              title="Clear filter"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        )}
        <Button
          size="sm"
          variant="outline"
          className="ml-auto h-7"
          disabled={!result || !result.count}
          onClick={() => setExportOpen(true)}
        >
          <Download className="h-4 w-4" /> Export…
        </Button>
          </>
        )}
      </header>

      {!result ? (
        <div className="flex flex-1 items-center justify-center p-6 text-sm text-muted-foreground">
          <div className="flex flex-col items-center gap-4 rounded-xl border-2 border-dashed border-border px-14 py-12">
            <img src={logoUrl} alt="" className="h-24 w-24 opacity-90" />
            <div>
              Open or drop a <code className="mx-1">Thumbs.db</code> / <code className="mx-1">ehthumbs.db</code> file
            </div>
            <Button onClick={doOpen} disabled={loading}>
              <FolderOpen className="h-4 w-4" /> {loading ? 'Opening…' : 'Open…'}
            </Button>
          </div>
        </div>
      ) : (
        <>
        {result.recovered && (
          <div
            data-testid="recovery-banner"
            className="flex items-center gap-2 border-b border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-700 dark:text-amber-300"
          >
            <TriangleAlert className="h-3.5 w-3.5 shrink-0" />
            <span>
              <span className="font-medium">
                Recovered {result.count} thumbnail{result.count === 1 ? '' : 's'}
              </span>{' '}
              from a damaged file — filenames and dates are unavailable.
            </span>
          </div>
        )}
        <ResizablePanelGroup direction="horizontal" className="flex-1">
          <ResizablePanel defaultSize={62} minSize={30}>
            <div className="flex h-full flex-col">
              <div className="flex-1 overflow-hidden">
                {entries.length === 0 ? (
                  <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                    {result.count === 0 ? '0 thumbnails' : 'No matches'}
                  </div>
                ) : view === 'grid' ? (
                  <BrowseGrid entries={entries} selected={selection.selected} previewId={previewId} cell={thumbSize} version={openId} onClick={onEntryClick} />
                ) : (
                  <BrowseTable
                    entries={entries}
                    selected={selection.selected}
                    previewId={previewId}
                    version={openId}
                    onClick={onEntryClick}
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={onSort}
                  />
                )}
              </div>
              <div className="flex items-center gap-3 border-t border-border px-3 py-1.5 text-xs text-muted-foreground">
                <span className="truncate" title={result.path}>
                  {previewPos > 0 ? `${previewPos} / ${result.count}` : `${result.count}`} thumbs · {result.failed} failed · {selection.selected.size} selected · {result.format}
                  {orphanCount > 0 && (
                    <>
                      {' · '}
                      <button
                        onClick={() => setOrphanFilter(true)}
                        className="font-medium text-emerald-600 underline-offset-2 hover:underline dark:text-emerald-400"
                        title="Show only recoverable thumbnails"
                      >
                        {orphanCount} recoverable
                      </button>
                    </>
                  )}
                </span>
                {view === 'grid' && (
                  <div className="ml-auto flex items-center gap-2">
                    <button
                      type="button"
                      title="Reset thumbnail size to ×1"
                      onClick={() => setThumbSize(DEFAULT_THUMB)}
                      className="tabular-nums text-xs text-muted-foreground hover:text-foreground"
                    >
                      ×{Number.isInteger(thumbSize / DEFAULT_THUMB) ? thumbSize / DEFAULT_THUMB : (thumbSize / DEFAULT_THUMB).toFixed(1)}
                    </button>
                    <Slider
                      min={THUMB_MIN}
                      max={THUMB_MAX}
                      step={10}
                      value={[thumbSize]}
                      onValueChange={(v) => setThumbSize(v[0])}
                      className="w-28"
                      aria-label="Thumbnail size"
                    />
                  </div>
                )}
              </div>
            </div>
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize={38} minSize={previewMinPct}>
            <Preview entry={previewEntry} version={openId} />
          </ResizablePanel>
        </ResizablePanelGroup>
        </>
      )}

      <ExportDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        selectedIds={[...selection.selected]}
        orphanIds={result ? result.entries.filter((e) => e.orphan).map((e) => e.streamName) : []}
        totalCount={result?.count ?? 0}
      />

      {error && (
        <div className="absolute top-20 left-1/2 z-50 flex max-w-[90%] -translate-x-1/2 items-start gap-2.5 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-700 shadow-md backdrop-blur-sm dark:text-red-300">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="min-w-0">
            <div>
              {error.msg.replace(/\.$/, '')} (
              <span className="cursor-help underline decoration-dotted underline-offset-2 opacity-70" title={error.raw}>
                details
              </span>
              ).
            </div>
            {error.path && <div className="mt-0.5 truncate text-xs opacity-70" title={error.path}>{error.path}</div>}
          </div>
          <button
            onClick={() => setError(null)}
            className="-mr-1 ml-1 shrink-0 opacity-70 hover:opacity-100"
            title="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {dragging && (
        <div className="pointer-events-none absolute inset-0 z-50 m-2 flex items-center justify-center rounded-lg border-2 border-dashed border-primary/60 bg-background/70 backdrop-blur-sm">
          <div className="rounded-md border border-border bg-card px-4 py-2 text-sm font-medium shadow-md">
            Drop to open <code className="mx-0.5">Thumbs.db</code>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
