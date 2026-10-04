export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || a.length !== b.length) {
    throw new Error(
      "Los vectores deben tener la misma dimensión y no estar vacíos.",
    );
  }

  let dotProduct = 0;
  let squaredMagnitudeA = 0;
  let squaredMagnitudeB = 0;

  for (let i = 0; i < a.length; i++) {
    const valueA = a[i];
    const valueB = b[i];

    if (!Number.isFinite(valueA) || !Number.isFinite(valueB)) {
      throw new Error("Los vectores deben contener números finitos.");
    }

    dotProduct += valueA * valueB;
    squaredMagnitudeA += valueA * valueA;
    squaredMagnitudeB += valueB * valueB;
  }

  if (squaredMagnitudeA === 0 || squaredMagnitudeB === 0) {
    throw new Error("No se puede comparar un vector de magnitud cero.");
  }

  const magnitudeA = Math.sqrt(squaredMagnitudeA);
  const magnitudeB = Math.sqrt(squaredMagnitudeB);

  return dotProduct / (magnitudeA * magnitudeB);
}