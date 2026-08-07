import { createJiti } from 'jiti'

const jiti = createJiti(import.meta.url, { interopDefault: true })
const { runPerformanceCli } = await jiti.import('./index.ts')

try {
  await runPerformanceCli(process.argv.slice(2))
} catch (error) {
  console.error(error instanceof Error ? error.stack || error.message : String(error))
  process.exitCode = 1
}
