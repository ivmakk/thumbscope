// Compat shim. The format-handling logic now lives under ./formats: the orchestrator (open.ts), the
// container handlers (container/*), the codec modules (codec/*), and the shared internal toolkits
// (internal/*). These re-exports preserve the historical `./parser.ts` import path for the existing
// tests and callers (main, CLI). New code should import from ./formats/open.ts directly.
export { parseThumbsDb, NotCfbError } from './formats/open.ts'
