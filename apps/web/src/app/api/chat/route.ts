import { cookies } from 'next/headers';
import { openai } from '@ai-sdk/openai';
import { createTextStreamResponse, streamText } from 'ai';
import { prisma } from '@chefer/database';

const MOCK_ENABLED = process.env['AI_MOCK_ENABLED'] !== 'false';

// Mock responses for common questions
const MOCK_RESPONSES: [RegExp, string][] = [
  [
    /substitute|replace|instead of/i,
    "Great question! For chicken, you can substitute with tofu (press it first to remove moisture), tempeh, or chickpeas for a plant-based option. For fish, try cod, tilapia, or salmon — they're largely interchangeable. For eggs in baking, use a flax egg (1 tbsp ground flaxseed + 3 tbsp water) or a mashed banana. What ingredient are you looking to substitute?",
  ],
  [
    /breakfast|morning meal/i,
    "Here's a high-protein breakfast idea: Greek Yogurt Parfait with berries and granola (385 kcal, 22g protein), or try Overnight Oats with banana and almond butter (395 kcal, 14g protein). Both are in your current meal plan! Would you like a recipe for either?",
  ],
  [
    /meal prep|prep.*quinoa|quinoa.*prep/i,
    'To meal prep quinoa: rinse 1 cup quinoa, add 2 cups water, bring to boil, then simmer covered for 15 minutes. It keeps in the fridge for 5 days. Add it to salads, use as a rice substitute, or mix with roasted vegetables. Pro tip: toast it dry in the pan for 2 minutes before adding water for a nuttier flavour.',
  ],
  [
    /protein|high protein/i,
    "To boost protein in your meals: add Greek yogurt as a topping, snack on almonds or mixed nuts, incorporate eggs in breakfasts, or add chickpeas to salads. Your current plan targets about 150g of protein per day — you're on track!",
  ],
  [
    /calorie|calories|kcal/i,
    'Based on your profile, your daily target is set in your preferences. For accurate calorie tracking, log your meals in the Tracker section. Your meal plan is already calibrated to hit your targets — just check off what you actually ate each day.',
  ],
  [
    /.*/i,
    "That's a great question! As your AI chef, I'm here to help with recipe substitutions, meal prep tips, and nutrition advice. Could you be more specific? For example: 'What can I substitute for chicken?' or 'How do I meal prep quinoa?'",
  ],
];

async function getUserFromSession(): Promise<{ id: string } | null> {
  try {
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get('chefer_session')?.value;
    if (!sessionToken) return null;
    const session = await prisma.session.findUnique({
      where: { sessionToken },
      include: { user: { select: { id: true } } },
    });
    if (!session || session.expires < new Date()) return null;
    return session.user;
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  const user = await getUserFromSession();
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  type IncomingMessage = {
    role: string;
    parts?: { type: string; text?: string }[];
    content?: string;
  };
  const { messages } = (await req.json()) as { messages: IncomingMessage[] };
  const lastMsg = messages[messages.length - 1];
  const lastMessage =
    lastMsg?.parts
      ?.filter((p) => p.type === 'text')
      .map((p) => p.text ?? '')
      .join('') ??
    lastMsg?.content ??
    '';

  if (MOCK_ENABLED) {
    const mockResponse =
      MOCK_RESPONSES.find(([pattern]) => pattern.test(lastMessage))?.[1] ??
      MOCK_RESPONSES[MOCK_RESPONSES.length - 1]![1];

    const words = mockResponse.split(' ');
    const textStream = new ReadableStream<string>({
      async start(controller) {
        for (const word of words) {
          controller.enqueue(word + ' ');
          await new Promise((r) => setTimeout(r, 25));
        }
        controller.close();
      },
    });

    return createTextStreamResponse({ textStream });
  }

  // Live mode — real OpenAI
  const result = streamText({
    model: openai('gpt-4o-mini'),
    system:
      'You are a helpful AI chef assistant for the Chefer meal planning app. Help users with recipe substitutions, meal prep tips, nutrition advice, and cooking techniques. Be concise and friendly.',
    messages: messages.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content:
        m.parts
          ?.filter((p) => p.type === 'text')
          .map((p) => p.text ?? '')
          .join('') ??
        m.content ??
        '',
    })),
  });

  return result.toTextStreamResponse();
}
