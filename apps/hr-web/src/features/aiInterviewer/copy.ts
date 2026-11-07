import { useI18n } from '@/features/i18n/useI18n'

export function useInterviewCopy() {
  const i18n = useI18n()
  return { ...i18n, s: (en: string, ar: string) => i18n.lang === 'ar' ? ar : en }
}
export function interviewError(code: string, ar: boolean) {
  if (code === 'invitationExchangeUncertain') return ar ? 'تعذر تأكيد الدعوة. اطلب رابطاً جديداً من مسؤول التوظيف.' : 'We could not confirm your invitation. Please ask your recruiter for a new link.'
  if (code === 'invitationInvalid' || code === 'validationFailed') return ar ? 'رابط الدعوة غير صالح أو منتهي أو تم إلغاؤه. اطلب دعوة جديدة من مسؤول التوظيف.' : 'This invitation is invalid, expired or revoked. Ask your recruiter for a new invitation.'
  if (code === 'candidateSessionInvalid') return ar ? 'انتهت جلسة المقابلة أو تم إلغاؤها. تواصل مع مسؤول التوظيف.' : 'Your interview session has expired or was revoked. Please contact your recruiter.'
  if (code === 'interviewProviderUnavailable') return ar ? 'المقابلة غير متاحة في هذه البيئة حالياً. تواصل مع مسؤول التوظيف.' : 'Interview delivery is unavailable in this environment. Please contact your recruiter.'
  if (code === 'networkUnavailable') return ar ? 'تعذر الاتصال بالخادم. أعد الاتصال لاستعادة آخر حالة محفوظة.' : 'The server could not be reached. Reconnect to restore the latest saved state.'
  if (code === 'tooManyRequests') return ar ? 'طلبات كثيرة خلال وقت قصير. انتظر قليلاً ثم حاول مجدداً.' : 'Too many requests. Please wait a moment before trying again.'
  return ar ? 'تعذر إكمال الطلب. حدّث الحالة وحاول مجدداً، أو تواصل مع مسؤول التوظيف.' : 'We could not complete that request. Refresh the status and try again, or contact your recruiter.'
}
