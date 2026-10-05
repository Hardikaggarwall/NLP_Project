import { ExtractedFields, extractFields, isRentalAgreement } from "./extract";
import { DetectedRisk, detectRisks } from "./risks";
import { ParsedSection, extractSections } from "./sections";
import { buildSummary } from "./summary";
import { normalizeText } from "./text";

export { answerQuestion, queryTerms } from "./query";
export type { QueryContext } from "./query";

export interface AgreementAnalysis extends ExtractedFields {
    sections: ParsedSection[];
    risks: DetectedRisk[];
    summary: string[];
}

/**
 * Runs the full rule-based NLP pipeline over raw agreement text.
 * Deterministic and dependency-free: same input always yields same output.
 */
export const analyzeAgreementText = (
    rawText: string,
): { error: string } | { analysis: AgreementAnalysis } => {
    const text = normalizeText(rawText);

    if (!isRentalAgreement(text)) {
        return { error: "File is not a valid rental agreement" };
    }

    const fields = extractFields(text);
    const sections = extractSections(text);
    const risks = detectRisks(text, fields.payments);
    const summary = buildSummary(fields, sections, risks);

    return { analysis: { ...fields, sections, risks, summary } };
};
