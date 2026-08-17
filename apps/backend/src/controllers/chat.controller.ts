import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { prisma } from '../utils/prisma';
import { AzureOpenAI } from "openai";
import { SearchClient, AzureKeyCredential as SearchCredential } from "@azure/search-documents";
import { logger } from '../utils/logger';

// Lazy-init: env vars aren't available at import time (dotenv runs later in index.ts)
let _openai: AzureOpenAI;
let _searchClient: SearchClient<any>;
const getOpenAI = () => _openai ??= new AzureOpenAI({ 
  endpoint: process.env.AZURE_OPENAI_ENDPOINT || '', 
  apiKey: process.env.AZURE_OPENAI_KEY || 'placeholder',
  apiVersion: '2024-02-15-preview'
});
const getSearchClient = () => _searchClient ??= new SearchClient(process.env.AZURE_SEARCH_ENDPOINT || '', process.env.AZURE_SEARCH_INDEX || 'documents', new SearchCredential(process.env.AZURE_SEARCH_KEY || 'placeholder'));

export const chatWithDocument = async (req: AuthRequest, res: Response) => {
  const documentId = req.params.documentId as string;
  const { message } = req.body;

  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

  try {
    // Verify document belongs to user
    const document = await prisma.document.findFirst({
      where: { id: documentId, userId: req.user.id }
    });

    if (!document) return res.status(404).json({ error: 'Document not found' });

    // 1. Get embedding for the user's message
    const embeddingResponse = await getOpenAI().embeddings.create({
      model: process.env.AZURE_OPENAI_EMBEDDING_DEPLOYMENT_ID || '',
      input: message
    });
    const vector = embeddingResponse.data[0].embedding;

    // 2. Search for relevant chunks in Azure AI Search
    const searchResults = await getSearchClient().search(message, {
      vectorSearchOptions: {
        queries: [
          {
            kind: "vector",
            vector: vector,
            fields: ["contentVector"],
            kNearestNeighborsCount: 3,
          }
        ]
      },
      filter: `documentId eq '${documentId}'`
    });

    let contextText = '';
    for await (const result of searchResults.results) {
      contextText += `${result.document.content}\n\n`;
    }

    // 3. Generate response using OpenAI
    const systemPrompt = `You are a helpful AI assistant. Answer the user's question using only the provided context from the document.
Context:
${contextText}`;

    const chatResponse = await getOpenAI().chat.completions.create({
      model: process.env.AZURE_OPENAI_DEPLOYMENT_ID || '',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: message }
      ]
    });

    const aiMessage = chatResponse.choices[0].message?.content || 'Sorry, I could not generate a response.';

    // 4. Save conversation history
    let conversation = await prisma.conversation.findFirst({
      where: { documentId, userId: req.user.id }
    });

    if (!conversation) {
      conversation = await prisma.conversation.create({
        data: { documentId, userId: req.user.id }
      });
    }

    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        role: 'USER',
        content: message
      }
    });

    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        role: 'AI',
        content: aiMessage
      }
    });

    res.json({ answer: aiMessage });
  } catch (error) {
    logger.error('Chat error:', error);
    res.status(500).json({ error: 'Failed to process chat message' });
  }
};

export const getConversationHistory = async (req: AuthRequest, res: Response) => {
  const documentId = req.params.documentId as string;
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

  const conversation = await prisma.conversation.findFirst({
    where: { documentId, userId: req.user.id },
    include: {
      messages: { orderBy: { createdAt: 'asc' } }
    }
  });

  res.json({ messages: conversation?.messages || [] });
};
