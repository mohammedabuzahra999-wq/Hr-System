import { createHash } from 'node:crypto'
import { readFile, unlink } from 'node:fs/promises'
import { normalize, resolve, sep } from 'node:path'
import { CV_MAX_BYTES, CV_MIME_TYPES } from '@hr/shared'
import { env } from '../env.js'

/**
 * Where uploaded files live.
 *
 * Everything the rest of the server knows about storage is in this file: it
 * hands back an opaque key, and takes that key back to read or delete. Moving to
 * S3 or R2 later means rewriting these three functions and nothing else — no
 * route, no table and no page knows what a path is.
 */

const ROOT = resolve(env.UPLOAD_DIR)

export interface StoredFile {
  /** The file's bytes, for the caller to store. */
  content: Buffer
  /** The opaque key stored in the database. Never sent to a client. */
  storedPath: string
  sizeBytes: number
  mimeType: string
  fileName: string
}

export class UploadRejected extends Error {
  constructor(readonly code: 'fileTooLarge' | 'fileTypeNotAllowed' | 'fileEmpty') {
    super(code)
  }
}

/**
 * The first bytes of a file, which say what it actually is.
 *
 * A browser sends whatever `Content-Type` it likes and a script can send
 * anything at all, so the declared type is a hint, not evidence. A .exe renamed
 * to .pdf passes every check that only reads the name.
 */
function sniff(bytes: Uint8Array): keyof typeof CV_MIME_TYPES | null {
  // %PDF-
  if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) return 'application/pdf'
  // PK.. — a zip container, which is what .docx is.
  if (bytes[0] === 0x50 && bytes[1] === 0x4b && (bytes[2] === 0x03 || bytes[2] === 0x05 || bytes[2] === 0x07)) {
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  }
  // D0 CF 11 E0 — the OLE compound file that carries legacy .doc.
  if (bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0) return 'application/msword'
  return null
}

/**
 * Strips everything that makes a filename dangerous, keeping it recognisable.
 *
 * The result is only ever used for display and for the download header — the
 * name on disk is a fresh uuid — but a name that reaches a `Content-Disposition`
 * header still has to be free of quotes, newlines and path separators.
 */
export function safeFileName(raw: string): string {
  const base = raw.split(/[/\\]/).pop() ?? 'file'
  const cleaned = base
    .replace(/[\u0000-\u001f\u007f"\\]/g, '')
    .replace(/\.{2,}/g, '.')
    .trim()
  return (cleaned || 'file').slice(0, 160)
}

export async function saveUpload(file: File): Promise<StoredFile> {
  if (file.size === 0) throw new UploadRejected('fileEmpty')
  if (file.size > CV_MAX_BYTES) throw new UploadRejected('fileTooLarge')

  const bytes = new Uint8Array(await file.arrayBuffer())
  // Re-check after reading: `file.size` is reported by the client.
  if (bytes.byteLength === 0) throw new UploadRejected('fileEmpty')
  if (bytes.byteLength > CV_MAX_BYTES) throw new UploadRejected('fileTooLarge')

  const actual = sniff(bytes)
  if (!actual) throw new UploadRejected('fileTypeNotAllowed')

  /**
   * The bytes are returned, not written.
   *
   * They used to go to disk under `uploads/YYYY/MM/<uuid>.<ext>`, which is the
   * right place on a machine that keeps its disk. The hosting this is going to
   * does not: a free instance restarts after fifteen minutes idle and comes back
   * with an empty filesystem, so the row would survive and the file would not.
   *
   * The caller stores them in `cv_files.content` instead. `storedPath` stays
   * empty on new uploads and is kept only for rows written before the move.
   */
  return {
    storedPath: '',
    content: Buffer.from(bytes),
    sizeBytes: bytes.byteLength,
    // The sniffed type, not the declared one — this is what gets served back.
    mimeType: actual,
    fileName: safeFileName(file.name),
  }
}

/**
 * Resolves a stored key to a path inside the uploads root, or refuses.
 *
 * Keys are generated here and never come from a client, but this is the one
 * place a path is built from stored text, so it is the place to make `../`
 * impossible rather than to assume it cannot happen.
 */
function resolveInsideRoot(storedPath: string): string {
  const full = resolve(ROOT, normalize(storedPath))
  if (full !== ROOT && !full.startsWith(ROOT + sep)) {
    throw new Error(`refusing to touch a path outside the uploads root: ${storedPath}`)
  }
  return full
}

/**
 * The bytes of a stored file, wherever they happen to live.
 *
 * New rows carry them in `content`. Rows written before the move to the
 * database carry a path instead, and those still have to resolve — so both are
 * handled here, in one place, and no caller has to know which kind it has.
 */
export async function readUpload(row: { content: Buffer | null; storedPath: string }): Promise<Buffer> {
  if (row.content) return row.content
  if (!row.storedPath) throw new Error('stored file has neither contents nor a path')
  return readFile(resolveInsideRoot(row.storedPath))
}

/**
 * Removing a file that is already gone is success, not an error.
 *
 * A row whose bytes are in the database has nothing on disk to unlink — the
 * row's deletion removed them — so an empty path is simply done.
 */
export async function removeUpload(storedPath: string): Promise<void> {
  if (!storedPath) return
  try {
    await unlink(resolveInsideRoot(storedPath))
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e
  }
}

export function checksum(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

export const uploadsRoot = ROOT
