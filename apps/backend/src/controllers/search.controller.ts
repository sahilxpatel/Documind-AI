import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { prisma } from '../utils/prisma';
import { AzureOpenAI } from "openai";
import { SearchClient, AzureKeyCredential as SearchCredential } from "@azure/search-documents";

// Lazy-init: env vars aren't available at import time (dotenv runs later in index.ts)
let _openai: AzureOpenAI;
let _searchClient: SearchClient<any>;
const getOpenAI = () => _openai ??= new AzureOpenAI({ 
  endpoint: process.env.AZURE_OPENAI_ENDPOINT || '', 
  apiKey: process.env.AZURE_OPENAI_KEY || 'placeholder',
  apiVersion: '2024-02-15-preview'
});
const getSearchClient = () => _searchClient ??= new SearchClient(process.env.AZURE_SEARCH_ENDPOINT || '', process.env.AZURE_SEARCH_INDEX || 'documents', new SearchCredential(process.env.AZURE_SEARCH_KEY || 'placeholder'));

export const searchDocuments = async (req: AuthRequest, res: Response) => {
  const query = req.query.q as string;
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

  if (!query) {
    return res.status(400).json({ error: 'Query parameter "q" is required' });
  }

  try {
    // 1. Generate embedding for query
    const embeddingResponse = await getOpenAI().embeddings.create({
      model: process.env.AZURE_OPENAI_EMBEDDING_DEPLOYMENT_ID || '',
      input: query,
    });
    const vector = embeddingResponse.data[0].embedding;

    // 2. Perform Hybrid Search
    const searchResults = await getSearchClient().search(query, {
      vectorSearchOptions: {
        queries: [
          {
            kind: "vector",
            vector: vector,
            fields: ["contentVector"],
            kNearestNeighborsCount: 10,
          }
        ]
      },
    });

    const results = [];
    for await (const result of searchResults.results) {
      results.push(result.document);
    }

    // Filter results to only include user's documents (in a real app, you'd add userId to the search index filter)
    const userDocs = await prisma.document.findMany({ where: { userId: req.user.id } });
    const userDocIds = new Set(userDocs.map(d => d.id));

    const filteredResults = results.filter((doc: any) => userDocIds.has(doc.documentId));

    res.json({ results: filteredResults });
  } catch (error) {
    console.error('Search failed:', error);
    res.status(500).json({ error: 'Search failed' });
  }
};
