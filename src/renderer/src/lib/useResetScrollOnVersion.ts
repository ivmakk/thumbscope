import { useLayoutEffect } from 'react'
import type { Virtualizer } from '@tanstack/react-virtual'

// Reset a virtualized viewport to the top when a new file is opened (version bumps).
// Keyed on version only — sort/filter changes (which change entries, not version) must
// keep the user's scroll position. Shared by BrowseGrid and BrowseTable.
export function useResetScrollOnVersion<TS extends Element | Window, TI extends Element>(
  virt: Virtualizer<TS, TI>,
  version: number
): void {
  useLayoutEffect(() => virt.scrollToOffset(0), [version, virt])
}
