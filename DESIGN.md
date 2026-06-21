# Design

Living design rules for the Thumbscope desktop app. Accumulate decisions here as the UI evolves — this is the canonical reference; add to it when a new pattern or rule is established.

Adapted from a Notion design-language analysis (marketing-site oriented) — its *principles* are adopted; its marketing inventory (hero bands, pricing tiers, pill CTAs, sticker palette, display headlines, footer directories) is **not**, because this is a compact desktop utility, not a website.

Implementation lives in `src/renderer/src/index.css` (oklch tokens + Tailwind v4 `@theme inline`). shadcn primitives are vendored in `src/renderer/src/components/ui/`. This doc is the intent; the CSS is the source of truth for exact values.

## Principles (adopted)

- **Quiet chrome, content first.** The UI whispers in neutral greys; the thumbnails are the only color on screen. No decorative accents compete with the images.
- **Warm, non-clinical canvas.** The workspace sits on a warm off-white (light) / dark grey (dark) canvas, never pure white or pure black. Elevated chrome (header, menubar, cards, dialogs) is a step toward white/lighter to create gentle figure/ground.
- **Elevation by hairline, not heavy shadow.** Surfaces are defined by 1px hairline borders and barely-there shadows, not dramatic drops.
- **One type family, clear hierarchy.** Inter throughout; hierarchy comes from size/weight, not multiple faces. Weight 400 for body, heavier only for the few labels that need it.
- **Tight, consistent geometry.** An 8px spacing rhythm and a small radius scale; modest corners suited to a desktop tool (no pill CTAs).

## Principles dropped (don't apply here)

- No structural accent color — the app is intentionally **monochrome**. (A single blue could be added later for primary actions if desired; deliberately not adopted now.)
- No pill (`rounded-full`) buttons, no display/hero typography, no multi-color "sticker" palette, no marketing components (hero/pricing/footer).

## Tokens

### Color (oklch, neutral)

Two surface levels per mode — a canvas plus an elevated chrome surface — mirrored across light/dark.

| Role | Light | Dark | Use |
|---|---|---|---|
| `--background` | `0.968 0.004 85` (warm off-white) | `0.205 0 0` (dark grey) | Workspace canvas, panels, preview footer |
| `--card` | `1 0 0` (white) | `0.245 0 0` | Elevated chrome: header, menubar, grid tiles, dialogs, inputs |
| `--foreground` | `0.145 0 0` | `0.985 0 0` | Primary text |
| `--muted` / `--muted-foreground` | `0.97 0 0` / `0.556 0 0` | `0.3 0 0` / `0.72 0 0` | Subdued fills, secondary text |
| `--accent` / `--accent-foreground` | `0.97 0 0` / `0.205 0 0` | `0.3 0 0` / `0.985 0 0` | Hover/active surface for menu + toggle items |
| `--border` / `--input` | `0.922 0 0` | `1 0 0 / 12%` / `1 0 0 / 15%` | Hairlines, field outlines |
| `--ring` | `0.708 0 0` | `0.556 0 0` | Focus ring |
| `--primary` | `0.205 0 0` (near-black) | `0.985 0 0` (near-white) | Default button fill — neutral, not an accent hue |

The warm canvas is the one chromatic touch (light mode only, ~`0.004` chroma at hue 85). Dark mode stays neutral grey. The Notion rule "page on warm canvas, cards on white" maps directly to our `--background` / `--card` split.

### Typography

- **Family:** `Inter Variable` (self-hosted via `@fontsource-variable/inter`, imported in `src/renderer/src/main.tsx` — Google Fonts CDN is blocked by the renderer CSP), falling back to the system sans stack. Set as `--font-sans` and applied on `body`.
- **Hierarchy:** this is a dense utility — most text is small. Body/controls ~13–14px (`text-sm`), metadata ~12px (`text-xs`), no headings larger than the empty-state hint. Apply Inter's negative tracking only if larger text is ever introduced.

### Spacing & radius

