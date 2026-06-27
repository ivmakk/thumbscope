import { test, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ExportDialog } from './ExportDialog'

// Render-tier wiring check: the only thing happy-dom adds over the pure buildExportOpts unit is that
// the button is actually reachable and click -> exportThumbs is wired. Default scope (no selection)
// is 'all', so the button reads "Export <totalCount>".
test('clicking Export calls exportThumbs once', async () => {
  const user = userEvent.setup()
  render(
    <ExportDialog
      open
      onOpenChange={() => {}}
      selectedIds={[]}
      orphanIds={[]}
      totalCount={5}
    />
  )

  const btn = screen.getByRole('button', { name: 'Export 5' })
  await user.click(btn)

  expect(window.api.exportThumbs).toHaveBeenCalledTimes(1)
})
