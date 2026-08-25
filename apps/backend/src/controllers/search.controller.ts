import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { prisma } from '../utils/prisma';
import { createEmbedding } from '../services/openai.service';
import { searchChunks } from '../services/search.service';

export const searchDocuments = async (req: AuthRequest, res: Response) => {
  const user = req.user!;
  // Validated and coerced by validate(searchSchema).
  const query = req.query.q as unknown as string;
  const top = (req.query.top as unknown as number) ?? 10;

  const vector = await createEmbedding(query);

  // The user filter is applied inside Azure AI Search, so results never contain
  // another tenant's content and kNN candidates are drawn only from this user's
  // chunks. The previous implementation searched globally and discarded
  // unauthorised hits in Node afterwards, which pulled other tenants' text into
  // this process and could return nothing at all when their chunks dominated
  // the top matches.
  const hits = await searchChunks({ query, vector, userId: user.id, top });

  // Attach live titles/status from the database. Search documents can lag behind
  // deletes and renames, so the database stays authoritative for metadata.
  const documentIds = [...new Set(hits.map((hit) => hit.documentId))];
  const documents = await prisma.document.findMany({
    where: { id: { in: documentIds }, userId: user.id },
    select: { id: true, title: true, status: true },
  });
  const documentsById = new Map(documents.map((doc) => [doc.id, doc]));

  const results = hits
    // Drop hits whose row is gone (deleted but not yet de-indexed).
    .filter((hit) => documentsById.has(hit.documentId))
    .map((hit) => ({
      id: hit.id,
      documentId: hit.documentId,
      documentTitle: documentsById.get(hit.documentId)!.title,
      chunkIndex: hit.chunkIndex,
      content: hit.content,
      score: hit.score,
      // Retained so existing clients reading the raw Azure field keep working.
      '@search.score': hit.score,
    }));

  res.json({ query, results });
};
