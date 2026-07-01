// Browse-table cell formatters. Pure -> unit-tested under `node --test`. Empty values render
// blank (not a dash) so a column of missing dates/dims reads quietly. Table only: the grid and
// preview show dims inline as `… · — · …`, where blanking would leave a dangling separator.

export function fmtSize(n: number): string {
  return n < 1024 ? `${n} B` : `${(n / 1024).toFixed(1)} KB`
}

// "2010-07-02T14:03:20.000Z" -> "2010-07-02 14:03:20" (drop T / Z / milliseconds).
export function fmtDate(iso: string | null): string {
  return iso ? iso.slice(0, 19).replace('T', ' ') : ''
}

export function fmtDims(width: number | null, height: number | null): string {
  return width && height ? `${width}×${height}` : ''
}
