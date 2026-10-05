import { env } from "@/config/env.config";
import { LiteParse } from "@llamaindex/liteparse";
import { logger } from "./logger.util";

const PDF_PARSER = new LiteParse({
    ocrEnabled: true,
    ocrLanguage: "eng",
    dpi: 300,
    outputFormat: "text",
    quiet: env.NODE_ENV === "production",
    keepHeadersFooters: false,
    extractFormFields: true,
    preserveVerySmallText: true,
});

/**
 * Extracts raw text from a PDF buffer (falls back to OCR for scanned pages)
 *
 * @param key string - A unique identifier used for logging
 * @param pdfBuffer Buffer - PDF Buffer
 * @returns Parsed text of all pages
 */
export const parsePDF = async (
    key: string,
    pdfBuffer: Buffer,
): Promise<{ text: string; pages: number }> => {
    const parserLogger = logger.child({ key });
    parserLogger.info("Starting PDF Parser");

    const result = await PDF_PARSER.parse(pdfBuffer);

    if (result.pages.length === 0) {
        parserLogger.error("No pages found in PDF");
        throw new Error("No pages found in PDF");
    }

    parserLogger.info({ pages: result.pages.length }, "PDF Parsing completed");
    return { text: result.text, pages: result.pages.length };
};
