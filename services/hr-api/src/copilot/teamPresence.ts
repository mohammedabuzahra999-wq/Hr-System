import { foldRead } from './readPeriods.js'

/** Application presence only; no attendance, location or project membership inference. */
export function teamPresenceDecision(question: string): 'resolved' | 'abstain' | 'unmatched' {
  const text = foldRead(question).replace(/[?؟!.]+$/u, '').trim()
    .replace(/^(?:please |could you |can you |من فضلك )/u, '')
  const scope = '(?:my team|members of my team|my direct reports)'
  const presence = '(?:online|connected|here now|present now|currently online)'
  if (new RegExp(`^(?:who (?:in|on) ${scope} is|which (?:members of my team|of my direct reports) are) ${presence}(?: now)?$`, 'u').test(text)
    || new RegExp(`^(?:show|list|display)(?: me)? (?:the )?(?:current application presence of ${scope}|${scope} (?:members )?(?:who are )?(?:online|connected)(?: now)?)$`, 'u').test(text)
    || /^(?:(?:مين|من) من (?:فريقي|فريق عملي) (?:متصل|متصلين|اونلاين)(?: الان| حاليا)?|(?:اعرض|ورجيني) (?:المتصلين|الاونلاين) من فريقي(?: الان| حاليا)?)$/u.test(text)) return 'resolved'
  // Presence-looking queries with incomplete/conflicting evidence must not reach fuzzy rules.
  if ((/\b(?:who|which|show|list|display)\b|مين|اعرض|ورجيني|^من /u.test(text))
    && /\b(?:online|connected|present|presence|here now|clocked|office|onsite)\b|متصل|اونلاين|بالمكتب/u.test(text)) return 'abstain'
  return 'unmatched'
}
