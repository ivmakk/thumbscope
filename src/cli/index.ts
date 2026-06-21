#!/usr/bin/env node
// Standalone CLI sharing the Electron-free core (parser + encode). No Chromium/window.
// Run under Node 24 native TS type-stripping: `node src/cli/index.ts ...`.

import { Command } from 'commander'
import { cmdExport, cmdList } from './commands.ts'

const program = new Command()

program
  .name('thumbscope')
  .description('View and export thumbnails from Windows Thumbs.db / ehthumbs.db files')
  .version('1.0.0')

program
  .command('export')
  .description('Export thumbnails to a folder as .jpg files')
  .argument('<db>', 'path to a Thumbs.db/ehthumbs.db file, or a folder containing one')
  .option('-o, --out <dir>', 'output folder (default: the db file\'s folder)')
  .option('-m, --mode <mode>', 'size: original | 800 (upscale longer side to 800)', 'original')
  .option('-q, --quality <n>', 'JPEG quality 1-100 (used when re-encoding)', '80')
  .option('-f, --filter <substr>', 'only export thumbnails whose name contains this substring')
  .option('--csv', 'also write thumbnails.csv beside the images', false)
  .option('--overwrite', 'overwrite existing same-name files (default: skip them)', false)
  .action(async (db, opts) => process.exit(await cmdExport(db, opts)))

program
  .command('list')
  .description('Print thumbnail metadata (id, dimensions, size, date, name)')
  .argument('<db>', 'path to a Thumbs.db/ehthumbs.db file, or a folder containing one')
  .option('--csv <file>', 'write metadata to a CSV file instead of stdout')
  .action(async (db, opts) => process.exit(await cmdList(db, opts)))

// Force node-style argv slicing ([exe, script, ...args]). Without this, commander detects
// process.versions.electron (set when launched via the packaged Electron-as-Node wrapper) and
// strips argv differently, mistaking the script path for a command.
program.parseAsync(process.argv, { from: 'node' }).catch((err) => {
  process.stderr.write(`${(err as Error).message}\n`)
  process.exit(1)
})
