import { execFileSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const NSI_PATH = path.join(ROOT, 'build', 'custom-installer.nsi')
const UNPACKED_EXE = path.join(ROOT, 'dist', 'win-unpacked', '墨枢 InkNexus Studio.exe')
const OUT_EXE = path.join(ROOT, 'dist', '墨枢 InkNexus Studio Setup 1.0.0.exe')

function findMakensis() {
  const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local')
  const cacheBase = path.join(localAppData, 'electron-builder', 'Cache', 'nsis')
  if (fs.existsSync(cacheBase)) {
    for (const sub of fs.readdirSync(cacheBase)) {
      const candidate = path.join(cacheBase, sub, 'Bin', 'makensis.exe')
      if (fs.existsSync(candidate)) return candidate
      const rootCandidate = path.join(cacheBase, sub, 'makensis.exe')
      if (fs.existsSync(rootCandidate)) return rootCandidate
    }
  }
  const nsisBase = path.join(localAppData, 'electron-builder', 'Cache')
  if (fs.existsSync(nsisBase)) {
    for (const entry of fs.readdirSync(nsisBase)) {
      if (!entry.startsWith('nsis-')) continue
      const innerDir = path.join(nsisBase, entry)
      for (const sub of fs.readdirSync(innerDir)) {
        const candidate = path.join(innerDir, sub, 'Bin', 'makensis.exe')
        if (fs.existsSync(candidate)) return candidate
        const rootCandidate = path.join(innerDir, sub, 'makensis.exe')
        if (fs.existsSync(rootCandidate)) return rootCandidate
      }
    }
  }
  return 'makensis.exe'
}

if (!fs.existsSync(UNPACKED_EXE)) {
  console.error(`Missing unpacked build at: ${UNPACKED_EXE}`)
  process.exit(1)
}

// Ensure UTF-8 BOM on .nsi file for NSIS 3 Unicode parser
const rawBuf = fs.readFileSync(NSI_PATH)
if (!(rawBuf[0] === 0xef && rawBuf[1] === 0xbb && rawBuf[2] === 0xbf)) {
  const bom = Buffer.from([0xef, 0xbb, 0xbf])
  fs.writeFileSync(NSI_PATH, Buffer.concat([bom, rawBuf]))
}

const makensis = findMakensis()
console.log(`Building custom Aurora installer using: ${makensis}`)
execFileSync(makensis, ['/V2', NSI_PATH], { cwd: path.dirname(NSI_PATH), stdio: 'inherit' })

if (!fs.existsSync(OUT_EXE)) {
  console.error(`Expected installer output not found: ${OUT_EXE}`)
  process.exit(1)
}

const sizeMb = (fs.statSync(OUT_EXE).size / (1024 * 1024)).toFixed(2)
console.log(`Custom installer built successfully: ${OUT_EXE} (${sizeMb} MB)`)
