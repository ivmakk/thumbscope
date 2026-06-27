// Build the export IPC payload (and the scope count shown on the button) from the dialog state.
// Pure: ExportDialog owns the React state + localStorage; this maps it to the contract payload so
// the scope->streamNames and dest->toSourceFolder rules are unit-testable without a DOM.

import type { ExportOpts, SizeMode } from '../../../shared/ipc'

export type Scope = 'selected' | 'orphans' | 'all'
export type Dest = 'pick' | 'source'

export interface ExportState {
  scope: Scope
  selectedIds: string[]
  orphanIds: string[]
  totalCount: number
  mode: SizeMode
  quality: number
  includeCsv: boolean
  skipExisting: boolean
  dest: Dest
}

// How many thumbnails the chosen scope covers (drives the "Export N" label + the disabled-on-zero guard).
export function selectionCount(s: Pick<ExportState, 'scope' | 'selectedIds' | 'orphanIds' | 'totalCount'>): number {
  return s.scope === 'selected' ? s.selectedIds.length : s.scope === 'orphans' ? s.orphanIds.length : s.totalCount
}

export function buildExportOpts(s: ExportState): ExportOpts {
  return {
    // 'all' => null (main exports every entry); otherwise the explicit stream-name list.
    streamNames: s.scope === 'all' ? null : s.scope === 'orphans' ? s.orphanIds : s.selectedIds,
    mode: s.mode,
    quality: s.quality,
    includeCsv: s.includeCsv,
    skipExisting: s.skipExisting,
    toSourceFolder: s.dest === 'source'
  }
}
