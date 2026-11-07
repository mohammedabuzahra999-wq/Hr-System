import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import {pathToFileURL} from 'node:url'
import {randomBytes} from 'node:crypto'
import {CRITERIA,TOOL_VERSION} from './criteria.mjs'
import {HERE,ROOT,loadRealRepository,ToolError,DEFINITIONS} from './repository.mjs'
import {ReviewStore} from './store.mjs'
import {guardStatus} from './network-guard.mjs'
const CSP="default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'"
export async function createReviewServer({repo,storageDir,port=5194}){
 if(!process.permission||process.permission.has('child')||process.permission.has('worker'))throw new ToolError('USE_RESTRICTED_START_COMMAND',503)
 const store=new ReviewStore(repo,storageDir),token=randomBytes(32).toString('hex')
 const staticFiles=new Map([['/',['index.html','text/html; charset=utf-8']],['/app.js',['app.js','text/javascript; charset=utf-8']],['/style.css',['style.css','text/css; charset=utf-8']]])
 const server=http.createServer(async(req,res)=>{
  res.setHeader('Content-Security-Policy',CSP);res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Cross-Origin-Resource-Policy','same-origin');res.setHeader('Cache-Control','no-store');res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=()')
  const send=(status,value)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(value))}
  try{
   const bound=server.address().port,host=String(req.headers.host??'').toLowerCase(),allowed=new Set([`localhost:${bound}`,`127.0.0.1:${bound}`]),origin=`http://${host}`
   if(!['127.0.0.1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress)||!allowed.has(host)||req.headers.origin&&!new Set([...allowed].map(h=>'http://'+h)).has(req.headers.origin)||req.headers['sec-fetch-site']==='cross-site')throw new ToolError('LOCAL_SAME_ORIGIN_ONLY',403)
   const url=new URL(req.url,origin);if(url.origin!==origin)throw new ToolError('LOCAL_SAME_ORIGIN_ONLY',403)
   const write=['POST','PUT'].includes(req.method)
   if(write&&(req.headers['x-review-token']!==token||String(req.headers['content-type']??'').split(';')[0]!=='application/json'))throw new ToolError('LOCAL_WRITE_TOKEN_REQUIRED',403)
   async function body(){let n=0,chunks=[];for await(const chunk of req){n+=chunk.length;if(n>65536)throw new ToolError('REQUEST_TOO_LARGE',413);chunks.push(chunk)}try{return JSON.parse(Buffer.concat(chunks).toString('utf8'))}catch{throw new ToolError('INVALID_JSON')}}
   if(req.method==='GET'&&staticFiles.has(url.pathname)){const[file,type]=staticFiles.get(url.pathname);res.writeHead(200,{'Content-Type':type});res.end(fs.readFileSync(path.join(HERE,'public',file)));return}
   if(req.method==='GET'&&url.pathname==='/api/bootstrap'){repo.assertIntegrity();send(200,{version:TOOL_VERSION,token,criteria:CRITERIA,assets:repo.manifest,safety:guardStatus(),records:repo.records.map(({id,asset,assetLabel,language,role,ordinal,recordHash})=>({id,asset,assetLabel,language,role,ordinal,recordHash})),...store.state()});return}
   if(req.method==='GET'&&url.pathname.startsWith('/api/records/')){repo.assertIntegrity();const r=repo.get(decodeURIComponent(url.pathname.slice(13)));send(200,{record:r,review:store.reviews.get(r.id)??null,revision:store.revision});return}
   if(req.method==='PUT'&&url.pathname==='/api/profile'){const b=await body();send(200,store.saveProfile(b.profile,b.expectedRevision));return}
   if(req.method==='PUT'&&url.pathname.startsWith('/api/reviews/')){const b=await body();send(200,store.saveReview(decodeURIComponent(url.pathname.slice(13)),b));return}
   if(req.method==='POST'&&url.pathname==='/api/export'){if(!store.profile)throw new ToolError('REVIEWER_INFORMATION_REQUIRED');const b=await body();if(b.expectedRevision!==store.revision)throw new ToolError('STALE_REVIEW_REFRESH_REQUIRED',409);send(200,{export:store.exportEvidence(),...store.state()});return}
   if(req.method==='GET'&&url.pathname.startsWith('/api/exports/')){const name=decodeURIComponent(url.pathname.slice(13)),bytes=store.readExport(name);res.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Content-Disposition':`attachment; filename="${name}"`});res.end(bytes);return}
   throw new ToolError('ROUTE_NOT_FOUND',404)
  }catch(e){if(!(e instanceof ToolError))console.error('LOCAL_TOOL_INTERNAL '+String(e.code??e.name)+' '+String(e.stack??'').split('\n').slice(1,4).join(' '));if(!res.headersSent)send(e instanceof ToolError?e.status:500,{error:e instanceof ToolError?e.code:'LOCAL_TOOL_ERROR'});else res.end()}
 })
 server.requestTimeout=30000;server.headersTimeout=10000;server.keepAliveTimeout=5000
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve)})
 return{server,store,port:server.address().port,close:()=>new Promise(resolve=>server.close(resolve))}
}
export async function startRealServer(){
 for(const d of DEFINITIONS)if(process.permission.has('fs.write',path.resolve(HERE,'..',d.file)))throw new ToolError('ORIGINAL_ASSET_WRITES_MUST_BE_DENIED',503)
 const app=await createReviewServer({repo:loadRealRepository(),storageDir:path.join(HERE,'storage')})
 console.log('Local human review: http://localhost:5194 — Runtime 320 / Selection 160. No decisions or admissions generated.')
 for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{app.server.close(()=>process.exit(0))})
 return app
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)startRealServer().catch(e=>{console.error(e instanceof ToolError?e.code:'LOCAL_REVIEW_START_FAILED');process.exitCode=1})
