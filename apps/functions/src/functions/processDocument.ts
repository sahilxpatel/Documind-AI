import { app, InvocationContext } from '@azure/functions';
import { PDFParse } from 'pdf-parse';
import {
  getBlobServiceClient,
  getEmailClient,
  getOpenAI,
  getPrisma,
  getSearchClient,
  IndexedChunk,
} from '../clients';
import { settings } from '../config/env';
import { splitTextIntoChunks } from '../lib/chunk';
import { resolveBlobName } from '../lib/blob-name';

interface DocumentMessage {
  documentId: string;
  userId?: string;
  blobName?: string;
  blobUrl: string;
}

/** Azure AI Search rejects batches larger than 1000 documents. */
const SEARCH_BATCH_SIZE = 100;

function isDocumentMessage(value: unknown): value is DocumentMessage {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.documentId === 'string' && typeof candidate.blobUrl === 'string';
}

export async function processDocument(
  message: unknown,
  context: InvocationContext,
): Promise<void> {
  if (!isDocumentMessage(message)) {
    // Unparseable payload: retrying cannot help, so fail fast and let the host
    // dead-letter it after maxDeliveryCount.
    context.error('Rejecting malformed queue message', { message });
    throw new Error('Malformed queue message: expected { documentId, blobUrl }');
  }

  const { documentId } = message;
  const prisma = getPrisma();

  context.log(`Processing document ${documentId}`, {
    invocationId: context.invocationId,
  });

  try {
    const document = await prisma.document.findUnique({
      where: { id: documentId },
      include: { user: { select: { id: true, email: true, name: true } } },
    });

    if (!document) {
      // The row was deleted between enqueue and delivery. Retrying is pointless
      // and would burn the whole delivery budget, so complete the message.
      context.warn(`Document ${documentId} no longer exists, discarding message`);
      return;
    }

    await prisma.document.update({
      where: { id: documentId },
      data: { status: 'PROCESSING', errorMessage: null },
    });

    // Deliveries can repeat (host crash, lock expiry, manual replay). Clearing
    // prior output first makes reprocessing idempotent instead of colliding with
    // the unique (documentId, chunkIndex) constraint.
    await prisma.documentChunk.deleteMany({ where: { documentId } });

    const text = await extractText(message, context);

    if (text.trim().length === 0) {
      throw new Error(
        'No extractable text found. The PDF may be a scanned image, which requires OCR.',
      );
    }

    const summary = await summarise(text, context);

    const chunks = splitTextIntoChunks(text, settings.chunkSize, settings.chunkOverlap);
    context.log(`Split into ${chunks.length} chunks`);

    await indexChunks({
      chunks,
      documentId,
      userId: document.userId,
      documentTitle: document.title,
      context,
    });

    await prisma.$transaction([
      prisma.documentChunk.createMany({
        data: chunks.map((content, chunkIndex) => ({ documentId, content, chunkIndex })),
      }),
      prisma.document.update({
        where: { id: documentId },
        data: { status: 'COMPLETED', summary, errorMessage: null },
      }),
    ]);

    context.log(`Document ${documentId} completed with ${chunks.length} chunks`);

    // Best-effort and deliberately last: a notification failure must not undo
    // successful processing or trigger a redelivery.
    await notify(document.user?.email, document.title, summary, context);
  } catch (error) {
    const messageText = error instanceof Error ? error.message : String(error);

    context.error(`Processing failed for document ${documentId}`, {
      error: messageText,
      stack: error instanceof Error ? error.stack : undefined,
    });

    // Record the reason so the UI can explain the failure instead of showing a
    // bare FAILED badge.
    await prisma.document
      .update({
        where: { id: documentId },
        data: { status: 'FAILED', errorMessage: messageText.slice(0, 4000) },
      })
      .catch((updateError) =>
        context.error('Could not record failure status', {
          error: (updateError as Error).message,
        }),
      );

    // Rethrow. The old implementation swallowed the error, so Service Bus
    // completed the message: no retry, no dead-letter, and no alertable signal.
    // Rethrowing lets the host retry, then dead-letter after maxDeliveryCount.
    throw error;
  }
}

