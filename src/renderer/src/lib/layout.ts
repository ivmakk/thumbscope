// Preview panel minimum as an absolute px floor (~150px, enough for the collapsed control
// bar) expressed as a percentage of the window (the full-width panel group). A fixed
// percentage over-restricts on wide windows (20% of 1280 = 256px) yet under-protects on
// narrow ones. Returns a coarse integer percent, so live resizing only changes it at a
// boundary crossing, not every pixel. Pure, no DOM/React.

export const previewMinPctFor = (winWidth: number): number =>
  Math.min(40, Math.max(8, Math.round((150 / winWidth) * 100)))
