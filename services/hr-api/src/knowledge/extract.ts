import { extractText, getDocumentProxy } from 'unpdf'
import mammoth from 'mammoth'
import { safeFileName } from '../storage/files.js'

export const KNOWLEDGE_MAX_BYTES = 8 * 1024 * 1024
const MAX_TEXT_CHARS = 80_000

export class KnowledgeUploadRejected extends Error {
  constructor(readonly code: 'knowledgeFileEmpty' | 'knowledgeFileTooLarge' | 'knowledgeFileType' | 'knowledgeFileUnreadable') {
    super(code)
  }
}

function extension(name: string) {
  const match = /\.([a-z0-9]+)$/i.exec(name)
  return match?.[1]?.toLowerCase() ?? ''
}

function tidy(raw: string) {
  return raw
    .replace(/\r\n?/g, '\n')
    .replace(/[\t \u00a0]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, MAX_TEXT_CHARS)
}

async function pdfText(bytes: Buffer) {
  const pdf = await getDocumentProxy(new Uint8Array(bytes))
  const { text } = await extractText(pdf, { mergePages: true })
  return Array.isArray(text) ? text.join('\n') : text
}

async function docxText(bytes: Buffer) {
  const { value } = await mammoth.extractRawText({ buffer: bytes })
  return value
}

/**
 * Reads a company reference document. Files are never served back from this
 * feature: after text extraction they are discarded, leaving an auditable,
 * searchable knowledge entry without a second document-download surface.
 */
export async function extractKnowledgeFile(file: File): Promise<{ title: string; fileName: string; text: string }> {
  if (file.size === 0) throw new KnowledgeUploadRejected('knowledgeFileEmpty')
  if (file.size > KNOWLEDGE_MAX_BYTES) throw new KnowledgeUploadRejected('knowledgeFileTooLarge')

  const fileName = safeFileName(file.name)
  const ext = extension(fileName)
  if (!['pdf', 'docx', 'txt', 'md'].includes(ext)) throw new KnowledgeUploadRejected('knowledgeFileType')

  const bytes = Buffer.from(await file.arrayBuffer())
  if (bytes.byteLength === 0) throw new KnowledgeUploadRejected('knowledgeFileEmpty')
  if (bytes.byteLength > KNOWLEDGE_MAX_BYTES) throw new KnowledgeUploadRejected('knowledgeFileTooLarge')

  let raw: string
  try {
    if (ext === 'pdf') {
      if (!(bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46)) {
        throw new KnowledgeUploadRejected('knowledgeFileType')
      }
      raw = await pdfText(bytes)
    } else if (ext === 'docx') {
      // DOCX is a zip package. The extension check prevents treating an arbitrary
      // zip upload as a Word file, and Mammoth performs the document parsing.
      if (!(bytes[0] === 0x50 && bytes[1] === 0x4b)) throw new KnowledgeUploadRejected('knowledgeFileType')
      raw = await docxText(bytes)
    } else {
      raw = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    }
  } catch (error) {
    if (error instanceof KnowledgeUploadRejected) throw error
    throw new KnowledgeUploadRejected('knowledgeFileUnreadable')
  }

  const text = tidy(raw)
  if (text.length < 40) throw new KnowledgeUploadRejected('knowledgeFileUnreadable')
  return { title: fileName.replace(/\.[^.]+$/, '') || 'Company knowledge', fileName, text }
}
