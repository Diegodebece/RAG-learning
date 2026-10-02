export function chunkText(text: string, maxChars: number = 500): string[] {
  if (!Number.isInteger(maxChars) || maxChars <= 0) {
    throw new RangeError("El tamaño máximo debe ser un número entero positivo.");
  }

  const trimmedText = text.trim();

  if (trimmedText === "") {
    return [];
  }

  // Espacios, tabulaciones y saltos de línea separan las palabras.
  const words = trimmedText.split(/\s+/);
  const chunks: string[] = [];
  let currentChunk = "";

  for (const word of words) {
    if (word.length > maxChars) {
      throw new RangeError(
        `Una palabra supera el límite de ${maxChars} caracteres. Aumentá el tamaño máximo.`,
      );
    }

    const candidate = currentChunk === "" ? word : `${currentChunk} ${word}`;

    if (candidate.length > maxChars) {
      chunks.push(currentChunk);
      currentChunk = word;
    } else {
      currentChunk = candidate;
    }
  }

  chunks.push(currentChunk);
  return chunks;
}