- **Spacing:** 8px base. Tailwind steps in use map to Notion's scale (`gap-2`/8px, `px-3`/12px, `p-4`/16px, etc.). Controls use tight vertical padding (`py-0.5`–`py-2`).
- **Radius:** `--radius: 0.625rem` (~10px) as the large step; Tailwind derives `md`/`sm` from it. Menus/items round small (`rounded-sm`), cards/dialogs at the `md`/`lg` step. No `rounded-full` on controls.

### Elevation

- **Level 0 (default):** hairline `--border`, no shadow — grid tiles, panels.
- **Level 1 (raised):** hairline + soft `shadow-md` — menubar dropdowns, dialogs.

Keep shadows soft and layered; the hairline does most of the separation work.

## Component notes

- **Menubar** (`src/renderer/src/components/MenuBar.tsx` + `ui/menubar.tsx`): `bg-card`, `rounded-sm` items, tight padding; hover/active via `--accent`. Custom in-renderer bar replaces the native Win32 menu (which can't match this look).
- **Header / toolbar** (`src/renderer/src/App.tsx`): `bg-card` strip on the canvas; controls hidden until a file is open (empty state shows only **Open…** + logo hint).
- **Grid tiles** (`src/renderer/src/components/BrowseGrid.tsx`): white/`bg-card` cards on the canvas, fixed equal height, hairline border, `--ring` for the previewed item.
- **Orphan indicator**: thumbnails whose original file is missing from the source folder (recoverable) get a small green (`emerald-500`) dot — top-right corner on grid tiles, after the name in the table (trailing, so names stay column-aligned) — plus a green `N recoverable` count folded inline into the grid status bar. Green = positive/opportunity (you can recover a deleted original), deliberately distinct from amber (warning, e.g. the corrupt-file recovery banner) and red (error). Clicking the count filters the panel to orphans only and shows a closable green badge in the toolbar (after the sort field); closing it restores the full view.
- **Bottom status bars**: both panels end in a thin status bar (`border-t border-border px-3 py-1.5 text-xs text-muted-foreground`) — same height so they align across the resize handle. Left (grid) bar shows `count · failed · selected` with the thumbnail-size slider pushed to the right corner (grid view only); right (preview) bar shows the preview's label · dims · zoom%.
- **Preview** (`src/renderer/src/components/Preview.tsx`): top-to-bottom order is image well → compact control bar → info status bar. Image well uses a theme-independent tint (`bg-foreground/[0.04]`); control buttons are compact (`h-7 px-2`); Fit and 1:1 show the `default` (filled) variant when active, `outline` otherwise.
- **Dialogs / inputs / buttons** (`ui/`): `bg-card` surfaces, hairline borders, neutral `--primary` fill for default buttons, `outline` variant for secondary actions.
- **Notices / errors**: status feedback is the one place color is allowed, and only as a small accent — the surface stays neutral. *Error* = red (the dismissable toast: `red-500/10` fill + `/30` border, `TriangleAlert` icon; raw cause behind a dotted-underline "details" tooltip). *Warning* (e.g. the corrupt-file recovery banner) = amber-tinted bar (`amber-500/10` fill + `/30` border, `amber-700` / dark `amber-300` text, `TriangleAlert` icon), mirroring the error toast's red. Always a lucide icon, never a system emoji.

## Theme switching

Light / dark / system, controlled from the **View → Theme** menu, persisted in `localStorage`, OS-auto-detected via Electron `nativeTheme` (live flip on OS change when set to System). The `.dark` class on `<html>` swaps the token block; set before first paint in `src/renderer/src/main.tsx` to avoid a flash. See `src/renderer/src/lib/theme.ts`.

## Do / Don't

**Do**
- Keep the canvas warm-grey and put chrome on `--card` for figure/ground.
- Define surfaces with hairlines + soft shadow; let thumbnails be the only color.
- Use Inter; keep body weight 400; modest radii.

**Don't**
- Don't introduce a structural accent hue without a deliberate decision (currently monochrome by design).
- Don't use `rounded-full` on controls or heavy drop-shadows.
- Don't put UI text on pure white full-bleed; the warm canvas is intentional.
