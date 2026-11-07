// Incoming loopback HTTP is allowed. Every outgoing client transport is denied.
import http from 'node:http'
import https from 'node:https'
import net from 'node:net'
import tls from 'node:tls'
import dns from 'node:dns'
import dgram from 'node:dgram'
import http2 from 'node:http2'
import {registerHooks,syncBuiltinESMExports} from 'node:module'
let blocked=0
const deny=()=>{blocked++;const e=new Error('OUTBOUND_NETWORK_DENIED');e.code='OUTBOUND_NETWORK_DENIED';throw e}
for(const m of [http,https]){m.request=deny;m.get=deny}
net.connect=deny;net.createConnection=deny;net.Socket.prototype.connect=deny;tls.connect=deny;http2.connect=deny;dgram.createSocket=deny
for(const key of Object.keys(dns))if(/^(lookup|resolve|reverse)/.test(key)&&typeof dns[key]==='function')dns[key]=deny
for(const key of Object.keys(dns.promises))if(typeof dns.promises[key]==='function')dns.promises[key]=async()=>deny()
// Node's listener resolves even a literal host. Answer locally; never invoke DNS.
dns.lookup=(host,options,callback)=>{if(host!=='127.0.0.1')return deny();const cb=typeof options==='function'?options:callback;if(typeof cb!=='function')return deny();process.nextTick(()=>options?.all?cb(null,[{address:'127.0.0.1',family:4}]):cb(null,'127.0.0.1',4))}
dns.promises.lookup=async(host,options)=>{if(host!=='127.0.0.1')return deny();return options?.all?[{address:'127.0.0.1',family:4}]:{address:'127.0.0.1',family:4}}
globalThis.fetch=async()=>deny();globalThis.WebSocket=class{constructor(){deny()}};if(globalThis.EventSource)globalThis.EventSource=class{constructor(){deny()}}
syncBuiltinESMExports()
const allowed=new Set(['node:fs','node:path','node:url','node:crypto','node:http','node:assert/strict','node:module','node:perf_hooks'])
registerHooks({resolve(spec,context,next){if(spec.startsWith('node:')&&!allowed.has(spec)||!spec.startsWith('node:')&&!spec.startsWith('.')&&!spec.startsWith('file:')&&!/^[A-Z]:/i.test(spec)){const e=new Error('MODULE_NOT_ALLOWED');e.code='MODULE_NOT_ALLOWED';throw e}return next(spec,context)}})
export const guardStatus=()=>({outboundBlocked:true,blockedAttempts:blocked,externalCalls:0,modelCalls:0})
