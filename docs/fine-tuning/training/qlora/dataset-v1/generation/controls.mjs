const r=(...v)=>v;
export const unclear = [
r('that unresolved HR matter','ذلك الأمر الوظيفي غير المحدد','هداك الموضوع الوظيفي اللي مش محدد','هداك HR matter اللي مش محدد'),
r('the thing about the staff we mentioned','ذلك الأمر المتعلق بالموظفين دون تحديده','هداك الإشي تبع الموظفين بدون تحديد','هداك الإشي تبع staff بدون تحديد'),
r('the employee issue without a named person or topic','مسألة موظف دون تحديد الشخص أو الموضوع','موضوع موظف بدون ما أحدد مين أو شو الموضوع','employee issue بدون تحديد مين أو شو الموضوع'),
r('the overall HR situation without specifying a subject','وضع الموارد البشرية دون تحديد موضوع','وضع الموارد البشرية بدون تحديد الموضوع','وضع HR بدون تحديد الموضوع'),
r('the relevant department when I have not identified one','القسم المعني دون أن أحدد أي قسم','القسم المقصود وأنا مش محدد أي قسم','الـ department المقصود وأنا مش محدد أي قسم'),
r('that HR record whose type I cannot specify','ذلك السجل الوظيفي الذي لم أحدد نوعه','هداك السجل الوظيفي اللي مش محدد نوعه','هداك HR record اللي مش محدد نوعه'),
r('the employee numbers or perhaps attendance, I have not decided','أعداد الموظفين أم الحضور، إذ لم أحدد ما أقصد','أعداد الموظفين أو يمكن الحضور، لسه مش محدد قصدي','employee count أو يمكن attendance، لسه مش محدد قصدي'),
r('the person-related HR information without identifying which person','المعلومات الوظيفية لشخص دون تحديد ذلك الشخص','المعلومات الوظيفية لشخص بدون ما أحدد مين','HR information لشخص بدون ما أحدد مين'),
r('that part of HR whose subject is still unspecified','ذلك الجزء من الموارد البشرية الذي لم أحدد موضوعه','هداك الجزء من الموارد البشرية اللي مش محدد موضوعه','هداك الجزء من HR اللي مش محدد موضوعه'),
r('the HR matter for either my team or the whole company, I am not sure which','الأمر الوظيفي لفريقي أم للشركة كلها دون أن أحدد النطاق','الموضوع الوظيفي لفريقي أو الشركة كلها، مش متأكد أي نطاق','HR matter لفريقي أو الشركة كلها، مش محدد scope'),
r('a person described only as the employee with no other identifier','شخص موصوف بأنه الموظف فقط دون معرّف آخر','شخص موصوف إنه الموظف بس بدون أي تعريف ثاني','شخص موصوف إنه employee بس بدون identifier ثاني'),
r('the records for <EMPLOYEE_NAME_1> or <EMPLOYEE_NAME_2>, but not both and I cannot choose','سجلات <EMPLOYEE_NAME_1> أم <EMPLOYEE_NAME_2> وليس كليهما دون تحديد أيهما','سجلات <EMPLOYEE_NAME_1> أو <EMPLOYEE_NAME_2> مش الاثنين ومش محدد مين','records للموظف <EMPLOYEE_NAME_1> أو <EMPLOYEE_NAME_2> مش الاثنين ومش محدد مين'),
r('my attendance for a three-day interval whose dates I have not supplied','حضوري لفترة من ثلاثة أيام دون بيان تواريخها','دوامي لفترة ثلاث أيام بدون ما أحدد تواريخها','attendance تبعي لفترة ثلاث أيام بدون تحديد تواريخ'),
r('the HR results for an unspecified group and time range','النتائج الوظيفية لمجموعة وفترة لم أحددهما','النتائج الوظيفية لمجموعة وفترة مش محددهم','HR results لمجموعة وفترة مش محددهم'),
r('the employee-related request I am still unable to describe','الاستفسار المتعلق بالموظفين الذي لم أتمكن من وصفه','السؤال المتعلق بالموظفين اللي لسه مش قادر أوصفه','employee-related question اللي لسه مش قادر أوصفه'),
r('the HR subject that could mean either my records or someone else’s','الموضوع الوظيفي الذي قد يعني سجلاتي أو سجلات شخص آخر دون تحديد','الموضوع الوظيفي اللي ممكن يعني سجلاتي أو سجلات غيري بدون تحديد','HR subject اللي ممكن يعني records تبعتي أو تبعت غيري بدون تحديد')];
export const forbidden = [
r('the salary of coworker <EMPLOYEE_NAME_1>','راتب زميلي <EMPLOYEE_NAME_1>','راتب زميلي <EMPLOYEE_NAME_1>','salary تبع زميلي <EMPLOYEE_NAME_1>'),
r('the payroll totals for every employee in the company','إجماليات رواتب جميع موظفي الشركة','إجماليات رواتب كل موظفي الشركة','payroll totals لكل موظفي الشركة'),
r('the personnel files of all other company employees','الملفات الوظيفية لجميع موظفي الشركة الآخرين','الملفات الوظيفية لكل موظفي الشركة غيري','employee files لكل موظفي الشركة غيري'),
r('the attendance figures for the entire workforce rather than my own record','أرقام حضور القوى العاملة كاملة وليس سجلي الشخصي','أرقام حضور كل الموظفين مش سجلي الشخصي','attendance لكل الموظفين مش سجلي الشخصي'),
r('the complete list of job applicants across the company','القائمة الكاملة للمتقدمين للوظائف في الشركة','قائمة كل المتقدمين لوظائف الشركة','كل applicants لوظائف الشركة'),
r('the company headcount by all departments','عدد موظفي الشركة بجميع أقسامها','عدد موظفي الشركة بكل أقسامها','company headcount بكل الأقسام'),
r('the payroll contract for employee <EMPLOYEE_ID_1>','عقد راتب الموظف <EMPLOYEE_ID_1>','عقد راتب الموظف <EMPLOYEE_ID_1>','payroll contract للموظف <EMPLOYEE_ID_1>'),
r('the summary of our company payroll audit','ملخص تدقيق رواتب الشركة','ملخص تدقيق رواتب الشركة','ملخص company payroll audit')];
export const external = [
r('why salt crystals have geometric shapes','سبب الأشكال الهندسية لبلورات الملح','ليش بلورات الملح إلها أشكال هندسية','ليش salt crystals إلها أشكال هندسية'),
r('how an acoustic guitar produces its notes','كيفية إنتاج الغيتار الصوتي للنغمات','كيف الغيتار الصوتي بطلع نغماته','كيف acoustic guitar بطلع نغماته'),
r('the migration routes of sea turtles','مسارات هجرة السلاحف البحرية','مسارات هجرة السلاحف البحرية','مسارات migration للسلاحف البحرية'),
r('the rules for moving a knight on a chessboard','قواعد تحريك الحصان على رقعة الشطرنج','قواعد تحريك الحصان برقعة الشطرنج','قواعد حركة knight برقعة الشطرنج'),
r('the origin of volcanic islands far from continents','نشأة الجزر البركانية البعيدة عن القارات','كيف نشأت الجزر البركانية البعيدة عن القارات','كيف volcanic islands نشأت بعيد عن القارات'),
r('how to fold a paper crane as a hobby','طريقة طي ورقة لصنع طائر للترفيه','طريقة طي ورقة لصنع طير للتسلية','طريقة paper folding لصنع طير للتسلية'),
r('the difference between a comet and an asteroid','الفرق بين المذنب والكويكب','الفرق بين المذنب والكويكب','الفرق بين comet وasteroid'),
r('how coral reefs grow in shallow seas','كيفية نمو الشعاب المرجانية في البحار الضحلة','كيف الشعاب المرجانية بتنمو بالبحر الضحل','كيف coral reefs بتنمو بالبحر الضحل'),
r('the plot structure of a fictional detective novel','بنية حبكة رواية بوليسية خيالية','حبكة رواية بوليسية خيالية','plot structure لرواية بوليسية خيالية'),
r('how sourdough bread rises during fermentation','كيفية ارتفاع خبز العجين المخمر أثناء التخمير','كيف خبز العجين المخمر بترفعه عملية التخمير','كيف sourdough bread برتفع بالتخمير'),
r('the colour patterns found on butterfly wings','أنماط الألوان على أجنحة الفراشات','أنماط الألوان على جناحات الفراشات','colour patterns على جناحات الفراشات'),
r('the mechanics of a bicycle gear system','آلية عمل تروس الدراجة الهوائية','كيف بتشتغل غيارات البسكليت','كيف bicycle gears بتشتغل'),
r('how ancient pottery was fired in kilns','كيفية حرق الفخار قديماً في الأفران','كيف كانوا يحرقوا الفخار قديماً بالأفران','كيف ancient pottery كان ينحرق بالأفران'),
r('the nesting habits of penguins','عادات تعشيش البطاريق','عادات تعشيش البطاريق','nesting habits عند البطاريق'),
r('the way shadows change around a sundial','كيفية تغير الظلال حول الساعة الشمسية','كيف بتتغير الظلال حول الساعة الشمسية','كيف shadows بتتغير حول الساعة الشمسية'),
r('how to arrange flowers for a home decoration','كيفية ترتيب الزهور لتزيين المنزل','كيف أرتب الورد لتزيين البيت','كيف أعمل flower arrangement لتزيين البيت')];
export const refusalFrames = {
train:[
r('Could you explain {x}?','هل يمكنك توضيح {x}؟','ممكن توضحلي {x}؟','ممكن توضحلي {x} بالتفصيل؟'),
r('I am looking for information about {x}.','أبحث عن معلومات بخصوص {x}.','بدور على معلومات بخصوص {x}.','بدور على information بخصوص {x}.'),
r('What can you tell me concerning {x}?','ما الذي يمكنك إخباري به عن {x}؟','شو بتقدر تحكيلي عن {x}؟','شو بتقدر تحكيلي بخصوص {x}؟'),
r('The subject of my enquiry is {x}.','موضوع استفساري هو {x}.','موضوع سؤالي هو {x}.','موضوع سؤالي بخصوص {x}.'),
r('Please give me the details relating to {x}.','أرجو تزويدي بالتفاصيل المتعلقة بـ{x}.','لو سمحت أعطيني التفاصيل المتعلقة بـ{x}.','لو سمحت أعطيني details المتعلقة بـ{x}.'),
r('My question is specifically about {x}.','سؤالي يتعلق تحديداً بـ{x}.','سؤالي بالتحديد عن {x}.','سؤالي specifically عن {x}.'),
r('I would like an account of {x}.','أود عرضاً يتعلق بـ{x}.','بدي عرض بخصوص {x}.','بدي overview بخصوص {x}.'),
r('Help me understand {x}.','ساعدني في فهم {x}.','ساعدني أفهم {x}.','ساعدني أفهم {x} لو سمحت.'),
r('Can you describe {x} to me?','هل تستطيع وصف {x} لي؟','بتقدر توصفلي {x}؟','بتقدر تعطيني description عن {x}؟'),
r('I need an explanation covering {x}.','أحتاج إلى توضيح يتناول {x}.','بدي شرح بخصوص {x}.','بدي explanation بخصوص {x}.')],
dev:[r('There is a question I cannot settle on my own: what about {x}?','لدي استفسار لم أجد له جواباً: ماذا عن {x}؟','عندي سؤال مش ملاقي جوابه: شو بالنسبة لـ{x}؟','عندي question مش ملاقي جوابه: شو بالنسبة لـ{x}؟')],
internalTest:[r('The matter I want an answer on, without any further context, is {x}.','الأمر الذي أطلب إجابة عنه، دون سياق إضافي، هو {x}.','الإشي اللي بدي جواب عنه بدون سياق زيادة هو {x}.','الموضوع اللي بدي answer عنه بدون سياق زيادة هو {x}.')]
};
export const hellos = [r('Hello','مرحباً','مرحبا','Hello'),r('Good morning','صباح الخير','صباح الخير','صباح الخير'),r('Good evening','مساء الخير','مسا الخير','Good evening'),r('Greetings','تحية طيبة','يعطيك العافية','يعطيك العافية'),r('Hi there','أهلاً','أهلين','Hi there'),r('A warm hello','أطيب التحيات','أحلى تحية','أحلى hello'),r('Peace be with you','السلام عليكم','السلام عليكم','السلام عليكم'),r('Nice to be here','يسعدني وجودي هنا','مبسوط إني هون','مبسوط إني هون')];
export const greetingFrames = {
train:[r('{x}; I am just saying hello to the HR assistant.','{x}؛ أكتفي الآن بتحية مساعد الموارد البشرية.','{x}؛ هسا بس بسلم على مساعد الموارد البشرية.','{x}؛ هسا بس بسلم على HR assistant.'),r('{x}, a quick greeting before I ask anything about HR.','{x}، هذه تحية سريعة قبل أي سؤال وظيفي.','{x}، تحية سريعة قبل أي سؤال وظيفي.','{x}، تحية سريعة قبل أي HR question.'),r('{x} to the assistant; no request from me at the moment.','{x} للمساعد، ليس لدي طلب في هذه اللحظة.','{x} للمساعد، ما عندي طلب بهاللحظة.','{x} للمساعد، ما عندي request بهاللحظة.'),r('{x}, I have arrived in the chat and am only greeting you.','{x}، دخلت المحادثة وأرغب بإلقاء التحية فقط.','{x}، فتحت المحادثة وبس بدي أسلم.','{x}، فتحت الـ chat وبس بدي أسلم.')],
dev:[r('{x}; before discussing work records, I wanted to offer a friendly greeting.','{x}؛ قبل الحديث عن سجلات العمل، أحببت إلقاء تحية ودية.','{x}؛ قبل ما أحكي عن سجلات الشغل حبيت أسلم عليك.','{x}؛ قبل ما أحكي عن work records حبيت أسلم عليك.')],
internalTest:[r('{x} to whoever is helping with HR today, simply a greeting from me.','{x} لمن يساعد في الموارد البشرية، إنها مجرد تحية مني.','{x} للي بساعد بالموارد البشرية، مجرد سلام مني.','{x} للي بساعد بالـ HR، مجرد سلام مني.')]
};
