import { splitName } from '@/lib/text'
import { cn } from '@/lib/utils'

// Font-accurate middle ellipsis. The browser does all pixel measuring: the head
// truncates, the tail (ext + trailing digits) is protected. No JS width math.
// head + tail === label and there is no `gap`, so a short name renders verbatim
// (no seam) and the ellipsis appears only on real overflow. Full name on hover
// via the native `title`.
export function FileName({ label, title = label, className }: { label: string; title?: string; className?: string }): React.JSX.Element {
  const { head, tail } = splitName(label)
  if (tail === '') {
    return (
      <span className={cn('block min-w-0 max-w-full truncate', className)} title={title}>
        {label}
      </span>
    )
  }
  return (
    <span className={cn('inline-flex min-w-0 max-w-full items-baseline', className)} title={title}>
      <span className="min-w-0 truncate">{head}</span>
      <span className="shrink-0 whitespace-pre">{tail}</span>
    </span>
  )
}
