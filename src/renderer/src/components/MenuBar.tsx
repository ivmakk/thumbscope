import {
  Menubar,
  MenubarMenu,
  MenubarTrigger,
  MenubarContent,
  MenubarItem,
  MenubarSeparator,
  MenubarShortcut,
  MenubarLabel,
  MenubarRadioGroup,
  MenubarRadioItem
} from '@/components/ui/menubar'
import type { ThemeChoice } from '../../../preload'

const action = (a: string) => (): void => void window.api.windowAction(a)

// Parent folder of a path, splitting on either separator (paths come from main as-is).
function folderOf(p: string): string {
  const i = Math.max(p.lastIndexOf('\\'), p.lastIndexOf('/'))
  return i > 0 ? p.slice(0, i) : p
}

export function MenuBar({
  onOpen,
  onExport,
  canExport,
  onSelectAll,
  canSelectAll,
  filePath,
  theme,
  onThemeChange
}: {
  onOpen: () => void
  onExport: () => void
  canExport: boolean
  onSelectAll: () => void
  canSelectAll: boolean
  filePath: string | null
  theme: ThemeChoice
  onThemeChange: (t: ThemeChoice) => void
}): React.JSX.Element {
  return (
    <Menubar className="border-b border-border bg-card px-1 py-0.5">
      <MenubarMenu>
        <MenubarTrigger>File</MenubarTrigger>
        <MenubarContent>
          <MenubarItem onSelect={onOpen}>
            Open… <MenubarShortcut>Ctrl+O</MenubarShortcut>
          </MenubarItem>
          <MenubarItem onSelect={onExport} disabled={!canExport}>
            Export… <MenubarShortcut>Ctrl+E</MenubarShortcut>
          </MenubarItem>
          <MenubarSeparator />
          <MenubarItem disabled={!filePath} onSelect={() => filePath && window.api.copyText(filePath)}>
            Copy File Path
          </MenubarItem>
          <MenubarItem disabled={!filePath} onSelect={() => filePath && window.api.copyText(folderOf(filePath))}>
            Copy Folder Path
          </MenubarItem>
          <MenubarSeparator />
          <MenubarItem onSelect={action('quit')}>Exit</MenubarItem>
        </MenubarContent>
      </MenubarMenu>

      <MenubarMenu>
        <MenubarTrigger>Edit</MenubarTrigger>
        <MenubarContent>
          <MenubarItem onSelect={onSelectAll} disabled={!canSelectAll}>
            Select All <MenubarShortcut>Ctrl+A</MenubarShortcut>
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>

      <MenubarMenu>
        <MenubarTrigger>View</MenubarTrigger>
        <MenubarContent>
          <MenubarItem onSelect={action('reload')}>Reload</MenubarItem>
          <MenubarItem onSelect={action('toggle-devtools')}>
            Toggle Developer Tools <MenubarShortcut>F12</MenubarShortcut>
          </MenubarItem>
          <MenubarSeparator />
          <MenubarItem onSelect={action('zoom-in')}>Zoom In</MenubarItem>
          <MenubarItem onSelect={action('zoom-out')}>Zoom Out</MenubarItem>
          <MenubarItem onSelect={action('zoom-reset')}>Reset Zoom</MenubarItem>
          <MenubarSeparator />
          <MenubarItem onSelect={action('toggle-fullscreen')}>
            Toggle Full Screen <MenubarShortcut>F11</MenubarShortcut>
          </MenubarItem>
          <MenubarSeparator />
          <MenubarLabel>Theme</MenubarLabel>
          <MenubarRadioGroup value={theme} onValueChange={(v) => onThemeChange(v as ThemeChoice)}>
            <MenubarRadioItem value="system">System</MenubarRadioItem>
            <MenubarRadioItem value="light">Light</MenubarRadioItem>
            <MenubarRadioItem value="dark">Dark</MenubarRadioItem>
          </MenubarRadioGroup>
        </MenubarContent>
      </MenubarMenu>

      <MenubarMenu>
        <MenubarTrigger>Window</MenubarTrigger>
        <MenubarContent>
          <MenubarItem onSelect={action('minimize')}>Minimize</MenubarItem>
          <MenubarItem onSelect={action('close')}>Close</MenubarItem>
        </MenubarContent>
      </MenubarMenu>
    </Menubar>
  )
}
