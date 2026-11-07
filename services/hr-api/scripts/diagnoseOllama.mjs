import './runtimePreload.mjs'
import { z } from 'zod'

// Diagnostic only. Never prints environment secrets or model reasoning text.
const base = (process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434').replace(/\/+$/, '')
const model = 'qwen3:4b'
const schema = z.object({ status: z.string() }).strict()
const seconds = (ns) => typeof ns === 'number' ? +(ns / 1e9).toFixed(3) : null
async function probe(path, body) {
  const response = await fetch(`${base}${path}`, {
    method: body ? 'POST' : 'GET',
    ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(5000),
  })
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${path}`)
  return response.json()
}
try {
  const tags = await probe('/api/tags')
  const url = new URL(base)
  console.log(JSON.stringify({ reachable: true, host: url.host, installed: tags.models?.some(m => m.name === model) }))
  const version = await probe('/api/version')
  const show = await probe('/api/show', { model })
  const ps = await probe('/api/ps')
  console.log(JSON.stringify({ version: version.version, capabilities: show.capabilities, thinking: show.thinking,
    modelDetails: show.details, loadedModels: ps.models?.map(m => ({ name: m.name, size: m.size, size_vram: m.size_vram })) }))
  const cases = process.argv.includes('--followup') ? [
    ['normal-no-think-prompt', false, false],
    ['structured-no-think-prompt', true, false],
    ['original-default', true, undefined],
    ['original-no-think', true, false],
  ] : [
    ['normal-default', false, undefined], ['structured-default', true, undefined],
    ['normal-no-thinking', false, false], ['structured-no-thinking', true, false],
  ]
  for (const [name, structured, think] of cases) {
    const original = name.startsWith('original')
    const outputSchema = original ? z.object({ department: z.literal('HR'), employeeCount: z.literal(3) }).strict() : schema
    const suffix = name.includes('no-think-prompt') || name === 'original-no-think' ? ' /no_think' : ''
    console.log(`START ${name}`)
    const start = performance.now()
    try {
      const response = await fetch(`${base}/api/chat`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(120000),
        body: JSON.stringify({ model, stream: false,
          messages: original ? [
            { role: 'system', content: 'Extract the supplied facts. Return only JSON matching the provided schema.' },
            { role: 'user', content: 'The department is HR and it has exactly 3 employees.' + suffix },
          ] : [{ role: 'user', content: (structured ? 'Return JSON with status set to OK only.' : 'Reply with OK only.') + suffix }],
          options: { temperature: 0 },
          ...(structured ? { format: z.toJSONSchema(outputSchema, { io: 'input' }) } : {}),
          ...(think === undefined ? {} : { think }),
        }),
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const result = await response.json()
      let valid = false
      try { valid = structured ? outputSchema.safeParse(JSON.parse(result.message?.content)).success : result.message?.content?.trim() === 'OK' } catch {}
      console.log(JSON.stringify({ name, pass: valid && result.done === true && result.done_reason !== 'length',
        wallSeconds: +((performance.now() - start) / 1000).toFixed(3), totalSeconds: seconds(result.total_duration),
        loadSeconds: seconds(result.load_duration), promptEvalSeconds: seconds(result.prompt_eval_duration),
        evalSeconds: seconds(result.eval_duration), evalCount: result.eval_count,
        tokensPerSecond: result.eval_duration > 0 ? +(result.eval_count / (result.eval_duration / 1e9)).toFixed(2) : null,
        thinkingCharacters: result.message?.thinking?.length ?? 0,
        content: valid ? result.message?.content : '(unexpected content omitted)',
        contentCharacters: result.message?.content?.length ?? 0, doneReason: result.done_reason }))
    } catch (error) {
      console.log(JSON.stringify({ name, pass: false, wallSeconds: +((performance.now() - start) / 1000).toFixed(3), error: error.name === 'TimeoutError' ? '120-second timeout' : error.message }))
    }
  }
  const finalPs = await probe('/api/ps')
  console.log(JSON.stringify({ loadedModelsAfter: finalPs.models?.map(m => ({ name: m.name, size: m.size, size_vram: m.size_vram })) }))
} catch (error) {
  console.error(`Diagnostic failed: ${error.message}`)
  process.exitCode = 1
}
