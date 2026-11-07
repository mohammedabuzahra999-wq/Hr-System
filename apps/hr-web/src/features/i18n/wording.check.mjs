import { readFileSync } from 'node:fs'

/**
 * Every suggestion offered has words behind it.
 *
 * `t()` returns the generic error sentence for a key it does not know, so a
 * missing entry does not fail anywhere — it renders "something went wrong" as
 * a suggestion chip, which reads as the assistant being broken. It has
 * happened twice: once when `howDoI` was added, once when `listApplications`
 * was. Both times the typechecker was happy and the screen was not.
 *
 * Read as text rather than imported, because the dictionary is TypeScript and
 * this has to run without a build step.
 */
const intents = readFileSync('../../services/hr-api/src/copilot/intents.ts', 'utf8')
const dictionary = readFileSync('src/features/i18n/dictionary.ts', 'utf8')

const all = [...intents.match(/INTENT_ROLES[^=]*=\s*\{([\s\S]*?)\n\}/)[1].matchAll(/^ {2}([a-zA-Z]+):/gm)].map(
  (m) => m[1],
)

/** Not questions: a greeting, an instruction, and the refusal itself. */
const notOffered = new Set(['greeting', 'doAction', 'outOfScope'])
const offered = all.filter((i) => !notOffered.has(i))

let missing = 0
for (const intent of offered) {
  const key = `'copilot.ex.${intent}'`
  /* Both languages: one entry alone renders the error in the other. */
  const times = dictionary.split(key).length - 1
  const ok = times >= 2
  if (!ok) missing += 1
  console.log(`${ok ? '  ✓' : '  ✗'} ${intent}${ok ? '' : `  — found ${times} of 2`}`)
}

console.log(missing === 0 ? `\nall ${offered.length} suggestions have wording` : `\n${missing} without wording`)
process.exit(missing === 0 ? 0 : 1)
