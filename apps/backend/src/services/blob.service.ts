import { BlobServiceClient, ContainerClient } from '@azure/storage-blob';
import { config } from '../config/env';
import { logger } from '../utils/logger';
import { AppError } from '../middleware/error.middleware';

/**
 * The container client is created once and reused. Constructing a
 * BlobServiceClient per upload throws away the underlying HTTP agent's
 * keep-alive connections and adds a TLS handshake to every request.
 */
let containerClientPromise: Promise<ContainerClient> | null = null;

function getContainerClient(): Promise<ContainerClient> {
  if (containerClientPromise) return containerClientPromise;

  containerClientPromise = (async () => {
    if (!config.AZURE_STORAGE_CONNECTION_STRING) {
      // Previously this returned a fake mockstorage.blob.core.windows.net URL, so
      // uploads "succeeded" while the worker could never find the blob. Failing
      // here surfaces the misconfiguration immediately instead.
      throw new AppError(503, 'Document storage is not configured');
    }

    const client = BlobServiceClient.fromConnectionString(
      config.AZURE_STORAGE_CONNECTION_STRING,
    );
    const container = client.getContainerClient(config.AZURE_STORAGE_CONTAINER);

    // Bicep already creates the container; this makes local and first-run setups
    // work too. Private access only - documents are user data.
    await container.createIfNotExists();

    return container;
  })();

  // Do not cache a failed initialisation, otherwise a transient error at boot
  // permanently breaks uploads until the instance is recycled.
  containerClientPromise.catch(() => {
    containerClientPromise = null;
  });

  return containerClientPromise;
}

export const uploadToBlob = async (
  blobName: string,
  buffer: Buffer,
  mimeType: string,
): Promise<{ blobName: string; blobUrl: string }> => {
  const container = await getContainerClient();
  const blockBlobClient = container.getBlockBlobClient(blobName);

  try {
    await blockBlobClient.uploadData(buffer, {
      blobHTTPHeaders: {
        blobContentType: mimeType,
        // Documents are immutable once uploaded.
        blobCacheControl: 'private, max-age=31536000, immutable',
      },
    });
  } catch (error) {
    logger.error('Blob upload failed', {
      blobName,
      error: (error as Error).message,
    });
    throw new AppError(502, 'Failed to store document');
  }

  return { blobName, blobUrl: blockBlobClient.url };
};

export const deleteBlob = async (blobName: string): Promise<void> => {
  const container = await getContainerClient();
  await container.getBlockBlobClient(blobName).deleteIfExists();
};
