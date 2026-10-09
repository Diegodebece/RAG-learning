import { readFile } from "node:fs/promises";
import mammoth from "mammoth";

export async function readDocxFile(filePath: string): Promise<string> {
  const buffer = await readFile(filePath);
  // readFile returns the DOCX bytes so Mammoth can extract its text.

  const result = await mammoth.extractRawText({ buffer });
  // extractRawText receives an object containing the Buffer and returns a result with the text in value.
  return result.value.trim();
}
