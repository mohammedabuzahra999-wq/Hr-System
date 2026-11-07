/** Shared Unicode name grammar from the existing employee-detail read rule.
 * No directory, name catalogue, identity lookup or inferred employee id.
 */
export function extractReadPersonName(value: string): string | null {
  const name = value.trim()
  if (/\sو[\p{L}\p{M}]+/u.test(name)) return null // uncertain Arabic conjunction vs compound name
  if (!/^[\p{L}\p{M}]+(?:[’'.-][\p{L}\p{M}]+)*(?:\s+[\p{L}\p{M}]+(?:[’'.-][\p{L}\p{M}]+)*){0,5}$/u.test(name)) return null
  const words = name.normalize('NFKD').toLowerCase().replace(/[\u064b-\u065f\u0670]/gu, '').replace(/[أإآٱ]/gu, 'ا').split(/\s+/u)
  const reserved = new Set(['me', 'my', 'myself', 'our', 'all', 'everyone', 'employees', 'staff', 'employee', 'someone', 'anyone',
    'him', 'her', 'his', 'their', 'them', 'that', 'this', 'the', 'and', 'or', 'for', 'of', 'from', 'in', 'with', 'department',
    'company', 'team', 'payroll', 'salary', 'overtime', 'attendance', 'leave', 'last', 'next', 'month', 'year', 'week',
    'some', 'any', 'other', 'maybe', 'perhaps', 'probably', 'unknown', 'called', 'whose', 'works', 'i', 'you', 'we', 'us', 'not', "don't", 'please',
    'انا', 'نفسي', 'الجميع', 'كل', 'هو', 'هي', 'تبعه', 'تبعها', 'احد', 'حدا', 'شخص', 'موظف', 'الموظف', 'الموظفين',
    'الشركه', 'الشركة', 'القسم', 'الفريق', 'او', 'و', 'من', 'في', 'الذي', 'اللي', 'الماضي', 'الشهر', 'اسبوع', 'الحضور', 'يمكن', 'ربما', 'مش', 'غير'])
  return words.some(word => reserved.has(word)) ? null : name
}
