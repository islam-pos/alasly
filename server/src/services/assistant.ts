export type AssistantChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export type AssistantReply = {
  reply: string;
  mode: 'local' | 'ai';
};

export type AssistantConfig = {
  apiKey?: string;
  model?: string;
  endpoint?: string;
};

const MAX_MESSAGES = 12;
const MAX_MESSAGE_LENGTH = 2_000;
const MAX_TOTAL_LENGTH = 10_000;

const normalizeArabic = (value: string) => value
  .normalize('NFKC')
  .toLocaleLowerCase('ar')
  .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
  .replace(/[أإآ]/g, 'ا')
  .replace(/ى/g, 'ي')
  .replace(/ة/g, 'ه');

export const parseAssistantMessages = (input: unknown): AssistantChatMessage[] | null => {
  if (!Array.isArray(input) || input.length < 1 || input.length > MAX_MESSAGES) return null;
  const messages: AssistantChatMessage[] = [];
  let totalLength = 0;

  for (const message of input) {
    if (!message || typeof message !== 'object') return null;
    const candidate = message as Record<string, unknown>;
    if ((candidate.role !== 'user' && candidate.role !== 'assistant') || typeof candidate.content !== 'string') return null;
    const content = candidate.content.trim();
    if (!content || content.length > MAX_MESSAGE_LENGTH) return null;
    totalLength += content.length;
    if (totalLength > MAX_TOTAL_LENGTH) return null;
    messages.push({ role: candidate.role, content });
  }

  if (messages[messages.length - 1]?.role !== 'user') return null;
  return messages;
};

export const answerLocalHelp = (question: string): string => {
  const text = normalizeArabic(question);
  if (/فني|مهندس استقبال|استقبال|موظف/.test(text)) {
    return 'لإنشاء أمر إصلاح، افتح «الورشة ← أوامر الإصلاح»، ثم اختر العميل والسيارة. تظهر قائمة الفني ومهندس الاستقبال من الموظفين النشطين؛ تأكد من تسجيل المسمى الوظيفي والقسم في شاشة الموظفين.';
  }
  if (/امر اصلاح|امر صيانه|ورشه|صيانه|سياره/.test(text)) {
    return 'لإنشاء أمر إصلاح: افتح «الورشة ← أوامر الإصلاح»، واضغط «فتح أمر إصلاح جديد»، ثم اختر العميل والسيارة وسجّل قراءة العداد وشكوى العميل. يمكنك إرفاق صور حالة السيارة عند الاستلام.';
  }
  if (/علق|معلق|تعليق/.test(text)) {
    return 'في شاشة POS اضغط «تعليق» لحفظ الفاتورة الحالية مؤقتًا مع العميل والأصناف والخصم. بعدها ابدأ بيعًا جديدًا، واستعد الفاتورة من «معلقة»؛ تأكد من توفر المخزون عند الاستعادة.';
  }
  if (/بند حر|صنف غير مسجل/.test(text)) {
    return 'من سلة POS اضغط «بند حر» واكتب الوصف والسعر والكمية. سيُضاف البند للفاتورة فقط، أو يمكنك تسجيله بالمخزون كصنف جديد إذا كانت لديك صلاحيات إدارة الأصناف والأسعار وأدخلت الرصيد الافتتاحي الفعلي.';
  }
  if (/فاتوره|بيع|كاشير|pos|باركود/.test(text)) {
    return 'لإتمام بيع سريع، افتح شاشة POS، وابحث عن الصنف أو امسح الباركود، ثم اختر العميل وأضف الأصناف. يمكنك تعليق الفاتورة لخدمة عميل آخر أو إضافة بند حر، ثم اضغط «متابعة الدفع» وحدد طريقة السداد.';
  }
  if (/مخزون|صنف|قطعه|جرد|مشتري/.test(text)) {
    return 'لإدارة الأصناف استخدم «تعريف الأصناف» للبحث أو الإضافة، و«المخزون» للأرصدة والتحويلات والجرد. تُعتمد فواتير الشراء من شاشة المشتريات قبل تحديث المخزون.';
  }
  if (/تقرير|تصدير|excel|pdf/.test(text)) {
    return 'افتح «التقارير» واختر نوع التقرير والفترة، ثم استخدم زر التصدير المتاح. بعض المستندات تستخدم نافذة الطباعة في المتصفح؛ اختر «حفظ كـ PDF» لإنشاء ملف PDF.';
  }
  if (/نسخه احتياطيه|استعاده|backup|restore/.test(text)) {
    return 'تجد النسخ الاحتياطي والاستعادة في «الإعدادات ← النسخ الاحتياطي والاستعادة». إدارة النسخ والاستعادة محصورة بحساب المدير، ومن الأفضل تنزيل نسخة احتياطية دورية وحفظها خارج الاستضافة.';
  }
  return 'أستطيع إرشادك إلى استخدام النظام وشرح خطوات POS والورشة والمخزون والتقارير والإعدادات. جرّب سؤالًا محددًا مثل: «كيف أفتح أمر إصلاح؟» أو «كيف أسجل بيعًا مقسّم الدفع؟». لا ترسل كلمات مرور أو بيانات شخصية للعملاء.';
};

