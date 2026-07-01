export type Payload =
  | { kind: 'jpeg'; data: Buffer }
  | { kind: 'png'; data: Buffer } // PNG passthrough (hashed-png streams); natively displayable and sharp-ingestable
  | { kind: 'dib'; width: number; height: number; pixels: Buffer } // tightly-packed top-down RGB
  | { kind: 'rgba'; width: number; height: number; pixels: Buffer; hasAlpha: boolean } // tightly-packed top-down straight (un-premultiplied) RGBA; hasAlpha = any genuinely translucent pixel
  | { kind: 'abbrev-jpeg'; data: Buffer } // reconstructed abbrev-jpeg (XP) JPEG; decodeAbbrevRgb maps it to RGB on use

export interface ThumbEntry {
  index: number | null // catalog item id (classic/ehthumbs); null for Vista
  streamName: string
  name: string | null // real catalog filename; null for GUID/Vista
  label: string // best display label: name, else `#index`, else hash
  date: Date | null
  width: number | null
  height: number | null
  size: number // payload byte length
  payload: Payload
}

// Container format that produced a ParseResult. Distinct from a handler slug: one handler can emit
// several formats (the irfanview handler returns irfanview-flat or irfanview-nested).
export type ContainerFormat =
  | 'cfb'
  | 'irfanview-flat'
  | 'irfanview-nested'
  | 'sqlite-photothumb'
  | 'thumbcache-cmmm'
  | 'recovered'

export interface ParseResult {
  count: number
  failed: number
  catalogCount: number
  entries: ThumbEntry[]
  recovered: boolean // true when the CFB container was unreadable and JPEGs were raw-carved (no metadata)
  format: ContainerFormat
}

export interface CatalogEntry {
  name: string
  date: Date | null
}
