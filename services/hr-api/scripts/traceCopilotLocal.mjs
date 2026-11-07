import { readFileSync } from 'node:fs'
import ts from 'typescript'

// Export private tracing helpers from an IN-MEMORY copy. Production source is never edited.
const original = new URL('../src/copilot/training.ts', import.meta.url)
const source = readFileSync(original, 'utf8') + '\nexport { commonActionInstruction, bestExample, employeeFileLookup, namedEmployeeAttendancePlan, namedEmployeePayrollPlan };'
let code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.ESNext } }).outputText
code = code.replaceAll('import.meta.url', JSON.stringify(original.href))
  .replace(/from ['"](.\/[^'"]+)\.js['"]/g, (_match, path) => `from ${JSON.stringify(new URL(path + '.ts', original).href)}`)
const trace = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'))
for (const input of ['Show me my leave balance', "Show Ahmed's employee details", 'كم أوفرتايم أحمد الشهر الماضي', 'ورجيني overtime تبع أحمد الشهر الماضي']) {
  const best = trace.bestExample(input, 'hr')
  console.log(JSON.stringify({ input, commonAction: trace.commonActionInstruction(input),
    employeeLookup: trace.employeeFileLookup(input), namedAttendance: trace.namedEmployeeAttendancePlan(input, 'hr'),
    namedPayroll: trace.namedEmployeePayrollPlan(input, 'hr'),
    bestExample: best ? { id: best.example.id, route: best.example.route, score: best.score, sourceRole: best.example.sourceRole } : null,
    localPlan: trace.localTrainingPlan(input, 'hr') }))
}
