import { build } from 'vite'
import { pathToFileURL } from 'node:url'
import path from 'node:path'

await build({
  configFile: false,
  logLevel: 'silent',
  build: {
    ssr: 'scripts/validation-entry.ts',
    outDir: '.validation',
    emptyOutDir: true,
    rollupOptions: { output: { entryFileNames: 'validate.mjs' } },
  },
})

await import(pathToFileURL(path.resolve('.validation/validate.mjs')).href)
