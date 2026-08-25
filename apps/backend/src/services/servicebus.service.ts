import { RetryMode, ServiceBusClient, ServiceBusSender } from '@azure/service-bus';
import { config } from '../config/env';
import { logger } from '../utils/logger';
import { AppError } from '../middleware/error.middleware';

/**
 * A single long-lived client and sender for the process.
 *
 * The previous implementation created and closed a ServiceBusClient for every
 * message, which means a fresh AMQP connection, TLS handshake and CBS token
 * negotiation per upload - hundreds of milliseconds of avoidable latency, and a
 * connection-churn pattern Service Bus throttles under load.
 */
let client: ServiceBusClient | null = null;
let sender: ServiceBusSender | null = null;

function getSender(): ServiceBusSender {
  if (!config.AZURE_SERVICE_BUS_CONNECTION_STRING) {
    // Previously this logged a warning and returned, so the API answered 202
    // while the document was never queued and sat in UPLOADED forever.
    throw new AppError(503, 'Document processing queue is not configured');
  }

  if (!sender) {
    client = new ServiceBusClient(config.AZURE_SERVICE_BUS_CONNECTION_STRING, {
      retryOptions: {
        maxRetries: 3,
        mode: RetryMode.Exponential,
        retryDelayInMs: 500,
      },
    });
    sender = client.createSender(config.AZURE_SERVICE_BUS_QUEUE);
  }

  return sender;
}

export interface DocumentEvent {
  documentId: string;
  userId: string;
  blobName: string;
  blobUrl: string;
}

export const publishDocumentEvent = async (event: DocumentEvent): Promise<void> => {
  try {
    await getSender().sendMessages({
      body: event,
      contentType: 'application/json',
      subject: 'ProcessDocument',
      // Lets Service Bus drop duplicates if a retry re-sends the same event.
      messageId: event.documentId,
    });

    logger.info('Queued document for processing', {
      documentId: event.documentId,
      queue: config.AZURE_SERVICE_BUS_QUEUE,
    });
  } catch (error) {
    if (error instanceof AppError) throw error;

    logger.error('Failed to publish document event', {
      documentId: event.documentId,
      error: (error as Error).message,
    });
    throw new AppError(502, 'Failed to queue document for processing');
  }
};

/** Called from the graceful-shutdown path so AMQP links close cleanly. */
export const closeServiceBus = async (): Promise<void> => {
  try {
    await sender?.close();
    await client?.close();
  } finally {
    sender = null;
    client = null;
  }
};
