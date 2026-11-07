// Independently authored from the approved ontology. No reference corpus inputs.
// Four columns: English, MSA, Jordanian, natural Arabic/English code switching.
export const L = ['en', 'ar-MSA', 'ar-JO', 'mixed'];
const row = (en, msa, jo, mixed) => [en, msa, jo, mixed];
export const concepts = {
myAttendance: [
 row('my personal attendance history','سجل حضوري الشخصي','سجل دوامي أنا','سجل attendance الخاص فيني'),
 row('the days recorded as present or absent for me','الأيام المسجلة لي كحضور أو غياب','أيام حضوري وغيابي المسجلة إلي','أيام present وabsent المسجلة إلي'),
 row('my own arrival and absence record','سجلي أنا في الحضور والغياب','حركات حضوري وغيابي أنا','سجل حضوري الشخصي والـ absence'),
 row('my attendance entries rather than anyone else’s','قيود حضوري أنا دون سجلات الآخرين','تسجيلات دوامي أنا مش دوام غيري','attendance تبعي أنا مش سجلات الفريق')],
myLeaveBalance: [
 row('the annual leave I still have available','ما تبقى لي من رصيد الإجازة السنوية','قديش ضايل إلي من الإجازة السنوية','رصيد annual leave المتبقي إلي'),
 row('my remaining sick-leave allowance','رصيد إجازاتي المرضية المتبقي','رصيد المرضي اللي ضايل إلي','رصيد sick leave المتبقي عندي'),
 row('my own available annual and sick leave','رصيدي المتاح من الإجازة السنوية والمرضية','رصيد السنوي والمرضي تبعي أنا','annual وsick leave المتاحين إلي'),
 row('the leave balance on my personal account','رصيد الإجازات في حسابي الشخصي','رصيد الإجازات بحسابي أنا','leave balance الموجود بحسابي الشخصي')],
myRequests: [
 row('the recent requests I submitted myself','الطلبات الأخيرة التي قدمتها بنفسي','آخر الطلبات اللي أنا قدمتها','الـ requests الأخيرة اللي قدمتها أنا'),
 row('my own request list without a status filter','قائمة طلباتي أنا دون تصفية بحسب الحالة','قائمة طلباتي أنا بدون فلترة حالة','قائمة requests تبعتي بدون status filter'),
 row('the request history available in my account','سجل الطلبات المتاح في حسابي','سجل الطلبات الموجود بحسابي','request history الموجود بحسابي'),
 row('the current statuses shown for all my recent requests','الحالات المعروضة لجميع طلباتي الأخيرة','الحالات الظاهرة لآخر طلباتي كلها','الـ statuses المعروضة لكل طلباتي الأخيرة')],
myPayslips: [
 row('the recent payslips belonging to me','قسائم الراتب الأخيرة الخاصة بي','قسائم الراتب الأخيرة تبعتي','آخر payslips الخاصة فيني'),
 row('my own pay information in the system','معلومات راتبي أنا في النظام','معلومات راتبي أنا بالنظام','معلومات pay الخاصة فيني بالنظام'),
 row('the latest salary slips on my account','أحدث كشوف الراتب في حسابي','آخر كشوف راتب بحسابي','آخر salary slips الموجودة بحسابي'),
 row('my personal net-pay and payslip view','عرض صافي راتبي وقسائم راتبي الشخصية','عرض صافي راتبي وكشوفاتي أنا','عرض net pay وكشوف الراتب تبعتي')],
payrollInsights: [row('the company payroll view for {topic}','عرض رواتب الشركة المتعلق بـ{topic}','عرض رواتب الشركة بخصوص {topic}','عرض company payroll الخاص بـ{topic}')],
payrollReadiness: [
 row('whether the company payroll cycle is ready for review','جاهزية دورة رواتب الشركة للمراجعة','إذا دورة رواتب الشركة جاهزة للمراجعة','إذا payroll cycle بالشركة جاهزة للمراجعة'),
 row('the review readiness of our payroll cycle','حالة استعداد دورة الرواتب للمراجعة','حالة جاهزية دورة الرواتب للمراجعة','حالة readiness لدورة رواتب الشركة'),
 row('the readiness checks on the company pay cycle','فحوص جاهزية دورة رواتب المؤسسة','فحوص الجاهزية لدورة رواتب المؤسسة','readiness checks لدورة الرواتب بالمؤسسة'),
 row('the payroll-cycle status and its review blockers','حالة دورة الرواتب والعوائق أمام مراجعتها','حالة دورة الرواتب وشو معطل مراجعتها','حالة payroll cycle وعوائق المراجعة')],
payrollRunSummary: [
 row('the gross pay, deductions and net total for a company payroll run','إجمالي الأجر والاستقطاعات والصافي في تشغيل رواتب الشركة','إجمالي الرواتب والخصومات والصافي بتشغيل رواتب الشركة','gross pay والخصومات والصافي بتشغيل رواتب الشركة'),
 row('the totals recorded for a company payroll run','الإجماليات المسجلة لتشغيل رواتب المؤسسة','الإجماليات المسجلة لتشغيل رواتب المؤسسة','الـ totals المسجلة لتشغيل رواتب المؤسسة'),
 row('the employee count and totals on our payroll run','عدد الموظفين والإجماليات في تشغيل الرواتب','عدد الموظفين وإجماليات تشغيل الرواتب','employee count وإجماليات payroll run'),
 row('a summary of the company payroll run amounts','ملخص مبالغ تشغيل رواتب الشركة','ملخص مبالغ تشغيل رواتب الشركة','ملخص مبالغ company payroll run')],
payrollAuditSummary: [
 row('the latest payroll-audit finding counts by severity','أعداد ملاحظات أحدث تدقيق للرواتب بحسب الخطورة','أعداد ملاحظات آخر تدقيق رواتب حسب الخطورة','أعداد payroll audit findings حسب الخطورة'),
 row('the severity summary of the most recent payroll audit','ملخص درجات الخطورة في أحدث تدقيق للرواتب','ملخص درجات الخطورة بآخر تدقيق رواتب','ملخص severity بآخر payroll audit'),
 row('the counts of critical and high payroll-audit findings','أعداد ملاحظات تدقيق الرواتب الحرجة والعالية','أعداد ملاحظات تدقيق الرواتب الحرجة والعالية','أعداد critical وhigh findings بتدقيق الرواتب'),
 row('the summary of the latest company payroll audit','ملخص أحدث تدقيق لرواتب الشركة','ملخص آخر تدقيق لرواتب الشركة','ملخص آخر payroll audit بالشركة')],
payrollFindings: [
 row('the payroll audit findings still awaiting review','ملاحظات تدقيق الرواتب التي تنتظر المراجعة','ملاحظات تدقيق الرواتب اللي لساتها بدها مراجعة','payroll findings اللي لساتها بدها مراجعة'),
 row('the unresolved findings from the company payroll audit','الملاحظات غير المعالجة من تدقيق رواتب الشركة','الملاحظات المفتوحة من تدقيق رواتب الشركة','الـ unresolved findings بتدقيق رواتب الشركة'),
 row('the payroll audit items requiring a reviewer','بنود تدقيق الرواتب التي تتطلب مراجعاً','بنود تدقيق الرواتب اللي بدها مراجع','payroll audit items اللي بدها مراجع'),
 row('the open payroll-audit review queue','قائمة مراجعة ملاحظات الرواتب المفتوحة','قائمة مراجعة ملاحظات الرواتب المفتوحة','قائمة open payroll audit findings')],
teamPresentNow: [
 row('which of my direct reports are currently online','من من مرؤوسي المباشرين موجود الآن في النظام','مين من الموظفين اللي بتبعولي موجود هسا بالنظام','مين من direct reports تبعوني online هسا'),
 row('the people in my team who are in the system now','أفراد فريقي الموجودون في النظام الآن','أفراد فريقي الموجودين بالنظام هسا','أفراد فريقي الموجودين بالـ system هسا'),
 row('the current online presence of my own team','الوجود الحالي في النظام لفريقي أنا','وجود فريقي أنا بالنظام حالياً','الـ online presence لفريقي أنا حالياً'),
 row('who among the staff reporting to me is online','من الموجود الآن من الموظفين الذين يرفعون تقاريرهم إلي','مين الموجود هسا من الموظفين اللي برفعولي تقاريرهم','مين online من الموظفين اللي برفعولي تقاريرهم')],
teamAttendance: [
 row('the attendance history of my direct reports','سجل حضور مرؤوسي المباشرين','سجل دوام الموظفين اللي بتبعولي','attendance history للموظفين اللي بتبعولي'),
 row('attendance and absence across the team I manage','الحضور والغياب في الفريق الذي أديره','الحضور والغياب بالفريق اللي أنا بديره','attendance والغياب بالفريق اللي أنا بديره'),
 row('the attendance entries for my own team members','قيود حضور أعضاء فريقي أنا','تسجيلات حضور أفراد فريقي أنا','attendance entries لأفراد فريقي أنا'),
 row('how attendance is recorded for people reporting to me','بيانات حضور الموظفين الذين يرفعون تقاريرهم إلي','بيانات دوام الموظفين اللي برفعولي تقاريرهم','بيانات attendance للموظفين اللي برفعولي تقاريرهم')],
teamOnLeave: [
 row('which members of my team are on leave','أعضاء فريقي الموجودين في إجازة','مين من أفراد فريقي بإجازة','مين من أفراد فريقي on leave'),
 row('the leave list for my direct reports','قائمة إجازات مرؤوسي المباشرين','قائمة إجازات الموظفين اللي بتبعولي','leave list للموظفين اللي بتبعولي'),
 row('leave affecting the staff I supervise','الإجازات الخاصة بالموظفين الذين أشرف عليهم','إجازات الموظفين اللي أنا مشرف عليهم','الـ leave للموظفين اللي أنا مشرف عليهم'),
 row('the approved leave entries for my own team','الإجازات المعتمدة الخاصة بفريقي أنا','الإجازات الموافق عليها لفريقي أنا','approved leave الخاص بفريقي أنا')],
teamPendingApprovals: [
 row('the requests waiting for my decision as manager','الطلبات التي تنتظر قراري بصفتي مديراً','الطلبات اللي بتستنى قراري كمدير','requests اللي بتستنى قراري كمدير'),
 row('the approval queue assigned to me','قائمة الموافقات المسندة إلي','قائمة الموافقات المسندة إلي','approval queue المسندة إلي'),
 row('which team requests need my approval','طلبات الفريق التي تحتاج موافقتي','أي طلبات بالفريق بدها موافقتي','طلبات الفريق اللي بدها approval مني'),
 row('my pending managerial request decisions','قرارات الطلبات الإدارية المعلقة لدي','طلبات الموافقات الإدارية المعلقة عندي','pending approvals الإدارية الموجودة عندي')],
teamRoster: [
 row('the people who report directly to me and their job titles','أسماء مرؤوسي المباشرين ومسمياتهم الوظيفية','الموظفين اللي بتبعولي ومسمياتهم الوظيفية','direct reports تبعوني ومسمياتهم الوظيفية'),
 row('the roster of the team I manage','قائمة أعضاء الفريق الذي أديره','قائمة أعضاء الفريق اللي أنا بديره','roster الفريق اللي أنا بديره'),
 row('the membership of my own reporting team','أعضاء فريقي المباشر أنا','أعضاء فريقي المباشر أنا','أعضاء direct team الخاص فيني'),
 row('which employees are assigned directly under my supervision','الموظفين المسندين مباشرة إلى إشرافي','الموظفين المسندين مباشرة لإشرافي','الموظفين اللي هم direct reports لإلي')],
headcount: [
 row('the total number of employees across the company','إجمالي عدد الموظفين في الشركة كاملة','إجمالي عدد الموظفين بالشركة كلها','total headcount بالشركة كلها'),
 row('the organisation-wide employee count','عدد موظفي المؤسسة على مستوى المؤسسة كلها','عدد موظفي المؤسسة كلها','employee count على مستوى المؤسسة كلها'),
 row('how many employees the whole company has','عدد الموظفين في كامل الشركة','كم موظف بالشركة كاملة','عدد employees بالشركة كاملة'),
 row('the overall workforce size for our company','حجم القوى العاملة للشركة ككل','حجم القوى العاملة بالشركة ككل','workforce size للشركة ككل')],
departmentBreakdown: [
 row('the employee distribution by department in {department}','توزيع الموظفين بحسب القسم مع التركيز على {department}','توزيع الموظفين حسب القسم وبالتحديد {department}','employee breakdown حسب القسم وبالتحديد {department}'),
 row('the department headcount breakdown including {department}','تفصيل أعداد الموظفين بحسب الأقسام بما فيها {department}','تفصيل أعداد الموظفين بالأقسام ومنها {department}','department headcount breakdown ومنها {department}'),
 row('the department-level workforce figures for {department}','أرقام القوى العاملة على مستوى القسم {department}','أرقام الموظفين على مستوى القسم {department}','workforce figures على مستوى القسم {department}'),
 row('the staff grouping for department {department}','تجميع الموظفين للقسم {department}','تجميع الموظفين للقسم {department}','staff grouping للقسم {department}')],
departmentAbsenceComparison: [
 row('a comparison of absence rates between departments','مقارنة نسب الغياب بين الأقسام','مقارنة نسب الغياب بين الأقسام','مقارنة absence rates بين الأقسام'),
 row('how departmental absence rates compare','مقارنة معدلات الغياب على مستوى الأقسام','كيف معدلات الغياب بتتقارن بين الأقسام','كيف absence rates بتتقارن بين الأقسام'),
 row('the differences in recorded absence between departments','الفروق في الغياب المسجل بين الأقسام','الفروقات بالغياب المسجل بين الأقسام','الفروقات بالـ recorded absence بين الأقسام'),
 row('the department-by-department absence comparison','مقارنة الغياب قسماً بقسم','مقارنة الغياب قسم بقسم','absence comparison قسم بقسم')],
orgAttendance: [
 row('the company attendance figures for department {department}','أرقام حضور الشركة الخاصة بالقسم {department}','أرقام حضور الشركة الخاصة بالقسم {department}','company attendance الخاص بالقسم {department}'),
 row('the organisation attendance view filtered to {department}','عرض حضور المؤسسة المقتصر على {department}','عرض حضور المؤسسة المقتصر على {department}','عرض organisation attendance المقتصر على {department}'),
 row('the attendance and absence totals in department {department}','إجماليات الحضور والغياب في القسم {department}','إجماليات الحضور والغياب بالقسم {department}','attendance والغياب بالقسم {department}'),
 row('the recorded attendance across department {department}','الحضور المسجل على مستوى القسم {department}','الحضور المسجل على مستوى القسم {department}','recorded attendance على مستوى القسم {department}')],
orgLeaveSummary: [
 row('the company-wide leave overview','ملخص الإجازات على مستوى الشركة','ملخص الإجازات على مستوى الشركة','leave overview على مستوى الشركة'),
 row('leave usage across the whole organisation','استخدام الإجازات في المؤسسة كاملة','استخدام الإجازات بالمؤسسة كلها','leave usage بالمؤسسة كلها'),
 row('the leave totals covering all company employees','إجماليات الإجازات لجميع موظفي الشركة','إجماليات الإجازات لكل موظفي الشركة','leave totals لكل موظفي الشركة'),
 row('the organisation-wide summary of recorded leave','ملخص الإجازات المسجلة للمؤسسة كلها','ملخص الإجازات المسجلة للمؤسسة كلها','ملخص recorded leave للمؤسسة كلها')],
recruitmentSummary: [
 row('the counts of open vacancies and received applications','أعداد الشواغر المفتوحة وطلبات التوظيف المستلمة','أعداد الشواغر المفتوحة وطلبات التوظيف المستلمة','counts للشواغر المفتوحة وطلبات التوظيف'),
 row('the company recruitment totals rather than applicant names','إجماليات التوظيف بالشركة دون أسماء المتقدمين','إجماليات التوظيف بالشركة مش أسماء المتقدمين','recruitment totals بالشركة مش أسماء المتقدمين'),
 row('an overview of vacancy and application numbers','نظرة عامة على أعداد الشواغر والطلبات','نظرة عامة على أعداد الشواغر والطلبات','overview لأعداد vacancies والطلبات'),
 row('the recruitment pipeline counts for the company','أعداد مراحل التوظيف على مستوى الشركة','أعداد مراحل التوظيف على مستوى الشركة','recruitment pipeline counts على مستوى الشركة')],
openJobOpenings: [
 row('the titles and locations of open company vacancies','مسميات الشواغر المفتوحة في الشركة ومواقعها','مسميات الشواغر المفتوحة بالشركة ومواقعها','titles ومواقع الشواغر المفتوحة بالشركة'),
 row('which job openings are currently available','الوظائف الشاغرة المتاحة حالياً','شو الوظائف الشاغرة المتاحة هسا','الـ job openings المتاحة هسا'),
 row('the list of open roles rather than application counts','قائمة الوظائف المفتوحة دون أعداد طلبات التوظيف','قائمة الوظائف المفتوحة مش أعداد الطلبات','قائمة open roles مش أعداد الطلبات'),
 row('the published vacancies that are still open','الشواغر المنشورة التي ما زالت مفتوحة','الشواغر المنشورة اللي لساتها مفتوحة','published vacancies اللي لساتها مفتوحة')],
listApplications: [
 row('the applicants and their current recruitment stages','المتقدمين للوظائف ومراحلهم الحالية','المتقدمين للوظائف ومراحلهم الحالية','applicants ومراحلهم الحالية بالتوظيف'),
 row('the people who applied and the vacancies they chose','الأشخاص الذين تقدموا والوظائف التي اختاروها','الأشخاص اللي تقدموا والوظائف اللي اختاروها','الأشخاص اللي قدموا والـ vacancies اللي اختاروها'),
 row('the actual application list rather than its total','قائمة طلبات التوظيف نفسها وليس إجماليها','قائمة طلبات التوظيف نفسها مش مجموعها','application list نفسها مش مجموعها'),
 row('the submitted applications with their stages and job titles','طلبات التوظيف المقدمة مع المراحل والمسميات','طلبات التوظيف المقدمة مع المراحل والمسميات','applications المقدمة مع stages والمسميات')],
whoIsPresentNow: [
 row('who is online across the entire company right now','الموجودين الآن في النظام من جميع موظفي الشركة','مين موجود هسا بالنظام من كل الشركة','مين online هسا من كل الشركة'),
 row('the company-wide list of people currently in the system','قائمة الموجودين حالياً في النظام على مستوى الشركة','قائمة الموجودين هسا بالنظام على مستوى الشركة','قائمة الموجودين online على مستوى الشركة'),
 row('current online presence across the whole organisation','الوجود الحالي في النظام على مستوى المؤسسة كاملة','الموجودين بالنظام هسا بالمؤسسة كلها','online presence هسا بالمؤسسة كلها'),
 row('the employees in the system now regardless of department','الموظفين الموجودين الآن في النظام من جميع الأقسام','الموظفين الموجودين هسا بالنظام من كل الأقسام','الموظفين online هسا من كل الأقسام')],
attendanceRanking: [row('the company attendance ranking ordered by {rank}','ترتيب حضور موظفي الشركة وفق {rank}','ترتيب حضور موظفي الشركة حسب {rank}','attendance ranking لموظفي الشركة حسب {rank}')],
generateReport: [row('a written company report about {report}','تقرير مكتوب عن {report} على مستوى الشركة','تقرير مكتوب عن {report} على مستوى الشركة','تقرير company عن {report} بشكل مكتوب')],
myReport: [row('a written report about my own {selfReport}','تقرير مكتوب عن {selfReport} الخاصة بي أنا','تقرير مكتوب عن {selfReport} تبعتي أنا','تقرير مكتوب عن {selfReport} الخاصة فيني أنا')],
employeeFile: [row('{employeeView} for the employee {person}','{employeeView} للموظف {person}','{employeeView} للموظف {person}','{employeeView} للـ employee {person}')],
knowledge: [
 row('what our company handbook says about remote-work eligibility','ما يذكره دليل الشركة عن أهلية العمل عن بعد','شو بحكي دليل الشركة عن أهلية الشغل عن بعد','شو بحكي company handbook عن أهلية الشغل عن بعد'),
 row('the company policy on requesting a work certificate','سياسة الشركة المتعلقة بطلب شهادة عمل','سياسة الشركة بخصوص طلب شهادة عمل','company policy بخصوص طلب شهادة عمل'),
 row('the documented onboarding procedure in our company','إجراءات التهيئة الوظيفية الموثقة في الشركة','إجراءات التهيئة الوظيفية المكتوبة بالشركة','إجراءات onboarding المكتوبة بالشركة'),
 row('the rules in our employee handbook for annual leave','قواعد الإجازة السنوية في دليل الموظفين بالشركة','قواعد الإجازة السنوية بدليل الموظفين بالشركة','قواعد annual leave بدليل الموظفين بالشركة')],
howDoI: [
 row('how to find the request history screen in this HR system','كيفية الوصول إلى شاشة سجل الطلبات في النظام','كيف أوصل لشاشة سجل الطلبات بالنظام','كيف أوصل لشاشة request history بالنظام'),
 row('the steps for using the attendance page without submitting anything','خطوات استخدام صفحة الحضور دون إرسال أي إجراء','خطوات استخدام صفحة الحضور بدون ما أرسل إشي','خطوات استخدام attendance page بدون ما أرسل إشي'),
 row('what the employee profile page is used for','الغرض من صفحة الملف الوظيفي في النظام','لشو بتستخدم صفحة الملف الوظيفي بالنظام','لشو بتستخدم employee profile page بالنظام'),
 row('where the system displays my notification settings','مكان عرض إعدادات إشعاراتي في النظام','وين النظام بعرض إعدادات إشعاراتي','وين النظام بعرض notification settings تبعتي')]
};

