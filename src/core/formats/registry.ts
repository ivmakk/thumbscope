// The ordered list of buffer-tier container handlers - the one place to register a new OLE2-family
// format. SQLite is NOT here (it routes at the async/path tier in open.ts); carve is NOT here (it is the
// explicit tier-2 fallback the orchestrator owns). First handler whose positive `detect` matches wins.
// IrfanView is checked before the generic cfb handler, though their signatures are mutually exclusive
// (irfan files carry no Catalog/digit/hash stream; cfb files carry no `_Thumbs_DB_Ver`).

import type { ContainerHandler } from './types.ts'
import { irfanviewHandler } from './container/irfanview.ts'
import { cfbHandler } from './container/cfb.ts'

export const registry: ContainerHandler[] = [irfanviewHandler, cfbHandler]
