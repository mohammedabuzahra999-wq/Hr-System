import type { GuideTask } from '@hr/shared'

/**
 * The things people actually try to do, and what it takes to do them.
 *
 * Every step below was walked through in the real interface, not inferred from
 * the code. The difference shows up in the caveats: "publishing refuses until
 * the description is approved" is not visible from a route table, and it is the
 * single thing most likely to stop somebody — so it is said before they hit it
 * rather than discovered as an error.
 *
 * `triggers` are the words a person uses, in both languages, matched before the
 * model is involved. Retrieval by plain string matching rather than embeddings
 * because there are a dozen tasks, not a thousand, and an exact match is both
 * cheaper and more predictable than a nearest neighbour.
 */

const L = (en: string, ar: string) => ({ en, ar })

export const GUIDE_TASKS: GuideTask[] = [
  {
    id: 'publishJob',
    roles: ['hr', 'admin'],
    title: L('Publish a job vacancy', 'نشر وظيفة شاغرة'),
    triggers: ['publish', 'vacancy', 'job post', 'careers', 'نشر', 'وظيفة', 'شاغر', 'إعلان وظيفة'],
    steps: [
      { path: '/hr/job-descriptions', text: L('Write the job description first: enter the role and its requirements, then generate.', 'اكتب الوصف الوظيفي أولاً: أدخل المسمّى ومتطلباته، وبعدين ولّد.') },
      { path: '/hr/job-descriptions', text: L('Read what came back, edit anything by hand, then press Approve.', 'اقرأ الي طلع، عدّل أي إشي بإيدك، وبعدين اضغط اعتماد.') },
      { path: '/hr/recruitment', text: L('Approving creates a draft vacancy here by itself. You do not create it separately.', 'الاعتماد بينشئ وظيفة مسودّة هون لحاله. ما بتحتاج تعملها لحالك.') },
      { path: '/hr/recruitment', text: L('Press the pencil to edit the vacancy and fill in the location — a description never states it.', 'اضغط القلم لتعدّل الوظيفة وتعبّي الموقع — الوصف ما بيذكره أبداً.') },
      { path: '/hr/recruitment', text: L('Press Publish job. The row will then say "open · published" and a copy-link button appears.', 'اضغط نشر الوظيفة. الصف بيصير يقول «مفتوحة · منشورة» وبيظهر زر انسخ الرابط.') },
      { path: '/hr/recruitment', text: L('Copy the LinkedIn post text from the block below and paste it there yourself.', 'انسخ نصّ منشور لينكدإن من المربّع تحت والصقه هناك بنفسك.') },
    ],
    caveats: [
      L('Publishing is refused until the job description is approved — a draft is not enough.', 'النشر بينرفض لحد ما ينعتمد الوصف الوظيفي — المسودّة ما بتكفي.'),
      L('It is also refused if the location or employment type is missing. The message names what is missing.', 'وبينرفض كمان إذا الموقع أو نوع التوظيف ناقص. الرسالة بتسمّي الناقص.'),
      L('Posting to LinkedIn automatically needs partner API access this company does not have, so that step is manual.', 'النشر التلقائي على لينكدإن بحتاج وصول شراكة مش متوفّر للشركة، فهاي الخطوة يدوية.'),
    ],
  },
  {
    id: 'generateJobDescription',
    roles: ['hr', 'admin'],
    title: L('Generate a job description with AI', 'توليد وصف وظيفي بالذكاء الاصطناعي'),
    triggers: ['job description', 'generate', 'ai description', 'وصف وظيفي', 'توليد', 'ذكاء اصطناعي'],
    steps: [
      { path: '/hr/job-descriptions', text: L('Describe the role in your own words, and fill in whichever fields you have.', 'اوصف الوظيفة بكلامك، وعبّي الحقول الي عندك.') },
      { path: '/hr/job-descriptions', text: L('Press Generate. It takes a few seconds and saves as a draft straight away.', 'اضغط توليد. بياخد ثواني وبينحفظ كمسودّة فوراً.') },
      { path: '/hr/job-descriptions', text: L('Any section you edit is marked as reviewed by a person, permanently.', 'أي قسم بتعدّله بينتعلّم إنّه مراجَع من إنسان، للأبد.') },
      { path: '/hr/job-descriptions', text: L('Press Approve when it is right.', 'اضغط اعتماد لما يصير صح.') },
    ],
    caveats: [
      L('It will not write salary, benefits, named certifications or anything about nationality, age or gender. Empty sections are correct, not a fault.', 'ما بيكتب راتب ولا مزايا ولا شهادات مسمّاة ولا أي إشي عن الجنسية أو العمر أو الجنس. الأقسام الفاضية صح مش خطأ.'),
      L('It writes from what you typed. Thin input produces a thin description.', 'بيكتب من الي كتبته. مدخل قليل بيعطي وصف قليل.'),
    ],
  },
  {
    id: 'reviewApplications',
    roles: ['hr', 'admin'],
    title: L('Review job applications', 'مراجعة طلبات التوظيف'),
    triggers: ['application', 'candidate', 'cv', 'applicant', 'طلبات', 'مرشّح', 'متقدّم', 'سيرة ذاتية'],
    steps: [
      { path: '/hr/recruitment', text: L('Applications appear under the vacancies, newest first.', 'الطلبات بتظهر تحت الوظائف، الأحدث أولاً.') },
      { path: '/hr/recruitment', text: L('Each one shows a CV match percentage. Open "Show the working" to see which requirement was met and the line of the CV that met it.', 'كل طلب بيعرض نسبة تطابق. افتح «اعرض التفاصيل» لتشوف أي متطلّب تحقّق وأي سطر بالسيرة يثبته.') },
      { path: '/hr/recruitment', text: L('Change the status from the dropdown: new, under review, shortlisted, interview, offer, hired or rejected.', 'غيّر الحالة من القائمة: جديد، قيد المراجعة، قائمة مختصرة، مقابلة، عرض، تم التوظيف، مرفوض.') },
    ],
    caveats: [
      L('The match percentage measures how much of the written requirements the CV evidences. It is not a rating of the person, and it decides nothing.', 'نسبة التطابق بتقيس قدّ إيش السيرة بتوثّق المتطلبات المكتوبة. مش تقييم للشخص، وما بتقرّر إشي.'),
      L('Nobody is rejected automatically. A person decides.', 'ولا حدا بينرفض تلقائياً. إنسان بيقرّر.'),
    ],
  },
  {
    id: 'lookUpEmployee',
    roles: ['hr', 'admin'],
    title: L('Look up an employee', 'الاستعلام عن موظّف'),
    triggers: ['look up', 'employee number', 'find employee', 'استعلام', 'رقم وظيفي', 'ملف موظف'],
    steps: [
      { path: '/hr/employees', text: L('Type the employee number in the lookup box at the top, for example EMP-1010.', 'اكتب الرقم الوظيفي بصندوق الاستعلام فوق، مثلاً EMP-1010.') },
      { path: '/hr/employees', text: L('You get their attendance this month, leave balance, requests, documents and contracted salary in one view.', 'بتاخد حضوره هالشهر، رصيد إجازاته، طلباته، مستنداته، وراتبه المتعاقد عليه بمكان واحد.') },
    ],
    caveats: [
      L('You can also just ask the assistant: "tell me everything about EMP-1010".', 'وبتقدر بس تسأل المساعد: «اعطيني كل المعلومات عن EMP-1010».'),
      L('Capitals do not matter. emp-1010 works.', 'الأحرف الكبيرة ما بتفرق. emp-1010 بتزبط.'),
    ],
  },
  {
    id: 'decideLeave',
    roles: ['manager'],
    title: L('Approve or reject leave', 'الموافقة على إجازة أو رفضها'),
    triggers: ['leave', 'approve', 'reject', 'request', 'إجازة', 'موافقة', 'رفض', 'طلب'],
    steps: [
      { path: '/manager/approvals', text: L('Open Approvals. Requests from your team waiting on you are listed here.', 'افتح الموافقات. طلبات فريقك المستنّية قرارك مدرجة هون.') },
      { path: '/manager/approvals', text: L('Each row shows whether that person is in the system right now, which is often the thing you want to know.', 'كل صف بيبيّن إذا الشخص موجود بالنظام هلق، وهاد غالباً الي بدك تعرفه.') },
      { path: '/manager/approvals', text: L('Approve or reject. A rejection takes a reason, which the employee sees.', 'وافق أو ارفض. الرفض بياخد سبب، والموظّف بيشوفه.') },
    ],
    caveats: [
      L('Only you decide for your own team. HR and administrators can see the request but not decide it.', 'إنت بس بتقرّر لفريقك. الموارد البشرية والأدمن بيشوفوا الطلب بس ما بيقرّروه.'),
    ],
  },
  {
    id: 'checkIn',
    roles: ['employee', 'manager', 'hr', 'admin'],
    title: L('Record your attendance', 'تسجيل حضورك'),
    triggers: ['check in', 'check out', 'attendance', 'حضور', 'مغادرة', 'دوام'],
    steps: [
      { path: null, text: L('The attendance card is on your own home page — every role has one.', 'كرت الحضور على صفحتك الرئيسية — كل دور عنده واحد.') },
      { path: null, text: L('Press Check in at the start of your day, and Check out at the end.', 'اضغط تسجيل حضور أول الدوام، وتسجيل مغادرة بآخره.') },
    ],
    caveats: [
      L('The server stamps the time, not your device. Changing your computer clock does nothing.', 'السيرفر بيختم الوقت، مش جهازك. تغيير ساعة الكمبيوتر ما بيعمل إشي.'),
      L('You can only check in once a day.', 'بتقدر تسجّل حضور مرّة وحدة باليوم.'),
    ],
  },
  {
    id: 'requestLeave',
    roles: ['employee'],
    title: L('Request leave', 'طلب إجازة'),
    triggers: ['request leave', 'holiday', 'time off', 'طلب إجازة', 'إجازة'],
    steps: [
      { path: '/home', text: L('Open the Leave section on your page and press Request leave.', 'افتح قسم الإجازات بصفحتك واضغط طلب إجازة.') },
      { path: '/home', text: L('Choose the type and the dates. Your remaining balance is shown above.', 'اختر النوع والتواريخ. رصيدك المتبقّي معروض فوق.') },
      { path: '/home', text: L('Your manager decides. You will get a notification either way.', 'مديرك بيقرّر. بيوصلك إشعار بالحالتين.') },
    ],
    caveats: [L('A request for more days than you have left is refused.', 'طلب أيام أكتر من رصيدك بينرفض.')],
  },
  {
    id: 'postAnnouncement',
    roles: ['hr', 'manager', 'admin'],
    title: L('Post an announcement', 'نشر إعلان'),
    triggers: ['announcement', 'notice', 'announce', 'إعلان', 'تعميم'],
    steps: [
      { path: null, text: L('Open Announcements from your sidebar.', 'افتح الإعلانات من قائمتك الجانبية.') },
      { path: null, text: L('Choose what it is — a notice, a holiday or a meeting — and write it in Arabic, English, or just one of them.', 'اختر شو هو — إعلان أو عطلة أو اجتماع — واكتبه بالعربي أو الإنجليزي أو بواحد منهم.') },
      { path: null, text: L('Set how long it stays up, then publish. Everyone sees it, with your name on it.', 'حدّد كم بيضل منشور، وبعدين انشر. الكل بيشوفه، باسمك عليه.') },
    ],
    caveats: [L('You can edit or withdraw it afterwards.', 'بتقدر تعدّله أو تسحبه بعدين.')],
  },
  {
    id: 'askAssistant',
    roles: ['employee', 'manager', 'hr', 'admin'],
    title: L('Ask the assistant', 'اسأل المساعد'),
    triggers: ['assistant', 'copilot', 'agent', 'robot', 'chat', 'ask', 'what can you do', 'مساعد', 'ايجنت', 'الايجنت', 'كوبايلوت', 'روبوت', 'اسأل', 'شو بتقدر تعمل', 'شو بتعمل'],
    steps: [
      { path: null, text: L('The robot floats on the page and sits beside the bell at the top. Either opens it.', 'الروبوت طافي بالصفحة وموجود جنب الجرس فوق. الاتنين بيفتحوه.') },
      { path: null, text: L('Ask about your own data, your team, the company, or how to do something.', 'اسأل عن بياناتك، فريقك، الشركة، أو كيف تعمل إشي.') },
      { path: null, text: L('You can also ask it to open a permitted page, show authorised information, or start a permitted workflow. It confirms sensitive changes before it sends them.', 'بتقدر كمان تطلب منه يفتح صفحة مسموحة، يعرض معلومات مصرّح إلك تشوفها، أو يبدأ مهمة مسموحة. أي تغيير حساس بيعرضه عليك للتأكيد قبل الإرسال.') },
      { path: null, text: L('Ask for a report — attendance, leave, recruitment — and print it.', 'اطلب تقرير — حضور، إجازات، توظيف — واطبعه.') },
    ],
    caveats: [
      L('It only answers about this system, and only within what your role can see.', 'بيجاوب عن هاد النظام بس، وبحدود الي بيشوفه دورك.'),
      L('A report takes about twelve seconds. It shows you what it is doing.', 'التقرير بياخد حوالي ١٢ ثانية. بيبيّنلك شو عم يعمل.'),
    ],
  },
]

/**
 * Match Arabic spelling variations as one word.  People write `إجازة`,
 * `اجازة` and sometimes `اجازه`; a guide must not disappear because of
 * an optional hamza or taa marbuta.
 */
function guideKey(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u064b-\u065f\u0670]/g, '')
    .normalize('NFC')
    .replace(/[\u0622\u0623\u0625]/g, '\u0627')
    .replace(/\u0649/g, '\u064a')
    .replace(/\u0629/g, '\u0647')
    .replace(/[?!.,،؟]/g, ' ')
    .replace(/\s+/g, ' ')
}

/** Tasks this person may do, ranked by how well the question matches them. */
export function findTasks(question: string, role: string, limit = 3): GuideTask[] {
  const q = guideKey(question)
  return GUIDE_TASKS.filter((t) => t.roles.includes(role as GuideTask['roles'][number]))
    .map((t) => ({
      task: t,
      score: t.triggers.filter((w) => q.includes(guideKey(w))).length,
    }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.task)
}
