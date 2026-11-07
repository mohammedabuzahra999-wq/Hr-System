// AUTOMATED WORKFLOW FIXTURE ONLY. Never points to actual controlled-asset decisions.
import fs from 'node:fs'
import {makeRepository} from '../repository.mjs'
import {createReviewServer} from '../server.mjs'
try{const config=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));const repo=makeRepository(config.definitions);if(repo.records.some(r=>!r.id.startsWith('TEST_ONLY_')))throw Error('FIXTURE_IDS_REQUIRED');const app=await createReviewServer({repo,storageDir:config.storageDir,port:0});console.log(JSON.stringify({fixtureReady:true,port:app.port}));process.on('SIGTERM',()=>app.server.close(()=>process.exit(0)))}catch(e){console.error(e.code??'FIXTURE_START_FAILED');process.exitCode=1}
