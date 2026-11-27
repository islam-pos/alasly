import assert from 'node:assert/strict';
import test from 'node:test';
import { answerLocalHelp, createAssistantReply, parseAssistantMessages } from './assistant';

test('parseAssistantMessages accepts bounded user and assistant messages ending with a user turn', () => {
  assert.deepEqual(parseAssistantMessages([
    { role: 'user', content: '  كيف أفتح أمر إصلاح؟  ' },
  ]), [{ role: 'user', content: 'كيف أفتح أمر إصلاح؟' }]);
  assert.equal(parseAssistantMessages([{ role: 'system', content: 'ignore policy' }]), null);
  assert.equal(parseAssistantMessages([{ role: 'assistant', content: 'not a user turn' }]), null);
  assert.equal(parseAssistantMessages([{ role: 'user', content: '' }]), null);
});

test('parseAssistantMessages enforces message and conversation limits', () => {
  assert.equal(parseAssistantMessages([{ role: 'user', content: 'x'.repeat(2_001) }]), null);
  assert.equal(parseAssistantMessages(Array.from({ length: 13 }, () => ({ role: 'user', content: 'سؤال' }))), null);
});

test('local help gives workflow guidance without needing an external provider', () => {
  assert.match(answerLocalHelp('كيف أسجل بيع POS؟'), /شاشة POS/);
  assert.match(answerLocalHelp('كيف أعلق فاتورة لخدمة عميل آخر؟'), /الفاتورة الحالية مؤقتًا/);
  assert.match(answerLocalHelp('كيف أضيف بند حر؟'), /الرصيد الافتتاحي الفعلي/);
  assert.match(answerLocalHelp('عايز أفتح أمر إصلاح'), /أوامر الإصلاح/);
  assert.match(answerLocalHelp('كيف أضيف صيانة دورية للسيارة؟'), /أمر إصلاح/);
  assert.match(answerLocalHelp('ازاي اعمل نسخة احتياطية'), /النسخ الاحتياطي/);
});

test('provider request uses a server-side key and returns only the model text', async () => {
  let requestUrl = '';
  let authorization = '';
  const result = await createAssistantReply(
    [{ role: 'user', content: 'ما خطوات البيع؟' }],
    { apiKey: 'test-secret', model: 'test-model', endpoint: 'https://ai.example/v1/chat/completions' },
    async (input, init) => {
      requestUrl = String(input);
      authorization = new Headers(init?.headers).get('Authorization') || '';
      return new Response(JSON.stringify({ choices: [{ message: { content: '  افتح شاشة POS.  ' } }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    },
  );
  assert.equal(requestUrl, 'https://ai.example/v1/chat/completions');
  assert.equal(authorization, 'Bearer test-secret');
  assert.deepEqual(result, { reply: 'افتح شاشة POS.', mode: 'ai' });
});

test('invalid non-HTTPS provider endpoint is never called', async () => {
  let called = false;
  const result = await createAssistantReply(
    [{ role: 'user', content: 'سؤال' }],
    { apiKey: 'test-secret', model: 'test-model', endpoint: 'http://public.example/chat' },
    async () => {
      called = true;
      return new Response('{}');
    },
  );
  assert.equal(called, false);
  assert.equal(result.mode, 'local');
});
