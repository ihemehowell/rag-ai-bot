# RAG Bot (Codespaces Setup)

This project is a Next.js app for uploading PDFs, embedding chunked text, storing vectors in Pinecone, and chatting over retrieved context with Groq.

## Quick Start in GitHub Codespaces

1. Open this repository in a new Codespace.
2. In the Codespaces terminal, install dependencies:

```bash
corepack enable
pnpm install
```

3. Create an environment file:

```bash
cp .env.local.example .env.local
```

If `.env.local.example` does not exist yet, create `.env.local` manually using the template below.

4. Start the app:

```bash
pnpm dev
```

5. Open the forwarded port for `3000` in Codespaces and visit the app.

## Required Environment Variables

Create `.env.local` in the project root with:

```env
PINECONE_API_KEY=your_pinecone_api_key
PINECONE_INDEX=your_pinecone_index_name
GROQ_API_KEY=your_groq_api_key
GROQ_MODEL=llama-3.1-8b-instant
EMBEDDING_DIMENSION=384
```

### Notes

- `EMBEDDING_DIMENSION` must match your Pinecone index dimension.
- Default in this app is `384`.
- `GROQ_MODEL` is optional. If omitted, the app uses `llama-3.1-8b-instant`.

## Recommended Codespaces Secrets

Instead of committing sensitive values, add these as Codespaces repository secrets:

- `PINECONE_API_KEY`
- `PINECONE_INDEX`
- `GROQ_API_KEY`
- `GROQ_MODEL` (optional)
- `EMBEDDING_DIMENSION` (optional)

Then write them into `.env.local` inside the Codespace.

## Scripts

- `pnpm dev` - start local development server
- `pnpm build` - build for production
- `pnpm start` - run production build
- `pnpm lint` - run ESLint

## How to Use

1. Launch the app in Codespaces.
2. Upload a PDF in the UI.
3. Ask questions in the chat panel.
4. The app retrieves relevant chunks from Pinecone and answers using Groq.

## Troubleshooting

- If upload fails, verify the file is a valid PDF.
- If chat responses are empty or low quality, confirm vectors were inserted into the configured Pinecone index.
- If you get dimension errors from Pinecone, align `EMBEDDING_DIMENSION` with index config.
- If model calls fail, recheck `GROQ_API_KEY` and model availability.

## Tech Stack

- Next.js (App Router)
- React
- LangChain
- Pinecone
- Groq
