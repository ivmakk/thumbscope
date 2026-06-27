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

type ScopeInput = Pick<ExportState, 'scope' | 'selectedIds' | 'orphanIds' | 'totalCount'>

// Resolve the scope once: the stream-name list to export ('all' => null, i.e. every entry) and how
// many thumbnails that covers. Single source for the scope rule so the button count and the exported
// set can't disagree.
function resolveScope(s: ScopeInput): { streamNames: string[] | null; count: number } {
  switch (s.scope) {
    case 'selected':
      return { streamNames: s.selectedIds, count: s.selectedIds.length }
    case 'orphans':
      return { streamNames: s.orphanIds, count: s.orphanIds.length }
    case 'all':
      return { streamNames: null, count: s.totalCount }
  }
}

// How many thumbnails the chosen scope covers (drives the "Export N" label + the disabled-on-zero guard).
export function selectionCount(s: ScopeInput): number {
  return resolveScope(s).count
}

export function buildExportOpts(s: ExportState): ExportOpts {
  return {
    streamNames: resolveScope(s).streamNames,
    mode: s.mode,
    quality: s.quality,
    includeCsv: s.includeCsv,
    skipExisting: s.skipExisting,
    toSourceFolder: s.dest === 'source'
  }
}
