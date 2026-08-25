import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { AppError } from '../middleware/error.middleware';
import { prisma } from '../utils/prisma';
import { logger } from '../utils/logger';
import { createChatCompletion, createEmbedding } from '../services/openai.service';
import { searchChunks } from '../services/search.service';

const MAX_CONTEXT_CHARS = 12_000;
const HISTORY_TURNS = 6;

export const chatWithDocument = async (req: AuthRequest, res: Response) => {
  const user = req.user!;
  const { documentId } = req.params as { documentId: string };
  const { message } = req.body as { message: string };

  // Ownership check first: never spend an embedding call on a document the
  // caller cannot see.
  const document = await prisma.document.findFirst({
    where: { id: documentId, userId: user.id },
    select: { id: true, title: true, status: true },
  });

  if (!document) {
    throw new AppError(404, 'Document not found');
  }
  if (document.status !== 'COMPLETED') {
    throw new AppError(
      409,
      `This document is still ${document.status.toLowerCase()}. Chat is available once processing completes.`,
    );
  }

  const vector = await createEmbedding(message);

  const chunks = await searchChunks({
    query: message,
    vector,
    userId: user.id,
    documentId,
    top: 5,
  });

  if (chunks.length === 0) {
    logger.warn('No indexed chunks matched', { documentId, userId: user.id });
  }

  // Bound the context so a long document cannot push the request past the
  // deployment's token limit (which fails the whole call).
  let contextText = '';
  for (const chunk of chunks) {
    if (contextText.length + chunk.content.length > MAX_CONTEXT_CHARS) break;
    contextText += `${chunk.content}\n\n---\n\n`;
  }

  const conversation = await getOrCreateConversation(documentId, user.id);

  const priorMessages = await prisma.message.findMany({
    where: { conversationId: conversation.id },
    orderBy: { createdAt: 'desc' },
    take: HISTORY_TURNS,
    select: { role: true, content: true },
  });

  const systemPrompt = [
    `You are DocuMind, an assistant answering questions about the document "${document.title}".`,
    'Answer using only the context below. If the context does not contain the answer, say so plainly rather than guessing.',
    'Keep answers concise and cite the relevant wording from the context where useful.',
    '',
    'Context:',
    contextText || '(no relevant passages were found in this document)',
  ].join('\n');

  const answer = await createChatCompletion([
    { role: 'system', content: systemPrompt },
    // Reversed back into chronological order for the model.
    ...priorMessages.reverse().map((m) => ({
      role: m.role === 'AI' ? ('assistant' as const) : ('user' as const),
      content: m.content,
    })),
    { role: 'user', content: message },
  ]);

  const finalAnswer = answer || 'Sorry, I could not generate a response.';

  // One transaction so a partial write cannot leave a question without its
  // answer (or vice versa) in the history.
  await prisma.$transaction([
    prisma.message.create({
      data: { conversationId: conversation.id, role: 'USER', content: message },
    }),
    prisma.message.create({
      data: { conversationId: conversation.id, role: 'AI', content: finalAnswer },
    }),
  ]);

  res.json({
    answer: finalAnswer,
    sources: chunks.map((chunk) => ({
      chunkIndex: chunk.chunkIndex,
      excerpt: chunk.content.slice(0, 300),
    })),
  });
};

/**
 * Conversation has no unique constraint on (userId, documentId), so this is a
 * find-then-create rather than an upsert. A concurrent double-create is benign:
 * both rows are owned by the same user and document, and reads take the first.
 */
async function getOrCreateConversation(documentId: string, userId: string) {
  const existing = await prisma.conversation.findFirst({
    where: { documentId, userId },
    select: { id: true },
  });

  if (existing) return existing;

  return prisma.conversation.create({
    data: { documentId, userId },
    select: { id: true },
  });
}

export const getConversationHistory = async (req: AuthRequest, res: Response) => {
  const user = req.user!;
  const { documentId } = req.params as { documentId: string };

  const conversation = await prisma.conversation.findFirst({
    where: { documentId, userId: user.id },
    include: {
      messages: {
        orderBy: { createdAt: 'asc' },
        select: { id: true, role: true, content: true, createdAt: true },
      },
    },
  });

  res.json({ messages: conversation?.messages ?? [] });
};
