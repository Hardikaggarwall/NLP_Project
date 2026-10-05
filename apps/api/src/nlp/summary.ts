import {
    SectionClauseType,
    getAgreementTypeDisplayLabel,
    getDepositTypeDisplayLabel,
} from "@/constants";
import { ExtractedFields } from "./extract";
import { DetectedRisk } from "./risks";
import { ParsedSection } from "./sections";
import { plainEnglish, splitSentences, tokenize, truncate } from "./text";

const MAX_POINT_LENGTH = 240;

/**
 * Formats an amount with its currency ("INR 25,000").
 */
export const formatMoney = (amount: number, currency: string | null) =>
    `${currency ? currency + " " : ""}${amount.toLocaleString("en-US")}`;

/**
 * Formats an ISO date as "1 Jan 2024".
 */
export const formatDate = (iso: string) =>
    new Date(iso + "T00:00:00Z").toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
    });

// Clause types worth surfacing in the summary, in reading order
const SUMMARY_CLAUSES: { type: SectionClauseType; cue: RegExp }[] = [
    { type: "RESTRICTIONS", cue: /\b(use|purpose|sublet|pets?|smok\w*)\b/i },
    { type: "MAINTENANCE", cue: /\b(maint\w*|charges?|clean\w*)\b/i },
    { type: "REPAIRS", cue: /\b(repair\w*|damage\w*)\b/i },
    { type: "UTILITIES", cue: /\b(electricity|water|bills?|utilit\w*)\b/i },
    { type: "NOTICE_PERIOD", cue: /\b(notice|month|days?)\b/i },
    {
        type: "TERMINATION",
        cue: /\b(terminat\w*|vacat\w*|notice|lock[- ]?in)\b/i,
    },
    { type: "EVICTION", cue: /\b(evict\w*|possession|vacat\w*)\b/i },
    { type: "RENEWAL", cue: /\b(renew\w*|extend\w*)\b/i },
    { type: "INSURANCE", cue: /\binsur\w*\b/i },
];

/**
 * Scores a sentence by cue hits, numbers and a mid-range length.
 */
const scoreSentence = (sentence: string, cue: RegExp) => {
    const words = tokenize(sentence).length;
    if (words < 6 || words > 70) return 0;
    let score = (sentence.match(new RegExp(cue.source, "gi")) ?? []).length * 2;
    if (/\d/.test(sentence)) score += 1.5;
    if (/\b(shall|must|will|may not|not allowed)\b/i.test(sentence)) score += 1;
    return score - Math.abs(words - 25) / 25;
};

/**
 * Picks the most informative sentence from sections of a clause type.
 */
const bestSentence = (
    sections: ParsedSection[],
    type: SectionClauseType,
    cue: RegExp,
): string | null => {
    let best: string | null = null;
    let bestScore = 0;
    for (const section of sections.filter((s) => s.type === type)) {
        for (const sentence of splitSentences(section.content)) {
            const score = scoreSentence(sentence, cue);
            if (score > bestScore) {
                best = sentence;
                bestScore = score;
            }
        }
    }
    return best;
};

/**
 * Builds a plain-English, point-wise summary of the agreement.
 */
export const buildSummary = (
    fields: ExtractedFields,
    sections: ParsedSection[],
    risks: DetectedRisk[],
): string[] => {
    const points: string[] = [];
    const { metadata, property, payments, parties } = fields;

    points.push(
        `This is a ${getAgreementTypeDisplayLabel(fields.type).toLowerCase()}${fields.title ? ` titled "${fields.title}"` : ""}.`,
    );

    const landlords = parties?.filter((p) => p.role === "LANDLORD") ?? [];
    const tenants = parties?.filter((p) => p.role === "TENANT") ?? [];
    if (landlords.length || tenants.length) {
        const names = (list: typeof landlords) =>
            list.map((p) => p.name).join(" and ");
        points.push(
            [
                landlords.length ? `Landlord: ${names(landlords)}` : null,
                tenants.length ? `Tenant: ${names(tenants)}` : null,
            ]
                .filter(Boolean)
                .join(". ") + ".",
        );
    }

    if (property) {
        const parts = [
            property.type ? `a ${property.type.toLowerCase()}` : "the property",
            property.address ? `at ${property.address}` : null,
            property.size ? `(${property.size})` : null,
            property.usageTerm
                ? `for ${property.usageTerm.toLowerCase()} use`
                : null,
        ].filter(Boolean);
        points.push(`The agreement covers ${parts.join(" ")}.`);
    }

    if (metadata.effectiveDate && metadata.expiryDate) {
        points.push(
            `It runs from ${formatDate(metadata.effectiveDate)} to ${formatDate(metadata.expiryDate)}.`,
        );
    } else if (metadata.effectiveDate) {
        points.push(`It starts on ${formatDate(metadata.effectiveDate)}.`);
    } else if (metadata.expiryDate) {
        points.push(`It ends on ${formatDate(metadata.expiryDate)}.`);
    }

    if (payments?.rentAmount) {
        points.push(
            `Rent is ${formatMoney(payments.rentAmount, payments.currency)}, payable ${payments.rentCycle.toLowerCase()}.`,
        );
    }
    if (payments?.depositAmount) {
        points.push(
            `${getDepositTypeDisplayLabel(payments.depositType)} of ${formatMoney(payments.depositAmount, payments.currency)} is required.`,
        );
    }

    if (metadata.autoRenewal === true) {
        points.push(
            "The agreement renews automatically at the end of the term.",
        );
    }
    if (metadata.governingLaw) {
        points.push(`It is governed by the laws of ${metadata.governingLaw}.`);
    }

    const used = new Set<string>();
    for (const { type, cue } of SUMMARY_CLAUSES) {
        const sentence = bestSentence(sections, type, cue);
        if (!sentence || used.has(sentence)) continue;
        used.add(sentence);
        points.push(plainEnglish(sentence));
    }

    if (risks.length > 0) {
        const serious = risks.filter(
            (r) => r.level === "HIGH" || r.level === "CRITICAL",
        ).length;
        points.push(
            `${risks.length} potential risk${risks.length === 1 ? "" : "s"} flagged${serious ? `, ${serious} of them high or critical` : ""}. Review the Risks tab before signing.`,
        );
    } else {
        points.push("No significant risk patterns were detected.");
    }

    return points
        .map((p) => truncate(p.replace(/\s+/g, " ").trim(), MAX_POINT_LENGTH))
        .slice(0, 20);
};
