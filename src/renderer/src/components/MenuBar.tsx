import { useCallback, useEffect, useRef, useState } from 'react'
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
import { altReduce, initialAltState, type AltState, type AltEvent } from '@/lib/altMode'
import { ACCESS_KEYS, MENUS, type MenuMeta } from '@/lib/menus'
import { isTypingTarget } from '@/lib/keys'
import type { ThemeChoice } from '../../../preload'

const action = (a: string) => (): void => void window.api.windowAction(a)
const openUrl = (url: string) => (): void => void window.api.openExternal(url)

// Help-menu link targets (UI content, so they live here). All open via the https-guarded openExternal.
const LINKS = {
  website: 'https://thumbscope.vercel.app',
  repo: 'https://github.com/ivmakk/thumbscope',
  issues: 'https://github.com/ivmakk/thumbscope/issues/new',
  releases: 'https://github.com/ivmakk/thumbscope/releases'
}

// Parent folder of a path, splitting on either separator (paths come from main as-is).
function folderOf(p: string): string {
  const i = Math.max(p.lastIndexOf('\\'), p.lastIndexOf('/'))
  return i > 0 ? p.slice(0, i) : p
}

// value -> menu metadata (label/accessKey), single source in menus.ts.
const META: Record<string, MenuMeta> = Object.fromEntries(MENUS.map((m) => [m.value, m]))

// A trigger label with its access letter underlined while mnemonic mode is active.
function TriggerLabel({ meta, active }: { meta: MenuMeta; active: boolean }): React.JSX.Element {
  const i = meta.label.toLowerCase().indexOf(meta.accessKey)
  if (!active || i < 0) return <>{meta.label}</>
  return (
    <>
      {meta.label.slice(0, i)}
      <u>{meta.label[i]}</u>
      {meta.label.slice(i + 1)}
    </>
  )
}

export function MenuBar({
  onOpen,
  onExport,
  canExport,
  onSelectAll,
  canSelectAll,
  filePath,
  theme,
  onThemeChange,
  appVersion,
  modalOpen = false,
  devTools = import.meta.env.DEV
}: {
  onOpen: () => void
  onExport: () => void
  canExport: boolean
  onSelectAll: () => void
  canSelectAll: boolean
  filePath: string | null
  theme: ThemeChoice
  onThemeChange: (t: ThemeChoice) => void
  appVersion: string
  modalOpen?: boolean // a modal (Export dialog) is open -> suppress mnemonic entry
  devTools?: boolean // show Reload + Toggle Developer Tools; defaults to dev builds only
}): React.JSX.Element {
  const [openMenu, setOpenMenu] = useState<string | null>(null)
  const [mnemonic, setMnemonic] = useState(false)

  const barRef = useRef<HTMLDivElement>(null)
  const altRef = useRef<AltState>(initialAltState) // reducer state (survives re-renders, listener reads it)
  const savedFocus = useRef<HTMLElement | null>(null) // element focused before entering mnemonic mode
  const modalRef = useRef(modalOpen)
  modalRef.current = modalOpen

  const focusFirstTrigger = useCallback((): void => {
    barRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus()
  }, [])

  // Run the transient effects the reducer asked for (focus the bar / restore prior focus).
  const applyEffects = useCallback(
    (effects: { focusBar: boolean; restoreFocus: boolean }): void => {
      if (effects.focusBar) {
        savedFocus.current = document.activeElement as HTMLElement | null
        focusFirstTrigger()
      }
      if (effects.restoreFocus) {
        const el = savedFocus.current
        if (el && el.isConnected) el.focus()
        else (document.activeElement as HTMLElement | null)?.blur()
        savedFocus.current = null
      }
    },
    [focusFirstTrigger]
  )

  // Keep the reducer's openMenu in sync when Radix opens/closes a menu via the mouse (mnemonic stays off).
  const onValueChange = useCallback((v: string): void => {
    altRef.current = { ...altRef.current, openMenu: v || null }
    setOpenMenu(v || null)
  }, [])

  useEffect(() => {
    const isMac = window.api.platform === 'darwin'

    const dispatch = (ev: AltEvent): ReturnType<typeof altReduce> => {
      const suppressed = isTypingTarget(document.activeElement) || modalRef.current
      const r = altReduce(altRef.current, ev, { accessKeys: ACCESS_KEYS, suppressed })
      altRef.current = r.state
      setMnemonic(r.state.mode)
      setOpenMenu(r.state.openMenu)
      applyEffects(r.effects)
      return r
    }

    const onKeyDown = (e: KeyboardEvent): void => {
      // macOS: no Alt mnemonics. Ctrl+F2 focuses the bar (mac's focus-menu convention); Radix
      // arrows/Enter drive it from there. (May be swallowed by the OS Full-Keyboard-Access shortcut.)
      if (isMac) {
        if (e.ctrlKey && e.key === 'F2') {
          e.preventDefault()
          focusFirstTrigger()
        }
        return
      }
      const prevOpen = altRef.current.openMenu
      // Bare Alt would otherwise let Chromium/Electron grab focus - swallow it either way.
      if (e.key === 'Alt' && !e.ctrlKey && !e.shiftKey && !e.metaKey) e.preventDefault()
      const r = dispatch({
        type: 'keydown',
        key: e.key,
        ctrlKey: e.ctrlKey,
        shiftKey: e.shiftKey,
        metaKey: e.metaKey
      })
      // A letter/Alt+letter that opened a menu shouldn't also type into the page.
      if (r.state.openMenu && r.state.openMenu !== prevOpen && e.key.length === 1) e.preventDefault()
    }

    const onKeyUp = (e: KeyboardEvent): void => {
      if (isMac || e.key !== 'Alt') return
      if (!e.ctrlKey && !e.shiftKey && !e.metaKey) e.preventDefault()
      dispatch({ type: 'keyup', key: e.key })
    }

    const onBlur = (): void => {
      if (isMac) return
      dispatch({ type: 'blur' })
    }

    // Capture phase: our keydown must run *before* Radix's own bubble-phase handlers. Two-stage Esc
    // depends on reading `openMenu` before Radix closes the menu (which would clear it and skip stage 1).
    window.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
    }
  }, [applyEffects, focusFirstTrigger])

  // Any menu-item activation exits mnemonic mode and restores focus (reducer 'select').
  const onItemSelect = useCallback(
    (run: () => void) =>
      (): void => {
        run()
        const r = altReduce(altRef.current, { type: 'select' }, { accessKeys: ACCESS_KEYS, suppressed: false })
        altRef.current = r.state
        setMnemonic(r.state.mode)
        applyEffects(r.effects)
      },
    [applyEffects]
  )

  return (
    <Menubar
      ref={barRef}
      className="border-b border-border bg-card px-1 py-0.5"
      value={openMenu ?? ''}
      onValueChange={onValueChange}
    >
      <MenubarMenu value="file">
        <MenubarTrigger>
          <TriggerLabel meta={META.file} active={mnemonic} />
        </MenubarTrigger>
        <MenubarContent>
          <MenubarItem onSelect={onItemSelect(onOpen)}>
            Open… <MenubarShortcut>Ctrl+O</MenubarShortcut>
          </MenubarItem>
          <MenubarItem onSelect={onItemSelect(onExport)} disabled={!canExport}>
            Export… <MenubarShortcut>Ctrl+E</MenubarShortcut>
          </MenubarItem>
          <MenubarSeparator />
          <MenubarItem disabled={!filePath} onSelect={onItemSelect(() => filePath && window.api.copyText(filePath))}>
            Copy File Path
          </MenubarItem>
          <MenubarItem
            disabled={!filePath}
            onSelect={onItemSelect(() => filePath && window.api.copyText(folderOf(filePath)))}
          >
            Copy Folder Path
          </MenubarItem>
          <MenubarSeparator />
          <MenubarItem onSelect={onItemSelect(action('quit'))}>Exit</MenubarItem>
        </MenubarContent>
      </MenubarMenu>

      <MenubarMenu value="edit">
        <MenubarTrigger>
          <TriggerLabel meta={META.edit} active={mnemonic} />
        </MenubarTrigger>
        <MenubarContent>
          <MenubarItem onSelect={onItemSelect(onSelectAll)} disabled={!canSelectAll}>
            Select All <MenubarShortcut>Ctrl+A</MenubarShortcut>
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>

      <MenubarMenu value="view">
        <MenubarTrigger>
          <TriggerLabel meta={META.view} active={mnemonic} />
        </MenubarTrigger>
        <MenubarContent>
          {devTools && (
            <>
              <MenubarItem onSelect={onItemSelect(action('reload'))}>Reload</MenubarItem>
              <MenubarItem onSelect={onItemSelect(action('toggle-devtools'))}>
                Toggle Developer Tools <MenubarShortcut>F12</MenubarShortcut>
              </MenubarItem>
              <MenubarSeparator />
            </>
          )}
          <MenubarItem onSelect={onItemSelect(action('zoom-in'))}>
            Zoom In <MenubarShortcut>Ctrl++</MenubarShortcut>
          </MenubarItem>
          <MenubarItem onSelect={onItemSelect(action('zoom-out'))}>
            Zoom Out <MenubarShortcut>Ctrl+-</MenubarShortcut>
          </MenubarItem>
          <MenubarItem onSelect={onItemSelect(action('zoom-reset'))}>
            Reset Zoom <MenubarShortcut>Ctrl+0</MenubarShortcut>
          </MenubarItem>
          <MenubarSeparator />
          <MenubarItem onSelect={onItemSelect(action('toggle-fullscreen'))}>
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

      <MenubarMenu value="window">
        <MenubarTrigger>
          <TriggerLabel meta={META.window} active={mnemonic} />
        </MenubarTrigger>
        <MenubarContent>
          <MenubarItem onSelect={onItemSelect(action('minimize'))}>Minimize</MenubarItem>
          <MenubarItem onSelect={onItemSelect(action('close'))}>Close</MenubarItem>
        </MenubarContent>
      </MenubarMenu>

      <MenubarMenu value="help">
        <MenubarTrigger>
          <TriggerLabel meta={META.help} active={mnemonic} />
        </MenubarTrigger>
        <MenubarContent>
          <MenubarItem onSelect={onItemSelect(openUrl(LINKS.website))}>Thumbscope Website</MenubarItem>
          <MenubarItem onSelect={onItemSelect(openUrl(LINKS.repo))}>GitHub Repository</MenubarItem>
          <MenubarItem onSelect={onItemSelect(openUrl(LINKS.issues))}>Report an Issue</MenubarItem>
          <MenubarSeparator />
          <MenubarLabel>Thumbscope {appVersion}</MenubarLabel>
          <MenubarItem onSelect={onItemSelect(openUrl(LINKS.releases))}>Release Notes</MenubarItem>
        </MenubarContent>
      </MenubarMenu>
    </Menubar>
  )
}
