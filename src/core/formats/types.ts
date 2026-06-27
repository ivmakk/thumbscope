import type * as CFB from 'cfb'
import type { ParseResult } from '../types.ts'

// Base context handed to container detection/parsing. Built once by the orchestrator from the file
// on disk: `path` is the source file, `header` the first 16 bytes (cheap signature checks), `buffer`
// the full file bytes.
export interface Ctx {
  path: string
  header: Buffer
  buffer: Buffer
}

// CFB-family context: the orchestrator runs `CFB.read` once and only enters the registry on success,
// so `cfb` is always non-null here. Registry handlers carry zero cfb-null branches (design-watch nit 1).
export interface CfbCtx extends Ctx {
  cfb: CFB.CFB$Container
}

// Registry slug used to identify/force a handler. Not the same vocabulary as ContainerFormat: the
// irfanview handler registers as 'irfanview' but parses to irfanview-flat / irfanview-nested.
export type HandlerSlug = 'cfb' | 'irfanview'

// A container handler: a deep module with a small interface. `detect` is a positive signature test
// (no handler defined as "not the others"); `parse` extracts entries. Both see a non-null `cfb`.
export interface ContainerHandler {
  slug: HandlerSlug
  detect(ctx: CfbCtx): boolean
  parse(ctx: CfbCtx): ParseResult
}
