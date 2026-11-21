// News-image entry: validate the front-page image and copy it to /output/entry.png.
// Standard library only. Deterministic: the output is a byte-for-byte copy of entry.png.
import { copyFileSync, mkdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const MAX_BYTES = 1048576
const MAX_SIDE = 1024

const here = dirname(fileURLToPath(import.meta.url))
const source = join(here, 'entry.png')
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output'
const target = join(outDir, 'entry.png')

function fail(message: string): never {
  throw new Error(message)
}

function pngSize(buf: Buffer): { width: number, height: number } {
  if (buf.length < 33 || buf.toString('ascii', 12, 16) !== 'IHDR') fail('bad PNG header')
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) }
}

function jpegSize(buf: Buffer): { width: number, height: number } {
  let i = 2
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) fail('bad JPEG segment')
    const marker = buf[i + 1]
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2
      continue
    }
    const len = buf.readUInt16BE(i + 2)
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) }
    }
    i += 2 + len
  }
  fail('no JPEG frame found')
}

const bytes = readFileSync(source)
if (bytes.length > MAX_BYTES) fail(`entry.png is ${bytes.length} bytes, over the 1 MiB cap`)
const pngMagic = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const isPng = bytes.subarray(0, 8).equals(pngMagic)
const isJpeg = bytes.length > 2 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
if (!isPng && !isJpeg) fail('entry.png is neither PNG nor JPEG by its first bytes')
const size = isPng ? pngSize(bytes) : jpegSize(bytes)
if (size.width > MAX_SIDE || size.height > MAX_SIDE) {
  fail(`entry.png is ${size.width}x${size.height}, over the 1024x1024 cap`)
}
mkdirSync(outDir, { recursive: true })
copyFileSync(source, target)
const written = statSync(target).size
if (written !== bytes.length) fail('copy size mismatch')
const roundTrip = readFileSync(target)
if (!roundTrip.equals(bytes)) fail('output bytes differ from entry.png')
console.log(`entry.png ${size.width}x${size.height} ${bytes.length} bytes -> ${target}`)