async function extractText(
  message: DocumentMessage,
  context: InvocationContext,
): Promise<string> {
  const blobName = resolveBlobName(message.blobUrl, message.blobName);
  const container = getBlobServiceClient().getContainerClient(settings.storageContainer);
  const blob = container.getBlockBlobClient(blobName);

  if (!(await blob.exists())) {
    throw new Error(`Blob "${blobName}" not found in container "${settings.storageContainer}"`);
  }

  context.log(`Downloading blob ${blobName}`);
  const buffer = await blob.downloadToBuffer();
  context.log(`Downloaded ${buffer.length} bytes, extracting text`);

  const parser = new PDFParse({ data: buffer });
  try {
    const parsed = await parser.getText();
    context.log(`Extracted ${parsed.text.length} characters`);
    return parsed.text;
  } finally {
    // Always release the parser's native resources, including on the error path.
    await parser.destroy().catch(() => undefined);
  }
}

async function summarise(text: string, context: InvocationContext): Promise<string> {
  // Truncate rather than send the whole document: an oversized prompt is
  // rejected outright, which previously failed the entire job for large PDFs.
  const input = text.slice(0, settings.maxSummaryChars);
  const truncated = text.length > input.length;

  if (truncated) {
    context.warn(
      `Document text truncated from ${text.length} to ${input.length} characters for summarisation`,
    );
  }

  const response = await getOpenAI().chat.completions.create({
    model: settings.chatDeployment,
    temperature: 0.3,
    max_tokens: 700,
    messages: [
      {
        role: 'system',
        content:
          'You summarise documents for a knowledge base. Produce a clear summary of 4-6 sentences covering the purpose, key points and any conclusions. Use only the provided text.',
      },
      {
        role: 'user',
        content: `${truncated ? '(Text truncated to the opening section.)\n\n' : ''}${input}`,
      },
    ],
  });

  return response.choices[0]?.message?.content?.trim() || 'No summary could be generated.';
}

async function indexChunks(params: {
  chunks: string[];
  documentId: string;
  userId: string;
  documentTitle: string;
  context: InvocationContext;
}): Promise<void> {
  const { chunks, documentId, userId, documentTitle, context } = params;
  const openai = getOpenAI();
  const searchClient = getSearchClient();

  for (let start = 0; start < chunks.length; start += SEARCH_BATCH_SIZE) {
    const batch = chunks.slice(start, start + SEARCH_BATCH_SIZE);

    // One embeddings call per batch instead of one per chunk. The Azure OpenAI
    // embeddings API accepts an array, so this cuts request count (and rate-limit
    // pressure) by up to 100x on large documents.
    const embeddings = await openai.embeddings.create({
      model: settings.embeddingDeployment,
      input: batch,
    });

    const documents: IndexedChunk[] = batch.map((content, offset) => {
      const chunkIndex = start + offset;
      const vector = embeddings.data[offset]?.embedding;
      if (!vector) {
        throw new Error(`Missing embedding for chunk ${chunkIndex}`);
      }

      return {
        // Search keys allow only letters, digits, _, - and =, so the UUID and
        // index are combined into a deterministic, reprocess-safe key.
        id: `${documentId}-${chunkIndex}`,
        documentId,
        // Indexed so the API can filter by tenant inside the search service
        // instead of discarding other users' hits after the fact.
        userId,
        documentTitle,
        chunkIndex,
        content,
        contentVector: vector,
      };
    });

    const result = await searchClient.mergeOrUploadDocuments(documents);
    const failures = result.results.filter((r) => !r.succeeded);

    if (failures.length > 0) {
      throw new Error(
        `Failed to index ${failures.length} of ${documents.length} chunks: ${failures[0].errorMessage}`,
      );
    }

    context.log(`Indexed chunks ${start}-${start + batch.length - 1}`);
  }
}

async function notify(
  email: string | undefined,
  title: string,
  summary: string,
  context: InvocationContext,
): Promise<void> {
  const client = getEmailClient();
  const sender = settings.senderEmail;

  if (!client || !sender || !email) {
    context.log('Skipping email notification (not configured or no recipient)');
    return;
  }

  try {
    const poller = await client.beginSend({
      senderAddress: sender,
      content: {
        subject: `"${title}" is ready`,
        plainText: `Your document "${title}" has finished processing.\n\nSummary:\n${summary}\n\n- DocuMind AI`,
      },
      recipients: { to: [{ address: email }] },
    });

    await poller.pollUntilDone();
    context.log('Notification email sent');
  } catch (error) {
    context.warn('Failed to send notification email', {
      error: (error as Error).message,
    });
  }
}

app.serviceBusQueue('processDocument', {
  connection: 'AZURE_SERVICE_BUS_CONNECTION_STRING',
  queueName: process.env.AZURE_SERVICE_BUS_QUEUE || 'document-processing',
  handler: processDocument,
});
