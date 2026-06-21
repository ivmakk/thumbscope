export type Payload =
  | { kind: 'jpeg'; data: Buffer }
  | { kind: 'dib'; width: number; height: number; pixels: Buffer } // tightly-packed top-down RGB

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

export interface ParseResult {
  count: number
  failed: number
  catalogCount: number
  entries: ThumbEntry[]
  recovered: boolean // true when the CFB container was unreadable and JPEGs were raw-carved (no metadata)
}

export interface CatalogEntry {
  name: string
  date: Date | null
}