export const topics = {
summary: row('payroll totals','إجماليات الرواتب','إجماليات الرواتب','payroll totals'), readiness: row('cycle readiness','جاهزية الدورة','جاهزية الدورة','cycle readiness'),
adjustments: row('pending and approved pay adjustments','تعديلات الرواتب المعلقة والمعتمدة','تعديلات الرواتب المعلقة والموافق عليها','pending وapproved payroll adjustments'),
overtime: row('overtime amounts','مبالغ العمل الإضافي','مبالغ الأوفرتايم','overtime amounts'), bonuses: row('bonus amounts','مبالغ المكافآت','مبالغ المكافآت','bonus amounts'), deductions: row('deduction amounts','مبالغ الاستقطاعات','مبالغ الخصومات','deduction amounts'),
highestNetPay: row('the highest net-pay ranking','ترتيب أعلى صافي راتب','ترتيب أعلى صافي راتب','highest net pay ranking'), lowestNetPay: row('the lowest net-pay ranking','ترتيب أدنى صافي راتب','ترتيب أقل صافي راتب','lowest net pay ranking'),
contracts: row('active salary agreements','اتفاقيات الرواتب السارية','اتفاقيات الرواتب الفعالة','active salary agreements'), variance: row('month-to-month payroll changes','تغيرات الرواتب بين الأشهر','تغيرات الرواتب بين الأشهر','month-to-month payroll changes'), findings: row('open payroll audit findings','ملاحظات تدقيق الرواتب المفتوحة','ملاحظات تدقيق الرواتب المفتوحة','open payroll findings')
};
export const reports = {
attendance: row('attendance','الحضور','الحضور','attendance'), leave: row('leave','الإجازات','الإجازات','leave'), employees: row('employees','الموظفين','الموظفين','employees'), newHires: row('employees who joined during the stated period','الموظفين الذين التحقوا خلال الفترة المحددة','الموظفين اللي التحقوا خلال الفترة المحددة','new hires خلال الفترة المحددة'), recruitment: row('recruitment','التوظيف','التوظيف','recruitment'), department: row('department comparisons','مقارنة الأقسام','مقارنة الأقسام','department comparisons')
};
export const ranks = { present: row('most days present','أكثر أيام حضور','أكثر أيام حضور','most days present'), absent: row('most days absent','أكثر أيام غياب','أكثر أيام غياب','most days absent'), late: row('most late arrivals','أكثر مرات تأخر','أكثر مرات تأخير','most late arrivals') };
export const periods = {
today: row('today','اليوم','اليوم','اليوم'), thisWeek: row('this week','هذا الأسبوع','هالأسبوع','هالـ week'), thisMonth: row('this month','هذا الشهر','هالشهر','هالـ month'), lastMonth: row('last month','الشهر الماضي','الشهر اللي راح','last month'), lastSixMonths: row('over the last six months','خلال آخر ستة أشهر','خلال آخر ست شهور','خلال آخر six months'), thisYear: row('this year','هذا العام','هالسنة','هالـ year')
};
export const months = [row('January','يناير','كانون الثاني','January'),row('February','فبراير','شباط','February'),row('March','مارس','آذار','March'),row('April','أبريل','نيسان','April'),row('May','مايو','أيار','May'),row('June','يونيو','حزيران','June'),row('July','يوليو','تموز','July'),row('August','أغسطس','آب','August'),row('September','سبتمبر','أيلول','September'),row('October','أكتوبر','تشرين الأول','October'),row('November','نوفمبر','تشرين الثاني','November'),row('December','ديسمبر','كانون الأول','December')];

