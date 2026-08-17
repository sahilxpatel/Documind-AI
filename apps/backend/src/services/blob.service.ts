import { BlobServiceClient } from '@azure/storage-blob';
import { logger } from '../utils/logger';

const containerName = 'documents';

export const uploadToBlob = async (fileName: string, buffer: Buffer, mimeType: string): Promise<string> => {
  const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
  
  if (!connectionString) {
    logger.warn('AZURE_STORAGE_CONNECTION_STRING not provided. Skipping actual blob upload.');
    return `https://mockstorage.blob.core.windows.net/documents/${fileName}`;
  }

  try {
    const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
    const containerClient = blobServiceClient.getContainerClient(containerName);
    
    // Create container if it doesn't exist
    await containerClient.createIfNotExists();

    const blockBlobClient = containerClient.getBlockBlobClient(fileName);
    
    await blockBlobClient.uploadData(buffer, {
      blobHTTPHeaders: { blobContentType: mimeType },
    });

    return blockBlobClient.url;
  } catch (error) {
    logger.error('Error uploading to Blob Storage:', error);
    throw new Error('Failed to upload document');
  }
};