const systemPrompt = `أنت مساعد استخدام عربي لتطبيق Alasly AutoCare ERP. أجب بالعربية المصرية الواضحة والمختصرة، وبالاعتماد على الشرح التالي فقط: النظام يتضمن نقاط بيع وفواتير ومدفوعات نقدية/بطاقات/مقسمة؛ في POS يمكن تعليق الفاتورة واستعادتها، وإضافة بند حر، أو تسجيله كصنف مخزني جديد عند توفر صلاحيات إدارة الأصناف والأسعار وإدخال الرصيد الافتتاحي الفعلي. يتضمن النظام مخزونًا ومشتريات، ملفات عملاء وسيارات، أوامر إصلاح وفحصًا وتقديرات وموافقة عميل، إدارة موظفين وحضور ورواتب، محاسبة ومالية، تقارير وتصدير، وإعدادات ونسخًا احتياطيًا. لا يمكنك الوصول إلى قاعدة بيانات الشركة أو أرصدة حية، ولا تنفذ أي إجراء أو تعديل. لا تطلب كلمة مرور أو بيانات دفع أو بيانات شخصية غير لازمة. إذا سُئلت عن معلومة لا تعرفها، قل ذلك بوضوح ووجّه المستخدم إلى القسم المناسب، ولا تخترع مزايا غير مؤكدة.`;

const getConfiguredEndpoint = (config: AssistantConfig): string | null => {
  const raw = config.endpoint || process.env.AI_API_BASE_URL || 'https://api.openai.com/v1/chat/completions';
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:') return null;
    return url.toString();
  } catch {
    return null;
  }
};

export const createAssistantReply = async (
  messages: AssistantChatMessage[],
  config: AssistantConfig = {
    apiKey: process.env.AI_API_KEY,
    model: process.env.AI_MODEL,
    endpoint: process.env.AI_API_BASE_URL,
  },
  fetcher: typeof fetch = fetch,
): Promise<AssistantReply> => {
  const latestQuestion = messages[messages.length - 1]?.content || '';
  if (!config.apiKey || !config.model) {
    return { reply: answerLocalHelp(latestQuestion), mode: 'local' };
  }

  const endpoint = getConfiguredEndpoint(config);
  if (!endpoint) {
    return { reply: 'إعداد رابط خدمة المساعد غير صالح. يجب أن يكون رابط HTTPS لمزوّد متوافق مع واجهة OpenAI.', mode: 'local' };
  }

  try {
    const response = await fetcher(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: config.model,
        messages: [{ role: 'system', content: systemPrompt }, ...messages.slice(-8)],
        temperature: 0.3,
        max_tokens: 500,
      }),
      signal: AbortSignal.timeout(25_000),
    });
    if (!response.ok) {
      return { reply: 'تعذر الاتصال بخدمة المساعد الذكي حاليًا. جرّب مرة أخرى لاحقًا أو راجع إعدادات الخدمة.', mode: 'local' };
    }
    const payload = await response.json() as { choices?: Array<{ message?: { content?: unknown } }> };
    const content = payload.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || !content.trim()) {
      return { reply: answerLocalHelp(latestQuestion), mode: 'local' };
    }
    return { reply: content.trim().slice(0, 4_000), mode: 'ai' };
  } catch {
    return { reply: 'خدمة المساعد الذكي غير متاحة الآن. يمكنك استخدام الإرشادات الأساسية أو المحاولة لاحقًا.', mode: 'local' };
  }
};

export const assistantLimits = { maxMessages: MAX_MESSAGES, maxMessageLength: MAX_MESSAGE_LENGTH };
