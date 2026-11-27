import React, { FormEvent, KeyboardEvent, useEffect, useRef, useState } from 'react';
import { Bot, ChevronDown, Send, Sparkles, X } from 'lucide-react';
import { api } from '../../services/api';

type ChatMessage = { role: 'user' | 'assistant'; content: string };

const quickPrompts = [
  'كيف أفتح أمر إصلاح؟',
  'كيف أسجل بيعًا مقسّم الدفع؟',
  'أين أجد التقارير؟',
];

export const AiAssistantWidget: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [mode, setMode] = useState<'local' | 'ai'>('local');
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: 'assistant', content: 'أهلًا، أنا مساعد Alasly. اسألني عن خطوات استخدام POS أو الورشة أو المخزون أو التقارير.' },
  ]);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, open, sending]);

  const sendMessage = async (event?: FormEvent) => {
    event?.preventDefault();
    const content = draft.trim();
    if (!content || sending) return;

    const nextMessages = [...messages, { role: 'user' as const, content }].slice(-12);
    setMessages(nextMessages);
    setDraft('');
    setSending(true);
    try {
      const response = await api.assistantChat(nextMessages);
      const result = response.data || response;
      setMode(result.mode === 'ai' ? 'ai' : 'local');
      setMessages((current) => [...current, {
        role: 'assistant' as const,
        content: result.reply || 'لم أتمكن من إعداد إجابة الآن. حاول صياغة السؤال بطريقة أخرى.',
      }].slice(-13));
    } catch (requestError: any) {
      setMessages((current) => [...current, {
        role: 'assistant' as const,
        content: requestError.message || 'تعذر الوصول للمساعد. تحقق من اتصال الخادم وحاول مجددًا.',
      }].slice(-13));
    } finally {
      setSending(false);
    }
  };

  const handleComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void sendMessage();
    }
  };

  return (
    <div className="fixed bottom-4 left-4 z-40 flex flex-col items-start gap-3" dir="rtl">
      {open && (
        <section
          className="flex h-[min(34rem,calc(100dvh-6rem))] w-[min(23rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl shadow-slate-900/20"
          aria-label="مساعد Alasly الذكي"
        >
          <header className="flex items-center justify-between gap-3 bg-gradient-to-l from-slate-950 via-brand-950 to-brand-700 px-4 py-3.5 text-white">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-white/20 bg-white/10">
                <Bot className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <h2 className="truncate text-sm font-black">مساعد Alasly</h2>
                <p className="mt-0.5 text-[10px] text-blue-100">{mode === 'ai' ? 'إجابات ذكية' : 'إرشاد أساسي داخل النظام'}</p>
              </div>
            </div>
            <button type="button" onClick={() => setOpen(false)} className="rounded-lg p-2 text-blue-100 transition hover:bg-white/10 hover:text-white" aria-label="إغلاق المساعد">
              <ChevronDown className="h-5 w-5" />
            </button>
          </header>

          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto bg-slate-50 px-3 py-4">
            <div className="mx-auto max-w-[19rem] rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-center text-[10px] leading-5 text-amber-900">
              لا ترسل كلمات مرور أو بيانات دفع أو معلومات شخصية للعملاء. لا يطّلع المساعد على سجلاتك أو الأرصدة الحية.
            </div>
            {messages.map((message, index) => (
              <div key={`${index}-${message.role}`} className={`max-w-[88%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-xs leading-6 shadow-sm ${
                message.role === 'user'
                  ? 'mr-auto rounded-br-md bg-brand-700 text-white'
                  : 'ml-auto rounded-bl-md border border-slate-200 bg-white text-slate-800'
              }`}>
                {message.content}
              </div>
            ))}
            {sending && (
              <div role="status" className="ml-auto rounded-2xl rounded-bl-md border border-slate-200 bg-white px-3.5 py-2.5 text-xs text-slate-500">
                يكتب المساعد…
              </div>
            )}
            {messages.length === 1 && (
              <div className="mt-1 flex flex-wrap justify-center gap-2">
                {quickPrompts.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => setDraft(prompt)}
                    className="rounded-full border border-brand-200 bg-white px-3 py-1.5 text-[10px] font-bold text-brand-800 transition hover:border-brand-400 hover:bg-brand-50"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          <form onSubmit={(event) => void sendMessage(event)} className="border-t border-slate-200 bg-white p-3">
            <div className="flex items-end gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-2 focus-within:border-brand-400 focus-within:ring-2 focus-within:ring-brand-100">
              <textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={handleComposerKeyDown}
                rows={1}
                maxLength={2_000}
                placeholder="اكتب سؤالك…"
                aria-label="اكتب سؤالك للمساعد"
                className="max-h-24 min-h-9 flex-1 resize-y bg-transparent px-1 py-2 text-xs leading-5 text-slate-800 outline-none placeholder:text-slate-400"
              />
              <button
                type="submit"
                disabled={!draft.trim() || sending}
                aria-label="إرسال السؤال"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-700 text-white transition hover:bg-brand-800 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-1.5 text-center text-[9px] text-slate-400">Enter للإرسال · Shift+Enter لسطر جديد</p>
          </form>
        </section>
      )}

      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-label={open ? 'إغلاق مساعد Alasly' : 'فتح مساعد Alasly'}
        className="group flex h-14 items-center gap-2 rounded-full border border-white/70 bg-gradient-to-l from-slate-950 to-brand-700 px-4 text-white shadow-xl shadow-brand-900/25 transition duration-200 hover:-translate-y-0.5 hover:shadow-2xl focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-300"
      >
        {open ? <X className="h-5 w-5" /> : <Sparkles className="h-5 w-5" />}
        <span className="text-xs font-black">مساعد Alasly</span>
      </button>
    </div>
  );
};
