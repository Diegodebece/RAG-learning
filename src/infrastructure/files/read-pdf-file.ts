import { readFile } from "node:fs/promises";
import { PDFParse } from "pdf-parse";

export const MIN_PDF_PAGE_CHARACTERS = 50;

export interface PdfExtraction {
  text: string;
  totalPages: number;
  pagesWithLittleText: number;
}

export async function readPdfFile(filePath: string): Promise<PdfExtraction> {
  const data = await readFile(filePath);
  const parser = new PDFParse({ data });

  try {
    const result = await parser.getText();
    // Usamos el texto de las páginas sin los separadores que agrega la biblioteca.
    return {
      text: result.pages.map((page) => page.text).join("\n\n").trim(),
      totalPages: result.total,
      pagesWithLittleText: result.pages.filter(
        (page) => page.text.trim().length < MIN_PDF_PAGE_CHARACTERS,
      ).length,
    };
  } finally {
    // Liberamos los recursos del lector incluso si la extracción falla.
    await parser.destroy();
  }
}
