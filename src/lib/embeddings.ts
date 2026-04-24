const EMBEDDING_DIMENSION = Number(process.env.EMBEDDING_DIMENSION || "384");

function normalizeL2(values: Float32Array): number[] {
  const norm = Math.sqrt(values.reduce((sum, v) => sum + v * v, 0)) || 1;
  return Array.from(values, (v) => v / norm);
}

function hashToken(token: string): number {
  let hash = 2166136261;
  for (let i = 0; i < token.length; i++) {
    hash ^= token.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export async function embedText(text: string): Promise<number[]> {
  const vector = new Float32Array(EMBEDDING_DIMENSION);
  const normalized = text.toLowerCase().replace(/\s+/g, " ").trim();

  if (!normalized) {
    return Array.from(vector);
  }

  const tokens = normalized.split(" ");
  for (const token of tokens) {
    const idx = hashToken(token) % EMBEDDING_DIMENSION;
    vector[idx] += 1;
  }

  return normalizeL2(vector);
}

export async function embedBatch(texts: string[]): Promise<number[][]> {
  return Promise.all(texts.map((text) => embedText(text)));
}