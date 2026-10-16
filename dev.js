import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(fileURLToPath(import.meta.url))
const children = [
  spawn(process.execPath, [join(root, 'server.js')], { cwd: root, stdio: 'inherit' }),
  spawn(process.execPath, [join(root, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1'], { cwd: root, stdio: 'inherit' })
]
const pokeumDirectory = process.env.POKEUM_DIR || '/home/lau/Downloads/pokeum'
const pokeumPython = process.env.POKEUM_PYTHON || join(pokeumDirectory, '.venv/bin/python')
const pokeumPort = process.env.POKEUM_PORT || '8000'
let pokeumProcess = null
let stopping = false

try {
  const health = await fetch(`http://127.0.0.1:${pokeumPort}/api/health`, { signal: AbortSignal.timeout(500) })
  if (!health.ok) throw new Error(`Pokeum health check failed: ${health.status}`)
  console.log(`Pokeum already running on port ${pokeumPort}`)
} catch {
  if (existsSync(join(pokeumDirectory, 'main.py')) && existsSync(pokeumPython)) {
    pokeumProcess = spawn(pokeumPython, [
      join(pokeumDirectory, 'main.py'), 'serve', '--host', '127.0.0.1', '--port', pokeumPort
    ], { cwd: pokeumDirectory, stdio: 'inherit' })
    pokeumProcess.on('error', error => console.error('Pokeum failed to start:', error.message))
    pokeumProcess.on('exit', code => {
      if (!stopping) console.error(`Pokeum stopped${code ? ` with exit code ${code}` : ''}.`)
    })
  } else {
    console.warn(`Pokeum not found in ${pokeumDirectory}; photo scanning will be unavailable.`)
  }
}

function stop(signal = 'SIGTERM') {
  if (stopping) return
  stopping = true
  for (const child of children) child.kill(signal)
  pokeumProcess?.kill(signal)
}

for (const child of children) {
  child.on('error', error => {
    console.error(error)
    process.exitCode = 1
    stop()
  })
  child.on('exit', code => {
    if (stopping) return
    if (code) process.exitCode = code
    stop()
  })
}

process.on('SIGINT', () => stop('SIGINT'))
process.on('SIGTERM', () => stop('SIGTERM'))