# hr6 — نقطة متابعة محفوظة

تاريخ الحفظ: **2026-10-27**، حسب تاريخ المستخدم في Asia/Riyadh.

آخر مرحلة مكتملة: **إعداد حزمة تدريب QLoRA لـ Google Colab**. الحزمة جاهزة لفحوص بيئة Colab ثم بدء التدريب بأمر صريح. **التدريب لم يبدأ**، وفحص GPU لم يُنفّذ بعد.

## الحالة المحفوظة

- النموذج: `Qwen/Qwen3-4B-Thinking-2507`.
- مراجعة النموذج والتوكنيزر: `768f209d9ea81521153ed38c47d515654e938aea`.
- البيانات المعتمدة: `dataset-v2`؛ 6,400 تدريب، 800 تحقق dev، و800 internal test مستبعدة من حزمة التدريب.
- dataset-v2 SHA-256: `264400230331a4fbc638889ace7cce9d330f36a4916d204858daf78e541e5ee0`.
- إعدادات QLoRA: NF4 4-bit وdouble quantization، rank 16، alpha 32، dropout 0.05، completion-only loss، طول 4,096، microbatch 1، accumulation 16، gradient checkpointing، و3 epochs.
- الحد الأقصى المقاس: 3,458 توكن للتدريب و3,427 للتحقق؛ دون اقتطاع أي مثال.
- الفحوص المحلية: 10/10 اختبارات، 58 حالة تطابق مع Zod/semantic validation، والتحقق من أقنعة loss لكل 7,200 مثال تدريب/تحقق: PASS.
- بيئة مستهدفة: Colab مع NVIDIA T4 سعة 16 GB أو أكبر؛ تقدير VRAM حوالي 10–14 GiB ولم يُقَس على GPU بعد.
- حزمة Colab محفوظة هنا: `colab-training-package.zip`. الأرشيف السابق غير موجود حالياً، لذلك أُعيد تجميع الأرشيف هنا من 36 ملفاً بعد مطابقة كل ملف لقائمة البصمات الأصلية، دون تغيير الملفات الأصلية. محتويات الحزمة مطابقة؛ بصمة الأرشيف الجديد تختلف بسبب بيانات ZIP الوصفية.
- SHA-256 للأرشيف المحفوظ في hr6: `ad205b2033f7566463029095d7908478bc6453a72a91bf3bc0e7cedd1d23d4fd`.
- SHA-256 لقائمة ملفات الحزمة: `9d6d7de93828fabf2a6b5ed038b594f056773bec61503a468e1c88e60022e65c`.

## الملفات الأصلية

- تعليمات التشغيل: `docs/fine-tuning/training/qlora/training-package/README.md`.
- حزمة التدريب: `docs/fine-tuning/training/qlora/training-package/`.
- إثبات الجاهزية المحلية: `docs/fine-tuning/training/qlora/training-package/preparation-results.json`.
- قرار اعتماد البيانات: `docs/fine-tuning/training/qlora/dataset-v2/admission-decision.json`.

## نقطة الاستئناف القادمة

ارفع أرشيف Colab واتبع تعليمات README: فحص البيانات، ثم AutoTokenizer وأقنعة loss، ثم GPU/4-bit/LoRA وloss parity دون تدريب. لا يبدأ التدريب إلا بتشغيل `train.py --train` بشكل صريح. تبقى بيانات internal test محفوظة لمرحلة منفصلة بعد اكتمال التدريب، ولا تُستخدم أثناء اختيار النموذج أو الإعدادات.

لم تُعَد تجربة frozen 404، ولم تُستخدم dataset-v1 أو historical 10K في التدريب. لم تتغير ملفات التطبيق أو `.env` أو أدلة BEFORE عند إنشاء هذه النقطة. لا تحتوي هذه النقطة على مفاتيح أو بيانات HR حقيقية.

هذه نسخة محفوظة لحزمة التدريب وملخص حالة المتابعة، وليست نسخة احتياطية كاملة لكل التطبيق أو قاعدة البيانات. الأصول السابقة والأدلة المجمدة تبقى في مواقعها الأصلية.
