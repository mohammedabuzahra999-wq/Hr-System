import { z } from 'zod'
import { candidateAiInterviewUiStateSchema } from './aiInterviewUi.js'

const key=z.string().min(1).max(160).regex(/^[a-zA-Z0-9_.:-]+$/)
export const playbackScopeSchema=z.object({interviewId:z.uuid(),sessionVersion:z.number().int().positive(),playbackId:key,questionId:key.nullable(),turnId:key.nullable()}).strict()
export const preparePlaybackSchema=playbackScopeSchema.extend({requestId:z.uuid(),expectedVersion:z.number().int().nonnegative()}).strict()
export const playbackActionSchema=playbackScopeSchema.extend({generationId:z.uuid(),documentId:z.uuid()}).strict()
export const inspectPlaybackSchema=playbackScopeSchema.extend({documentId:z.uuid()}).strict()
export const playbackResultSchema=z.object({generationId:z.uuid().nullable(),status:z.enum(['NONE','GENERATING','READY','PLAYING','STOPPED','COMPLETED','ERROR','CLOSED']),durationMs:z.number().min(0).max(62500),finishAt:z.number().nullable(),state:candidateAiInterviewUiStateSchema}).strict()
export type PlaybackScope=z.infer<typeof playbackScopeSchema>
export type PreparePlayback=z.infer<typeof preparePlaybackSchema>
export type PlaybackAction=z.infer<typeof playbackActionSchema>
export type PlaybackResult=z.infer<typeof playbackResultSchema>
export function validPlaybackWav(bytes:Uint8Array) {
  if(!(bytes instanceof Uint8Array)||bytes.byteLength<46||bytes.byteLength>2000000||bytes.byteLength%2)return false
  const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),text=(a:number,b:number)=>String.fromCharCode(...bytes.subarray(a,b))
  return text(0,4)==='RIFF'&&text(8,16)==='WAVEfmt '&&text(36,40)==='data'&&v.getUint32(4,true)+8===bytes.length&&v.getUint32(16,true)===16&&v.getUint16(20,true)===1&&v.getUint16(22,true)===1&&v.getUint32(24,true)===16000&&v.getUint32(28,true)===32000&&v.getUint16(32,true)===2&&v.getUint16(34,true)===16&&v.getUint32(40,true)+44===bytes.length
}
