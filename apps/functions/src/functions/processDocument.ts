import { app, InvocationContext } from "@azure/functions";
import { BlobServiceClient } from '@azure/storage-blob';
import { OpenAIClient, AzureKeyCredential } from "@azure/openai";
import { SearchClient, AzureKeyCredential as SearchCredential } from "@azure/search-documents";
import { EmailClient } from "@azure/communication-email";
import { PDFParse } from "pdf-parse";
import { PrismaClient } from "../../../backend/node_modules/@prisma/client";

const prisma = new PrismaClient();

// Initializing clients
const blobServiceClient = BlobServiceClient.fromConnectionString(process.env.AZURE_STORAGE_CONNECTION_STRING || '');
const openai = new OpenAIClient(process.env.AZURE_OPENAI_ENDPOINT || '', new AzureKeyCredential(process.env.AZURE_OPENAI_KEY || ''));
const searchClient = new SearchClient(process.env.AZURE_SEARCH_ENDPOINT || '', process.env.AZURE_SEARCH_INDEX || '', new SearchCredential(process.env.AZURE_SEARCH_KEY || ''));
const emailClient = new EmailClient(process.env.AZURE_COMMUNICATION_CONNECTION_STRING || '');

export async function processDocument(message: any, context: InvocationContext): Promise<void> {
  context.log('Service bus queue function processing message:', message);

  try {
    const { documentId, blobUrl } = message;

    // Update status to processing
    await prisma.document.update({
      where: { id: documentId },
      data: { status: 'PROCESSING' }
    });

    const documentRecord = await prisma.document.findUnique({ where: { id: documentId }, include: { user: true } });
    const user = documentRecord?.user;

    // 1. Download PDF
    const fileName = blobUrl.split('/').pop() || '';
    const containerClient = blobServiceClient.getContainerClient('documents');
    const blockBlobClient = containerClient.getBlockBlobClient(fileName);
    try {
      console.log(`Downloading blob: ${fileName}`);
      const downloadBlockBlobResponse = await blockBlobClient.download(0);
      const downloadedContent = await streamToBuffer(downloadBlockBlobResponse.readableStreamBody!);

      console.log(`Extracting text from PDF (size: ${downloadedContent.length})`);
      const parser = new PDFParse({ data: downloadedContent });
      const pdfData = await parser.getText();
      const text = pdfData.text;
      await parser.destroy();
      console.log(`Extracted text length: ${text.length}. Snippet: ${text.substring(0, 100)}...`);

      console.log(`Generating summary with deployment: ${process.env.AZURE_OPENAI_DEPLOYMENT_ID}`);
      const summaryResponse = await openai.getChatCompletions(process.env.AZURE_OPENAI_DEPLOYMENT_ID || '', [
          { role: "system", content: "You are an AI assistant that summarizes documents." },
          { role: "user", content: `Please summarize the following document text:\n\n${text}` }
      ]);
      const summary = summaryResponse.choices[0].message?.content || '';
      console.log(`Summary generated: ${summary}`);

      console.log(`Generating embeddings and indexing chunks...`);
      const chunks = splitTextIntoChunks(text, 1000);
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const embeddingResponse = await openai.getEmbeddings(process.env.AZURE_OPENAI_EMBEDDING_DEPLOYMENT_ID || '', [chunk]);
        const vector = embeddingResponse.data[0].embedding;

        // 5. Index into Azure AI Search
        await searchClient.uploadDocuments([
          {
            id: `${documentId}-${i}`,
            documentId,
            content: chunk,
            contentVector: vector
          }
        ]);
        
        // Save chunk text to DB for chat history context
        await prisma.documentChunk.create({
          data: {
            documentId,
            content: chunk,
            chunkIndex: i
          }
        });
      }
      console.log(`Indexed ${chunks.length} chunks successfully`);

      console.log(`Updating Prisma record to COMPLETED`);
      await prisma.document.update({
          where: { id: documentId },
          data: { status: 'COMPLETED', summary }
      });

      try {
        console.log(`Sending email notification to ${documentRecord?.user?.email}`);
        const emailMessage = {
            senderAddress: process.env.AZURE_COMMUNICATION_SENDER_EMAIL || '',
            content: {
                subject: "Your Document has been processed",
                plainText: `Your document "${documentRecord?.title}" has been successfully processed.\n\nSummary:\n${summary}`,
            },
            recipients: {
                to: [{ address: documentRecord?.user?.email || '' }],
            },
        };
        
        const poller = await emailClient.beginSend(emailMessage);
        await poller.pollUntilDone();
        console.log(`Processing complete for ${documentId}`);
      } catch (emailError: any) {
        console.error(`Failed to send email notification for ${documentId}:`, emailError.message || emailError);
      }
    } catch (e: any) {
      console.log(`Caught error at stage:`, e);
      throw e;
    }

    context.log('Document processed successfully.');
  } catch (error) {
    context.log('Error processing document:', error);
    // Mark as failed in DB
    if (message?.documentId) {
       await prisma.document.update({
         where: { id: message.documentId },
         data: { status: 'FAILED' }
       });
    }
  }
}

// Utility to read stream
async function streamToBuffer(readableStream: NodeJS.ReadableStream): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    readableStream.on('data', (data) => {
      chunks.push(data instanceof Buffer ? data : Buffer.from(data));
    });
    readableStream.on('end', () => {
      resolve(Buffer.concat(chunks));
    });
    readableStream.on('error', reject);
  });
}

function splitTextIntoChunks(text: string, maxChunkLength: number = 4000): string[] {
  const chunks = [];
  const overlap = 200;
  let i = 0;
  
  while (i < text.length) {
    let end = Math.min(i + maxChunkLength, text.length);
    
    // Try to find a natural break point (e.g., a space or newline) near the end
    if (end < text.length) {
      const lastSpace = text.lastIndexOf(' ', end);
      // Only break at space if it's not too far back
      if (lastSpace > i + maxChunkLength * 0.8) {
        end = lastSpace;
      }
    }
    
    chunks.push(text.slice(i, end).trim());
    
    if (end === text.length) break;
    
    // Move forward, but keep some overlap
    i = end - overlap;
    // Safety check to prevent infinite loops
    if (i <= 0) break;
  }
  
  return chunks;
}

app.serviceBusQueue('processDocument', {
  connection: 'AZURE_SERVICE_BUS_CONNECTION_STRING',
  queueName: 'document-processing',
  handler: processDocument
});
