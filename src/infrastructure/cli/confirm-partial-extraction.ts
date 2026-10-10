import { createInterface } from "node:readline";

export async function confirmPartialExtraction(): Promise<boolean> {
  const reader = createInterface({ input: process.stdin, output: process.stdout });

  try {
    return await new Promise<boolean>((resolve) => {
      // Si se cierra la entrada sin responder, cancelamos.
      reader.once("close", () => resolve(false));
      reader.question("Continue? [y/N] ", (answer) => {
        resolve(["y", "s"].includes(answer.trim().toLowerCase()));
      });
    });
  } finally {
    reader.close();
  }
}
