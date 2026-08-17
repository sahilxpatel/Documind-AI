import { ServiceBusClient } from '@azure/service-bus';
import { logger } from '../utils/logger';

const queueName = 'document-processing';

export const publishDocumentEvent = async (documentId: string, blobUrl: string) => {
  const connectionString = process.env.AZURE_SERVICE_BUS_CONNECTION_STRING;

  if (!connectionString) {
    logger.warn('AZURE_SERVICE_BUS_CONNECTION_STRING not provided. Skipping service bus event.');
    return;
  }

  const sbClient = new ServiceBusClient(connectionString);
  const sender = sbClient.createSender(queueName);

  try {
    const message = {
      body: { documentId, blobUrl },
      contentType: 'application/json',
      subject: 'ProcessDocument',
    };

    await sender.sendMessages(message);
    logger.info(`Message published for document: ${documentId}`);
  } catch (error) {
    logger.error('Error publishing to Service Bus:', error);
    throw new Error('Failed to queue document processing');
  } finally {
    await sender.close();
    await sbClient.close();
  }
};