export const questionFrames = {
train: [
 row('I would like to check {x}.','أود الاطلاع على {x}.','بدي أطلع على {x}.','بدي أراجع {x} لو سمحت.'),
 row('Could you pull up {x} for me?','هل يمكنك إظهار {x} لي؟','ممكن تطلعلي {x}؟','ممكن تعرضلي {x} بالـ system؟'),
 row('My question for HR concerns {x}.','يتعلق سؤالي للموارد البشرية بـ{x}.','سؤالي للموارد البشرية بخصوص {x}.','سؤالي للـ HR بخصوص {x}.'),
 row('I need a clear view of {x}.','أحتاج إلى عرض واضح لـ{x}.','بدي صورة واضحة عن {x}.','بدي view واضح بخصوص {x}.'),
 row('Please help me review {x}.','أرجو مساعدتي في الاطلاع على {x}.','لو سمحت ساعدني أراجع {x}.','لو سمحت ساعدني أراجع {x} بالنظام.'),
 row('The information I am looking for is {x}.','المعلومات التي أبحث عنها هي {x}.','المعلومة اللي بدور عليها هي {x}.','المعلومات اللي بدور عليها بخصوص {x}.'),
 row('Can the HR assistant display {x}?','هل يستطيع مساعد الموارد البشرية عرض {x}؟','بقدر مساعد الموارد البشرية يعرض {x}؟','بقدر HR assistant يعرض {x}؟'),
 row('Let me see the HR records covering {x}.','أرجو عرض بيانات الموارد البشرية المتعلقة بـ{x}.','خليني أشوف بيانات الموارد البشرية بخصوص {x}.','خليني أشوف HR data بخصوص {x}.')],
dev: [
 row('For an HR review I am doing, could you retrieve {x}?','ضمن مراجعتي للبيانات الوظيفية، هل يمكن استرجاع {x}؟','ضمن مراجعتي للبيانات الوظيفية، بتقدر تجيب {x}؟','ضمن مراجعة HR عندي، ممكن تجيب {x}؟'),
 row('The specific HR view I want to open for reading covers {x}.','أرغب بقراءة العرض الوظيفي المخصص لـ{x}.','بدي أقرأ العرض الوظيفي المخصص لـ{x}.','بدي أقرأ HR view المخصص لـ{x}.'),
 row('Would you bring together the available details about {x}?','هل يمكنك جمع التفاصيل المتاحة بخصوص {x}؟','ممكن تجمعلي التفاصيل المتاحة بخصوص {x}؟','ممكن تجمعلي available details بخصوص {x}؟'),
 row('I am trying to understand {x}; what does this system show?','أحاول فهم {x}؛ فما الذي يعرضه النظام؟','بحاول أفهم {x}؛ شو بعرض النظام؟','بحاول أفهم {x}؛ شو بعرض الـ system؟')],
internalTest: [
 row('Without making any changes, tell me what is recorded regarding {x}.','دون إجراء أي تعديل، أطلعني على البيانات المتعلقة بـ{x}.','بدون ما تغير أي إشي، احكيلي عن البيانات الخاصة بـ{x}.','بدون changes، احكيلي عن البيانات الخاصة بـ{x}.'),
 row('There is one HR subject I need information on: {x}.','هناك موضوع وظيفي أحتاج معلومات عنه، وهو {x}.','في موضوع وظيفي بدي معلومات عنه، وهو {x}.','في HR subject بدي معلومات عنه، وهو {x}.'),
 row('Which information is available to read in relation to {x}?','ما المعلومات المتاحة للقراءة فيما يتعلق بـ{x}؟','شو المعلومات اللي بقدر أقرأها بخصوص {x}؟','شو المعلومات available للقراءة بخصوص {x}؟'),
 row('For the HR enquiry I have in mind, the relevant subject is {x}.','الموضوع المقصود في استفساري الوظيفي هو {x}.','الموضوع المقصود بسؤالي الوظيفي هو {x}.','الموضوع المقصود بسؤالي للـ HR هو {x}.')]
};
