import { Router } from 'express';
import { prisma } from '../lib/prisma';
import type { AuthenticatedRequest } from '../middleware/auth';
import { createAssistantReply, parseAssistantMessages } from '../services/assistant';

const router = Router();
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 30;
const requestWindows = new Map<string, { count: number; resetAt: number }>();

router.post('/chat', async (req: AuthenticatedRequest, res) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: 'يرجى تسجيل الدخول لاستخدام المساعد.' });

  try {
    const account = await prisma.user.findUnique({ where: { id: userId }, select: { active: true } });
    if (!account?.active) return res.status(401).json({ error: 'الحساب غير موجود أو غير نشط.' });

    const messages = parseAssistantMessages(req.body?.messages);
    if (!messages) {
      return res.status(400).json({ error: 'صيغة المحادثة غير صالحة أو تجاوزت الحد المسموح.' });
    }

    const now = Date.now();
    let window = requestWindows.get(userId);
    if (!window || now >= window.resetAt) {
      window = { count: 0, resetAt: now + RATE_WINDOW_MS };
      requestWindows.set(userId, window);
    }
    if (requestWindows.size > 2_000) {
      for (const [id, value] of requestWindows) {
        if (now >= value.resetAt) requestWindows.delete(id);
      }
    }
    if (window.count >= RATE_LIMIT) {
      return res.status(429).json({ error: 'تم تجاوز عدد الأسئلة المسموح به مؤقتًا. حاول بعد دقيقة.' });
    }
    window.count += 1;

    const result = await createAssistantReply(messages);
    return res.json(result);
  } catch (error) {
    console.error('Assistant request failed:', error);
    return res.status(500).json({ error: 'تعذر إعداد إجابة المساعد.' });
  }
});

export default router;
