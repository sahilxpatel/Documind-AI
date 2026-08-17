# 🧠 DocuMind AI

A production-ready, full-stack AI SaaS application that allows users to seamlessly upload PDF documents, extract text, and perform semantic search and conversational AI interactions over their private knowledge base. 

Built with an emphasis on premium UI/UX, robust architecture, and enterprise-grade cloud services.

---

## ✨ Key Features

- **Premium Interface:** A modern, mobile-responsive "Glassmorphism" UI built with React, Tailwind CSS, and Framer Motion.
- **Intelligent Processing:** Automated background ingestion pipeline that extracts text, generates summaries, and computes vector embeddings.
- **Semantic Search:** Lightning-fast, context-aware global search across all uploaded documents.
- **Conversational Chat:** Talk directly to your documents. Ask questions and get precise, context-bounded answers.
- **Secure & Robust:** Features rate limiting, Zod payload validation, file size restrictions, and robust text-chunking to respect LLM token limits.

---

## 🛠️ Technology Stack

**Frontend**
- React, Vite, TypeScript, Tailwind CSS, Framer Motion
- Zustand (State), Axios (API Client)

**Backend**
- Node.js, Express, TypeScript
- Prisma ORM, Zod, Express Rate Limit

**Azure Cloud Infrastructure**
- **Database**: Azure SQL Database
- **Storage**: Azure Blob Storage (PDF storage)
- **Message Broker**: Azure Service Bus (Event-driven processing)
- **Background Jobs**: Azure Functions (Serverless ingestion pipeline)
- **AI Services**: Azure OpenAI (Embeddings & Chat Completions)
- **Search Engine**: Azure AI Search (Vector Database & Semantic Search)

---

## 🏗️ Architecture & Processing Pipeline

When a user uploads a PDF, the system triggers an asynchronous, event-driven pipeline:
1. **Upload**: PDF is uploaded to **Azure Blob Storage**.
2. **Event Queued**: A message is sent to **Azure Service Bus**.
3. **Serverless Processing**: An **Azure Function** picks up the message, downloads the PDF, and extracts the text.
4. **AI Generation**: The text is chunked and sent to **Azure OpenAI** to generate a summary and vector embeddings.
5. **Indexing**: The embeddings and document metadata are indexed into **Azure AI Search** for lightning-fast retrieval.

---

## 🚀 Getting Started

### Prerequisites
- Node.js (v18+)
- Active Azure Subscription (SQL, Blob, Service Bus, OpenAI, AI Search)
- Azure Functions Core Tools (for local testing)

### Installation

This project is structured as an npm workspace monorepo.

1. Clone the repository and install dependencies from the root:
   ```bash
   npm install
   ```

2. Set up your `.env` files.
   - You will need an `.env` in `apps/backend/` and `apps/functions/`.
   - Use the provided `.env.example` as a template and fill in your Azure connection strings and keys.

3. Initialize the Database:
   ```bash
   cd apps/backend
   npx prisma db push
   ```

### Running Locally

You'll need to run three separate processes to start the full application:

**1. Start the Backend API** (Terminal 1)
```bash
cd apps/backend
npm run dev
```

**2. Start the Azure Functions Processor** (Terminal 2)
```bash
cd apps/functions
npm start
```

**3. Start the Frontend UI** (Terminal 3)
```bash
cd apps/frontend
npm run dev
```

---

## 📁 Project Structure

```text
documind-ai/
├── apps/
│   ├── frontend/     # React User Interface
│   ├── backend/      # Express REST API
│   └── functions/    # Azure Functions (Background Workers)
├── packages/         # Shared utilities and types (Optional)
├── infra/            # IaC templates (Bicep/Terraform)
└── package.json      # Monorepo configuration
```

---

## 🔒 Security & Reliability Notes

- **File Limits**: Uploads are strictly limited to 10MB PDFs.
- **Rate Limiting**: AI endpoints (Chat and Search) are strictly rate-limited (20 requests/minute) to prevent abuse and manage costs.
- **Token Management**: The Azure Function worker utilizes a character-based sliding-window algorithm with overlap to ensure Azure OpenAI token limits (8192) are perfectly respected during ingestion.
