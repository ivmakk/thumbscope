// Top-level menu metadata, kept in a pure JSX-free module so the collision guard (menus.test.ts)
// can import it under node --test. MenuBar.tsx renders from this, and the mnemonic layer reads it to
// underline access letters and map an access key to the menu it opens.
//
// Picking an accessKey for a new menu: prefer the label's first letter; if taken, pick a distinctive
// consonant that appears in the label. It must be unique across all menus and present in its own label
// (the guard test enforces both).

export interface MenuMeta {
  value: string // stable Radix <MenubarMenu value>; also the openMenu key
  label: string
  accessKey: string // lowercase access letter, underlined in mnemonic mode
}

export const MENUS: MenuMeta[] = [
  { value: 'file', label: 'File', accessKey: 'f' },
  { value: 'edit', label: 'Edit', accessKey: 'e' },
  { value: 'view', label: 'View', accessKey: 'v' },
  { value: 'window', label: 'Window', accessKey: 'w' },
  { value: 'help', label: 'Help', accessKey: 'h' }
]

// lowercase access letter -> menu value, for the altMode reducer's letter-open lookup.
export const ACCESS_KEYS: Record<string, string> = Object.fromEntries(
  MENUS.map((m) => [m.accessKey, m.value])
)

// menu value -> metadata, for the menubar to look up a trigger's label/accessKey by value.
export const MENU_BY_VALUE: Record<string, MenuMeta> = Object.fromEntries(
  MENUS.map((m) => [m.value, m])
)
