// Host-side transport guard plus native permissions; VM imports have a second allowlist.
import {registerHooks} from 'node:module'
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
const native=globalThis.fetch.bind(globalThis),allowedEnv=new Set(['NODE_ENV','TZ','SystemRoot','SYSTEMROOT','WINDIR','TEMP','TMP'])
for(const k of Object.keys(process.env))if(!allowedEnv.has(k))delete process.env[k]
const denied=/^(?:node:)?(?:http|https|http2|net|tls|dns|dgram|child_process|worker_threads|inspector)(?:\/|$)|^(?:openai|dotenv|pg|postgres|@modelcontextprotocol)(?:\/|$)/
registerHooks({resolve(spec,context,next){if(denied.test(spec))throw Object.assign(Error('ISOLATED_MODULE_DENIED'),{code:'ISOLATED_MODULE_DENIED'});return next(spec,context)}})
export function assertTransport(url,options={}){
 const u=String(url);if(!['http://127.0.0.1:11434/api/chat','http://127.0.0.1:11434/api/tags','http://127.0.0.1:11434/api/version'].includes(u))throw Object.assign(Error('NETWORK_DESTINATION_DENIED'),{code:'NETWORK_DESTINATION_DENIED'})
 if(options.redirect&&options.redirect!=='error')throw Error('REDIRECT_POLICY_DENIED')
 if(Object.keys(options.headers||{}).some(k=>!['content-type'].includes(k.toLowerCase())))throw Error('CREDENTIAL_HEADER_DENIED')
 if(u.endsWith('/chat')){if(options.method!=='POST'||typeof options.body!=='string'||!options.signal)throw Error('INVALID_MODEL_TRANSPORT');const b=JSON.parse(options.body),lock=JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)),'baseline-lock.json'),'utf8'));if(b.model!=='qwen3:4b'||b.stream!==false||b.think!==false||!b.format||Buffer.byteLength(options.body)>250000||b.keep_alive!==lock.inference.keepAlive||JSON.stringify(b.options)!==JSON.stringify(lock.inference.options))throw Error('INVALID_MODEL_TRANSPORT')}
 else if(options.method&&options.method!=='GET')throw Error('METADATA_MUST_BE_READ_ONLY')
 return true
}
globalThis.fetch=async(url,options={})=>{assertTransport(url,options);return native(url,{...options,redirect:'error'})}
globalThis.WebSocket=class{constructor(){throw Error('WEBSOCKET_DENIED')}}
