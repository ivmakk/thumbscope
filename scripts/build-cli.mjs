// Bundle the standalone CLI into a single CommonJS file shipped with the installer.
// sharp stays external — it is resolved at runtime from the app's unpacked node_modules
// (see build/installer.nsh: NODE_PATH points the wrapper at app.asar.unpacked).

import { build } from 'esbuild'

await build({
  entryPoints: ['src/cli/index.ts'],
  outfile: 'out/cli/thumbscope.cjs',
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  external: ['sharp'],
  legalComments: 'none'
})

console.log('built out/cli/thumbscope.cjs')
