import { extname } from "node:path";
import { readDocxFile } from "./read-docx-file.js";
import { readPdfFile, type PdfExtraction } from "./read-pdf-file.js";
import { readTextFile } from "./read-text-file.js";

// Solo PDF aporta estadísticas de páginas fiables para nuestra comprobación.
export type DocumentExtraction =
  | ({ format: "pdf" } & PdfExtraction)
  | { format: "txt" | "docx"; text: string };

export async function readDocument(filePath: string): Promise<DocumentExtraction> {
  const extension = extname(filePath).toLowerCase();
  switch (extension) {
    case ".txt":
      return { format: "txt", text: await readTextFile(filePath) };
    case ".pdf":
      return { format: "pdf", ...await readPdfFile(filePath) };
    case ".docx":
      return { format: "docx", text: await readDocxFile(filePath) };
    default:
      throw new Error(`Formato no admitido: ${extension || "sin extensión"}. Usá un archivo .txt, .pdf o .docx.`);
  }
}
