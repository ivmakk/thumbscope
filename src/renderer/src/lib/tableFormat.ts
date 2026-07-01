// Browse-table cell formatters. Pure -> unit-tested under `node --test`. Empty values render
// blank (not a dash) so a column of missing dates/dims reads quietly. Table only: the grid and
// preview show dims inline as `… · — · …`, where blanking would leave a dangling separator.

import { formatDateTime } from '../../../core/view.ts'

export function fmtSize(n: number): string {
  return n < 1024 ? `${n} B` : `${(n / 1024).toFixed(1)} KB`
}

// Blank (not a dash) when absent; shares the core formatter with the CLI list.
export function fmtDate(iso: string | null): string {
  return formatDateTime(iso, '')
}

export function fmtDims(width: number | null, height: number | null): string {
  return width && height ? `${width}×${height}` : ''
}
