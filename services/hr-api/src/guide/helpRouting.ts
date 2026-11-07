import type { Role } from '@hr/shared'
import { foldRead } from '../copilot/readPeriods.js'
import { GUIDE_TASKS } from './tasks.js'

/** Complete instructional grammar plus a maintained, role-visible task. Never an action. */
export function maintainedHelpDecision(question: string, role: Role) {
  const text = foldRead(question).replace(/[?؟!.]+$/u, '').trim().replace(/^please /u, '')
  const match = /^(?:how (?:do|can|should) i|how to|where (?:do|can) i|show me how to|كيف(?: (?:بقدر|اقدر|بدي|يمكنني))?|شو طريقه|ما طريقه) (.+)$/u.exec(text)
  if (!match) return { kind: 'unmatched' } as const
  const body = match[1]!
  const patterns: readonly [string, RegExp][] = [
    ['requestLeave', /^(?:(?:request|submit|apply for)(?: an?| my)? (?:annual |sick )?(?:leave|vacation|time off)(?: request)?|(?:اقدم|اطلب|ارسل)(?: طلب)? اجازه(?: سنويه| مرضيه)?)$/u],
    ['checkIn', /^(?:check (?:in|out)|record my attendance|اسجل حضوري|اسجل انصرافي)$/u],
    ['publishJob', /^(?:(?:publish|post) (?:a |the )?(?:job|vacancy|job opening)|انشر (?:وظيفه|شاغر))$/u],
    ['generateJobDescription', /^(?:(?:generate|create|write) (?:a |the )?job description|(?:انشئ|اكتب) وصف وظيفي)$/u],
    ['reviewApplications', /^(?:(?:review|view) (?:job )?applications|اراجع طلبات التوظيف)$/u],
    ['lookUpEmployee', /^(?:(?:find|look up) (?:an? )?employee by (?:employee )?number|ابحث عن موظف برقمه)$/u],
    ['decideLeave', /^(?:(?:approve|reject) (?:a )?leave request|(?:اوافق علي|ارفض) طلب اجازه)$/u],
    ['postAnnouncement', /^(?:(?:post|create|publish) (?:an? )?announcement|انشر اعلان)$/u],
    ['askAssistant', /^(?:(?:use|open) (?:the )?(?:assistant|copilot)|استخدم المساعد)$/u],
  ]
  const id = patterns.find(([, pattern]) => pattern.test(body))?.[0]
  const task = GUIDE_TASKS.find(task => task.id === id && task.roles.includes(role))
  return task ? { kind: 'resolved', task } as const : { kind: 'abstain' } as const
}
