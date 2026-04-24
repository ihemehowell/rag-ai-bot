import { ChatGroq } from "@langchain/groq";

export const groqLLM = new ChatGroq({
  apiKey: process.env.GROQ_API_KEY!,
  model: process.env.GROQ_MODEL || "llama-3.1-8b-instant",
  temperature: 0.3,
  streaming: true,
});