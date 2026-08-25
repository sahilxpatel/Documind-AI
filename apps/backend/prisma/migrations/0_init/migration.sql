BEGIN TRY

BEGIN TRAN;

-- CreateSchema
IF NOT EXISTS (SELECT * FROM sys.schemas WHERE name = N'dbo') EXEC sp_executesql N'CREATE SCHEMA [dbo];';

-- CreateTable
CREATE TABLE [dbo].[User] (
    [id] NVARCHAR(1000) NOT NULL,
    [email] NVARCHAR(1000) NOT NULL,
    [passwordHash] NVARCHAR(1000) NOT NULL,
    [name] NVARCHAR(1000),
    [role] NVARCHAR(1000) NOT NULL CONSTRAINT [User_role_df] DEFAULT 'USER',
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [User_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [User_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [User_email_key] UNIQUE NONCLUSTERED ([email])
);

-- CreateTable
CREATE TABLE [dbo].[Document] (
    [id] NVARCHAR(1000) NOT NULL,
    [userId] NVARCHAR(1000) NOT NULL,
    [title] NVARCHAR(1000) NOT NULL,
    [blobUrl] NVARCHAR(1000) NOT NULL,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [Document_status_df] DEFAULT 'UPLOADED',
    [summary] NVARCHAR(max),
    [errorMessage] NVARCHAR(max),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Document_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [Document_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[DocumentChunk] (
    [id] NVARCHAR(1000) NOT NULL,
    [documentId] NVARCHAR(1000) NOT NULL,
    [content] NVARCHAR(max) NOT NULL,
    [chunkIndex] INT NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [DocumentChunk_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [DocumentChunk_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [DocumentChunk_documentId_chunkIndex_key] UNIQUE NONCLUSTERED ([documentId],[chunkIndex])
);

-- CreateTable
CREATE TABLE [dbo].[Conversation] (
    [id] NVARCHAR(1000) NOT NULL,
    [userId] NVARCHAR(1000) NOT NULL,
    [documentId] NVARCHAR(1000) NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Conversation_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [Conversation_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[Message] (
    [id] NVARCHAR(1000) NOT NULL,
    [conversationId] NVARCHAR(1000) NOT NULL,
    [role] NVARCHAR(1000) NOT NULL,
    [content] NVARCHAR(max) NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Message_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [Message_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[Notification] (
    [id] NVARCHAR(1000) NOT NULL,
    [userId] NVARCHAR(1000) NOT NULL,
    [title] NVARCHAR(1000) NOT NULL,
    [message] NVARCHAR(1000) NOT NULL,
    [read] BIT NOT NULL CONSTRAINT [Notification_read_df] DEFAULT 0,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Notification_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [Notification_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[AuditLog] (
    [id] NVARCHAR(1000) NOT NULL,
    [userId] NVARCHAR(1000) NOT NULL,
    [action] NVARCHAR(1000) NOT NULL,
    [entity] NVARCHAR(1000) NOT NULL,
    [entityId] NVARCHAR(1000) NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [AuditLog_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [AuditLog_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Document_userId_createdAt_idx] ON [dbo].[Document]([userId], [createdAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Document_status_idx] ON [dbo].[Document]([status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Conversation_userId_documentId_idx] ON [dbo].[Conversation]([userId], [documentId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Message_conversationId_createdAt_idx] ON [dbo].[Message]([conversationId], [createdAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Notification_userId_read_idx] ON [dbo].[Notification]([userId], [read]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [AuditLog_userId_createdAt_idx] ON [dbo].[AuditLog]([userId], [createdAt]);

-- AddForeignKey
ALTER TABLE [dbo].[Document] ADD CONSTRAINT [Document_userId_fkey] FOREIGN KEY ([userId]) REFERENCES [dbo].[User]([id]) ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[DocumentChunk] ADD CONSTRAINT [DocumentChunk_documentId_fkey] FOREIGN KEY ([documentId]) REFERENCES [dbo].[Document]([id]) ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[Conversation] ADD CONSTRAINT [Conversation_userId_fkey] FOREIGN KEY ([userId]) REFERENCES [dbo].[User]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Conversation] ADD CONSTRAINT [Conversation_documentId_fkey] FOREIGN KEY ([documentId]) REFERENCES [dbo].[Document]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Message] ADD CONSTRAINT [Message_conversationId_fkey] FOREIGN KEY ([conversationId]) REFERENCES [dbo].[Conversation]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Notification] ADD CONSTRAINT [Notification_userId_fkey] FOREIGN KEY ([userId]) REFERENCES [dbo].[User]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[AuditLog] ADD CONSTRAINT [AuditLog_userId_fkey] FOREIGN KEY ([userId]) REFERENCES [dbo].[User]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH

