// Trusted, hash-pinned offline tool guard; native Node permissions are also required.
import { registerHooks } from 'node:module'
const denied = /^(?:node:)?(?:http|https|http2|net|tls|dns|dgram|child_process|worker_threads|inspector)(?:\/|$)|^(?:openai|dotenv|pg|postgres|@modelcontextprotocol)(?:\/|$)/
registerHooks({resolve(specifier,context,next){if(denied.test(specifier))throw Object.assign(new Error('OFFLINE_MODULE_DENIED'),{code:'OFFLINE_MODULE_DENIED'});return next(specifier,context)}})
globalThis.fetch = async()=>{throw Object.assign(new Error('OFFLINE_NETWORK_DENIED'),{code:'OFFLINE_NETWORK_DENIED'})}
globalThis.WebSocket = class {constructor(){throw new Error('OFFLINE_NETWORK_DENIED')}}

