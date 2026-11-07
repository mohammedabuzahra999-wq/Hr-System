import { deriveCriteria, historyWeighted, MIN_HIRES_FOR_HISTORY, scoreFrom, type Criterion } from '@hr/shared'
import type { JobDescriptionContent, RequirementMatch } from '@hr/shared'

/**
 * The score is arithmetic, so it can be checked like arithmetic.
 *
 * It used to be a number the model wrote, and there was nothing to assert about
 * it — you could read the figure and shrug. Now every score is a weighted sum
 * over verdicts, which means a wrong one is a bug with a reproduction rather
 * than a bad day for the model.
 *
 * Run with: npm run check:scorecard -w @hr/server
 */

let failures = 0
function check(ok: boolean, what: string) {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${what}`)
  if (!ok) failures += 1
}

const L = (en: string) => ({ en, ar: en })
const list = (...items: string[]) => ({ en: items, ar: items })

const content: JobDescriptionContent = {
  title: L('Backend Developer'),
  summary: L(''),
  responsibilities: list('Write services'),
  requiredQualifications: list('Bachelor in Computer Science'),
  requiredSkills: list('Python', 'PostgreSQL', 'English'),
  preferredSkills: list('Kubernetes'),
  softSkills: list(),
  experience: L('3 years'),
  education: L('Bachelor'),
  workingConditions: null,
}

const verdicts = (given: Record<string, RequirementMatch['verdict']>): RequirementMatch[] =>
  Object.entries(given).map(([requirement, verdict]) => ({
    requirement,
    kind: 'skill' as const,
    verdict,
    evidence: verdict === 'notEvidenced' ? '' : 'quoted from the CV',
    gap: '',
  }))

console.log('Criteria come from the document, in a fixed order:')
const plain = deriveCriteria(content, null)
check(plain.length === 7, `seven requirements found (got ${plain.length})`)
check(plain[0]!.key === 'Bachelor in Computer Science', 'qualifications first')
check(
  plain.every((c) => c.weight === 0),
  'nothing is weighted until somebody weights it — no defaults anywhere',
)
check(
  scoreFrom(plain, verdicts({ Python: 'met' })).score === null,
  'and a vacancy nobody has weighted has no score, rather than a zero',
)

console.log('\nA weight somebody set replaces the default:')
const weighted = deriveCriteria(content, {
  weights: [
    { key: 'English', weight: 10 },
    { key: 'Python', weight: 5 },
  ],
})
check(weighted.find((c) => c.key === 'English')?.weight === 10, 'English is worth 10')
check(weighted.find((c) => c.key === 'Python')?.weight === 5, 'Python is worth 5')
check(
  weighted.find((c) => c.key === 'PostgreSQL')?.weight === 0,
  'a requirement nobody weighted stays at zero',
)

console.log('\nThe sum:')
const only = (labels: string[], weight: number): Criterion[] =>
  labels.map((key, i) => ({ id: `c${i + 1}`, key, label: { en: key, ar: key }, kind: 'skill' as const, weight, custom: false }))

check(
  scoreFrom(only(['a', 'b'], 1), verdicts({ a: 'met', b: 'met' })).score === 100,
  'everything met is 100',
)
check(
  scoreFrom(only(['a', 'b'], 1), verdicts({ a: 'notEvidenced', b: 'notEvidenced' })).score === 0,
  'nothing evidenced is 0',
)
check(
  scoreFrom(only(['a', 'b'], 1), verdicts({ a: 'met', b: 'notEvidenced' })).score === 50,
  'half of two equal requirements is 50',
)
check(
  scoreFrom(only(['a'], 1), verdicts({ a: 'partial' })).score === 50,
  'a partial match is worth half',
)

console.log('\nWeight is what makes one requirement matter more than another:')
const heavy: Criterion[] = [
  { id: 'c1', key: 'English', label: { en: 'English', ar: 'الإنجليزي' }, kind: 'skill', weight: 9, custom: false },
  { id: 'c2', key: 'Kubernetes', label: { en: 'Kubernetes', ar: 'Kubernetes' }, kind: 'preferred', weight: 1, custom: false },
]
check(
  scoreFrom(heavy, verdicts({ English: 'met', Kubernetes: 'notEvidenced' })).score === 90,
  'the heavy one met and the light one missing is 90',
)
check(
  scoreFrom(heavy, verdicts({ English: 'notEvidenced', Kubernetes: 'met' })).score === 10,
  'the other way round is 10',
)

console.log('\nThe edges:')
check(
  scoreFrom(only(['a', 'b'], 0), verdicts({ a: 'met', b: 'met' })).score === null,
  'no score at all when every weight is zero, rather than a 0 that reads as a bad candidate',
)
const ignored: Criterion[] = [
  { id: 'c1', key: 'English', label: { en: 'English', ar: 'الإنجليزي' }, kind: 'skill', weight: 3, custom: false },
  { id: 'c2', key: 'Kubernetes', label: { en: 'Kubernetes', ar: 'Kubernetes' }, kind: 'preferred', weight: 0, custom: false },
]
check(
  scoreFrom(ignored, verdicts({ English: 'met', Kubernetes: 'notEvidenced' })).score === 100,
  'a requirement weighted 0 is still judged and still counts for nothing',
)
check(
  scoreFrom(only(['a'], 3), []).score === 0,
  'a criterion the model said nothing about counts as not evidenced, never as skipped',
)
check(
  scoreFrom(only(['a'], 3), verdicts({ 'something else entirely': 'met' })).score === 0,
  'a reworded requirement cannot be matched back, and does not silently score',
)

console.log('\nRequirements HR added:')
const withExtra = deriveCriteria(content, {
  weights: [],
  extra: [
    { key: 'Sales', kind: 'skill', weight: 40 },
    /* Already stated by the document, so it must not appear a second time. */
    { key: 'Python', kind: 'skill', weight: 99 },
  ],
})
check(
  withExtra.filter((c) => c.key === 'Python').length === 1,
  'an added duplicate of a stated requirement is dropped',
)
check(
  withExtra.find((c) => c.key === 'Python')?.custom === false,
  'and the stated one is the one that survives',
)
const sales = withExtra.find((c) => c.key === 'Sales')
check(sales?.weight === 40 && sales.custom === true, 'a genuinely new requirement is added, marked as added')
check(
  withExtra.indexOf(sales!) === withExtra.length - 1,
  'added requirements come after the ones the document states',
)
check(
  scoreFrom(
    [
      { id: 'c1', key: 'Python', label: { en: 'Python', ar: 'Python' }, kind: 'skill', weight: 30, custom: false },
      { id: 'c2', key: 'Sales', label: { en: 'Sales', ar: 'Sales' }, kind: 'skill', weight: 70, custom: true },
    ],
    verdicts({ Python: 'met', Sales: 'notEvidenced' }),
  ).score === 30,
  'weights adding to 100 make each weight its own percentage',
)

console.log('\nThe hiring record, as a second set of weights:')
const three = [
  { id: 'c1', key: 'English', label: { en: 'English', ar: 'English' }, kind: 'skill' as const, weight: 10, custom: false },
  { id: 'c2', key: 'Git', label: { en: 'Git', ar: 'Git' }, kind: 'skill' as const, weight: 90, custom: false },
]
/* Everyone hired showed English; none of them showed Git. */
const record = { hired: 4, perCriterion: [{ key: 'English', evidenced: 4 }, { key: 'Git', evidenced: 0 }] }
const reweighted = historyWeighted(three, record)
check(
  reweighted.find((c) => c.key === 'English')?.weight === 100,
  'a requirement every hire evidenced carries full weight in the second figure',
)
check(
  reweighted.find((c) => c.key === 'Git')?.weight === 0,
  'and one none of them evidenced carries none',
)

const said = verdicts({ English: 'met', Git: 'notEvidenced' })
check(scoreFrom(three, said).score === 10, 'by the weights that were set, this candidate scores 10')
check(scoreFrom(reweighted, said).score === 100, 'by the hiring record, the same verdicts score 100')
check(
  MIN_HIRES_FOR_HISTORY >= 3,
  'and none of it is shown below three hires, where the pattern is one person',
)

console.log(
  failures === 0 ? '\nthe scorecard adds up' : `\n${failures} failed`,
)
process.exit(failures === 0 ? 0 : 1)
