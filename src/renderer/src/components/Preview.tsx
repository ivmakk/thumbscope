import { useEffect, useRef, useState } from 'react'
import type { ThumbMeta } from '../../../preload'
import { PreviewToolbar } from './PreviewToolbar'
import { getThumbUrl } from '@/lib/imageCache'
import { needsCheckerboard, CHECKERBOARD_STYLE } from '@/lib/transparency'

// Remembered zoom mode, persisted across app runs. Manual zoom (wheel/buttons) is transient and
// doesn't change the remembered mode — switching images returns to the last Fit/1:1 choice.
const MODE_KEY = 'previewMode'
const getMode = (): 'fit' | 'one' => (localStorage.getItem(MODE_KEY) === 'one' ? 'one' : 'fit')

export function Preview({ entry, version }: { entry: ThumbMeta | null; version: number }): React.JSX.Element {
  const [url, setUrl] = useState<string | null>(null)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [fit, setFit] = useState(() => getMode() === 'fit')
  const [one, setOne] = useState(() => getMode() === 'one')
  // Per-thumbnail rotation (degrees), remembered only for the current open-file session.
  const [rotations, setRotations] = useState<Record<string, number>>({})
  const modeRef = useRef(getMode()) // remembered mode, read inside the entry-change effect
  const boxRef = useRef<HTMLDivElement>(null)
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null)

  // A new file clears remembered rotations (stream names can repeat across files).
  useEffect(() => setRotations({}), [version])

  const rotation = entry ? (rotations[entry.streamName] ?? 0) : 0
  const rotate = (delta: number): void => {
    if (!entry) return
    setRotations((r) => ({ ...r, [entry.streamName]: (((r[entry.streamName] ?? 0) + delta) % 360 + 360) % 360 }))
  }

  // Scale so a 1:1 pixel mapping is shown (natural px). Computes the fitted display width from the
  // container box + natural aspect, since object-contain letterboxes inside the full-size element.
  // Returns false if dims/box aren't available yet so callers can fall back to Fit.
  const applyOne = (): boolean => {
    const box = boxRef.current
    if (!box || !entry?.width || !entry?.height) return false
    const aspect = entry.width / entry.height
    const fitW = Math.min(box.clientWidth, box.clientHeight * aspect)
    if (fitW <= 0) return false
    setFit(false)
    setOne(true)
    setZoom(entry.width / fitW)
    setPan({ x: 0, y: 0 })
    return true
  }

  const applyFit = (): void => {
    setFit(true)
    setOne(false)
    setZoom(1)
    setPan({ x: 0, y: 0 })
  }

  useEffect(() => {
    setPan({ x: 0, y: 0 })
    setUrl(null)
    if (!entry) return
    // Reapply the remembered mode for the new image (1:1 is recomputed per image's dims).
    if (modeRef.current === 'one' && entry.width && entry.height) applyOne()
    else applyFit()
    let alive = true
    getThumbUrl(entry.streamName).then((u) => alive && setUrl(u))
    return () => {
      alive = false
    }
    // applyOne/applyFit only read entry, which is the dep; intentionally omitted to avoid re-running.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry])

  const setManualZoom = (next: number): void => {
    setFit(false)
    setOne(false)
    setZoom(Math.min(20, Math.max(0.1, next)))
  }

  const doFit = (): void => {
    modeRef.current = 'fit'
    localStorage.setItem(MODE_KEY, 'fit')
    applyFit()
  }

  const oneToOne = (): void => {
    if (applyOne()) {
      modeRef.current = 'one'
      localStorage.setItem(MODE_KEY, 'one')
    }
  }

  // Zoom relative to natural pixels (100% = 1:1). `zoom` is scale over the fitted display size, so
  // convert via the fitted width. Reads boxRef at render — fine for a status read-out.
  const naturalPct = (): number | null => {
    const box = boxRef.current
    if (!box || !entry?.width || !entry?.height) return null
    const aspect = entry.width / entry.height
    const fitW = Math.min(box.clientWidth, box.clientHeight * aspect)
    if (fitW <= 0) return null
    return Math.round(((fitW * zoom) / entry.width) * 100)
  }

  if (!entry) {
    return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">No selection</div>
  }

  return (
    <div className="flex h-full flex-col">
      <div
        ref={boxRef}
        className="relative flex-1 overflow-hidden bg-foreground/[0.04]"
        onWheel={(e) => setManualZoom(zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1))}
        onPointerDown={(e) => {
          drag.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y }
          ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
        }}
        onPointerMove={(e) => {
          if (!drag.current) return
          setPan({ x: drag.current.px + (e.clientX - drag.current.x), y: drag.current.py + (e.clientY - drag.current.y) })
        }}
        onPointerUp={() => (drag.current = null)}
      >
        {url && needsCheckerboard(entry) && (
          <div data-testid="preview-checkerboard" aria-hidden className="absolute inset-0" style={CHECKERBOARD_STYLE} />
        )}
        {url && (
          <img
            data-testid="preview-image"
            src={url}
            alt={entry.label}
            draggable={false}
            className="absolute inset-0 h-full w-full object-contain"
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) rotate(${rotation}deg) scale(${zoom})`,
              cursor: zoom > 1 ? 'grab' : 'default',
              imageRendering: zoom > 1.5 ? 'pixelated' : 'auto'
            }}
          />
        )}
      </div>
      <PreviewToolbar
        fit={fit}
        one={one}
        onZoomOut={() => setManualZoom(zoom / 1.25)}
        onZoomIn={() => setManualZoom(zoom * 1.25)}
        onFit={doFit}
        onOne={oneToOne}
        onRotate={rotate}
      />
      <div className="truncate border-t border-border px-3 py-1.5 text-xs text-muted-foreground" title={entry.label}>
        {entry.label} · {entry.width && entry.height ? `${entry.width}×${entry.height}` : '—'} · {naturalPct() ?? Math.round(zoom * 100)}%
      </div>
    </div>
  )
}
