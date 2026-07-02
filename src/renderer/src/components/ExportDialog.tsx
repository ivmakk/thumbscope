import { useEffect, useState } from 'react'
import type { SizeMode } from '../../../preload'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from '@/components/ui/dialog'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { Button } from '@/components/ui/button'
import { buildExportOpts, selectionCount, type Scope, type Dest } from '@/lib/exportOpts'

// Export preferences remembered across sessions.
const SKIP_KEY = 'export.skipExisting'
const MODE_KEY = 'export.sizeMode'
const DEST_KEY = 'export.dest'

export function ExportDialog({
  open,
  onOpenChange,
  selectedIds,
  orphanIds,
  totalCount
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  selectedIds: string[]
  orphanIds: string[]
  totalCount: number
}): React.JSX.Element {
  const hasSelection = selectedIds.length > 0
  const [scope, setScope] = useState<Scope>('all')
  const [dest, setDest] = useState<Dest>(() => (localStorage.getItem(DEST_KEY) === 'source' ? 'source' : 'pick'))
  const [mode, setMode] = useState<SizeMode>(() => (localStorage.getItem(MODE_KEY) === 'upscale800' ? 'upscale800' : 'original'))
  const [quality, setQuality] = useState(85)
  const [includeCsv, setIncludeCsv] = useState(false)
  const [skipExisting, setSkipExisting] = useState(() => localStorage.getItem(SKIP_KEY) === '1')
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [summary, setSummary] = useState<string | null>(null)
  const [outDir, setOutDir] = useState<string | null>(null)

  // Default scope to selection when there is one, each time the dialog opens.
  useEffect(() => {
    if (open) {
      setScope(hasSelection ? 'selected' : 'all')
      setSummary(null)
      setOutDir(null)
      setProgress(null)
    }
  }, [open, hasSelection])

  useEffect(() => {
    if (!busy) return
    return window.api.onExportProgress((p) => setProgress(p))
  }, [busy])

  const count = selectionCount({ scope, selectedIds, orphanIds, totalCount })

  const doExport = async (): Promise<void> => {
    setBusy(true)
    setSummary(null)
    setOutDir(null)
    setProgress({ done: 0, total: count })
    try {
      const r = await window.api.exportThumbs(
        buildExportOpts({ scope, selectedIds, orphanIds, totalCount, mode, quality, includeCsv, skipExisting, dest })
      )
      if (!r) return // folder pick cancelled
      if ('error' in r) {
        setSummary(`⚠ ${r.error}`)
      } else {
        const parts = [`Exported ${r.ok} file(s)`]
        if (r.skipped) parts.push(`${r.skipped} skipped`)
        if (r.failed) parts.push(`${r.failed} failed`)
        setSummary(parts.join(', '))
        setOutDir(r.outDir)
      }
    } finally {
      setBusy(false)
      setProgress(null)
    }
  }

  const done = outDir !== null

  return (
    <Dialog open={open} onOpenChange={(v) => !busy && onOpenChange(v)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Export thumbnails</DialogTitle>
          <DialogDescription>Output is always JPEG. Upscaling interpolates — it does not recover detail.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 text-sm">
          <label className="grid gap-1">
            <span className="text-xs text-muted-foreground">Scope</span>
            <Select value={scope} onValueChange={(v) => setScope(v as Scope)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="selected" disabled={!hasSelection}>
                  Selected ({selectedIds.length})
                </SelectItem>
                <SelectItem value="orphans" disabled={!orphanIds.length}>
                  Recoverable ({orphanIds.length})
                </SelectItem>
                <SelectItem value="all">All ({totalCount})</SelectItem>
              </SelectContent>
            </Select>
          </label>

          <label className="grid gap-1">
            <span className="text-xs text-muted-foreground">Destination</span>
            <Select
              value={dest}
              onValueChange={(v) => {
                setDest(v as Dest)
                localStorage.setItem(DEST_KEY, v)
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pick">Choose folder…</SelectItem>
                <SelectItem value="source">Same folder as the .db file</SelectItem>
              </SelectContent>
            </Select>
          </label>

          <label className="grid gap-1">
            <span className="text-xs text-muted-foreground">Size</span>
            <Select
              value={mode}
              onValueChange={(v) => {
                setMode(v as SizeMode)
                localStorage.setItem(MODE_KEY, v)
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="original">Original size</SelectItem>
                <SelectItem value="upscale800">Upscale to 800px (longer side)</SelectItem>
              </SelectContent>
            </Select>
          </label>

          <label className="grid gap-1">
            <span className="text-xs text-muted-foreground">JPEG quality: {quality}</span>
            <Slider min={50} max={100} step={1} value={[quality]} onValueChange={(v) => setQuality(v[0])} />
          </label>

          <label className="flex items-center gap-2">
            <input type="checkbox" checked={includeCsv} onChange={(e) => setIncludeCsv(e.target.checked)} />
            <span>Also write <code>thumbnails.csv</code> metadata</span>
          </label>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={skipExisting}
              onChange={(e) => {
                setSkipExisting(e.target.checked)
                localStorage.setItem(SKIP_KEY, e.target.checked ? '1' : '0')
              }}
            />
            <span>Skip files that already exist (no overwrite)</span>
          </label>

          {progress && (
            <div className="text-xs text-muted-foreground">
              Exporting {progress.done}/{progress.total}…
            </div>
          )}
          {summary && <div className="text-xs">{summary}</div>}
        </div>

        <DialogFooter>
          {done ? (
            <>
              <Button variant="outline" size="sm" onClick={() => outDir && window.api.openFolder(outDir)}>
                Open folder
              </Button>
              <Button size="sm" onClick={() => onOpenChange(false)}>
                Done
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" size="sm" disabled={busy} onClick={() => onOpenChange(false)}>
                Close
              </Button>
              <Button size="sm" disabled={busy || count === 0} onClick={doExport}>
                {busy ? 'Exporting…' : `Export ${count}`}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
