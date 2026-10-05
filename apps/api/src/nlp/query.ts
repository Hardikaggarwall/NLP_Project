import {
    getAgreementTypeDisplayLabel,
    getDepositTypeDisplayLabel,
    getPartyRoleDisplayLabel,
    getRiskLevelDisplayLabel,
} from "@/constants";
import {
    AgreementMetadata,
    AgreementParty,
    AgreementPayments,
    AgreementProperty,
} from "./extract";
import { formatDate, formatMoney } from "./summary";
import { splitSentences, tokenize, truncate } from "./text";

export interface QueryContext {
    agreement: {
        title: string | null;
        type: string | null;
        summary: string[] | null;
        metadata: AgreementMetadata | null;
        property: AgreementProperty | null;
        payments: AgreementPayments | null;
        parties: AgreementParty[] | null;
    };
    risks: { clause: string; reason: string; level: string }[];
    sections: { ref: string; heading: string; content: string }[];
}

const STOPWORDS = new Set(
    "a an and are as at be by can do does for from has have how i if in is it me my of on or our the their there this to was what when where which who will with would you your about any should could tell please agreement".split(
        " ",
    ),
);

/**
 * Extracts meaningful search terms from a question.
 */
export const queryTerms = (question: string): string[] =>
    [...new Set(tokenize(question))].filter(
        (t) => t.length > 2 && !STOPWORDS.has(t),
    );

/**
 * Crude stem used to match question terms against clause text.
 */
const stem = (word: string) =>
    word.replace(/(ings?|ed|es|s|ly|ment|ation)$/, "").slice(0, 7);

type Intent = {
    id: string;
    pattern: RegExp;
    answer: (ctx: QueryContext) => string | null;
};

const INTENTS: Intent[] = [
    {
        id: "greeting",
        pattern: /^\s*(hi|hello|hey|thanks?|thank you)\b/i,
        answer: () =>
            "Hi! Ask me anything about this agreement, e.g. the rent, deposit, dates, notice period, termination terms or risks.",
    },
    {
        id: "summary",
        pattern:
            /\b(summar\w*|overview|key points|tl;?dr|explain (the|this) (agreement|document))\b/i,
        answer: ({ agreement }) =>
            agreement.summary?.length
                ? `Here is a summary:\n${agreement.summary.map((p) => `• ${p}`).join("\n")}`
                : null,
    },
    {
        id: "rent",
        // "how much" means rent unless the question names another amount
        pattern:
            /\b(rent|monthly (payment|amount)|pay per|licen[cs]e fee)\b|^(?!.*\b(deposit|advance|security|late|fee|fine|penalt\w*)\b).*\bhow much\b/i,
        answer: ({ agreement: { payments } }) =>
            payments?.rentAmount
                ? `The rent is ${formatMoney(payments.rentAmount, payments.currency)}, payable ${payments.rentCycle.toLowerCase()}.`
                : null,
    },
    {
        id: "deposit",
        pattern: /\b(deposit|security amount|advance)\b/i,
        answer: ({ agreement: { payments } }) =>
            payments?.depositAmount
                ? `The ${getDepositTypeDisplayLabel(payments.depositType).toLowerCase()} is ${formatMoney(payments.depositAmount, payments.currency)}.`
                : null,
    },
    {
        id: "dates",
        pattern:
            /\b(start|begin|commenc\w*|effective|end|expir\w*|duration|how long|term|until|valid)\b/i,
        answer: ({ agreement: { metadata } }) => {
            if (!metadata) return null;
            const parts = [
                metadata.effectiveDate
                    ? `starts on ${formatDate(metadata.effectiveDate)}`
                    : null,
                metadata.expiryDate
                    ? `ends on ${formatDate(metadata.expiryDate)}`
                    : null,
            ].filter(Boolean);
            return parts.length
                ? `The agreement ${parts.join(" and ")}.`
                : null;
        },
    },
    {
        id: "parties",
        pattern:
            /\b(landlord|tenant|owner|lessor|lessee|licensor|licensee|parties|party)\b/i,
        answer: ({ agreement: { parties } }) =>
            parties?.length
                ? `The parties are:\n${parties
                      .map(
                          (p) =>
                              `• ${getPartyRoleDisplayLabel(p.role)}: ${p.name}${p.address ? ` (${p.address})` : ""}`,
                      )
                      .join("\n")}`
                : null,
    },
    {
        id: "property",
        pattern:
            /\b(address|where|located|location|property|premises|size|area|sq)\b/i,
        answer: ({ agreement: { property } }) => {
            if (!property) return null;
            const parts = [
                property.type ? `Type: ${property.type}` : null,
                property.address ? `Address: ${property.address}` : null,
                property.size ? `Size: ${property.size}` : null,
                property.usageTerm ? `Usage: ${property.usageTerm}` : null,
            ].filter(Boolean);
            return parts.length
                ? `Property details:\n${parts.map((p) => `• ${p}`).join("\n")}`
                : null;
        },
    },
    {
        id: "renewal",
        pattern: /\b(renew\w*|extend|extension)\b/i,
        answer: ({ agreement: { metadata } }) =>
            metadata?.autoRenewal === true
                ? "The agreement renews automatically at the end of its term."
                : metadata?.autoRenewal === false
                  ? "The agreement does not renew automatically; renewal needs both parties to agree."
                  : null,
    },
    {
        id: "law",
        pattern: /\b(law|legal|jurisdiction|court|governed|arbitration)\b/i,
        answer: ({ agreement: { metadata } }) =>
            metadata?.governingLaw
                ? `The agreement is governed by the laws of ${metadata.governingLaw}.`
                : null,
    },
    {
        id: "type",
        pattern: /\b(what (kind|type) of|type of agreement)\b/i,
        answer: ({ agreement }) =>
            `This is a ${getAgreementTypeDisplayLabel(agreement.type).toLowerCase()}${agreement.title ? ` ("${agreement.title}")` : ""}.`,
    },
    {
        id: "risks",
        pattern:
            /\b(risk\w*|red flags?|concern\w*|unfair|dangerous|problem\w*|watch out|safe)\b/i,
        answer: ({ risks }) =>
            risks.length
                ? `${risks.length} potential risk${risks.length === 1 ? "" : "s"} found:\n${risks
                      .slice(0, 6)
                      .map(
                          (r) =>
                              `• [${getRiskLevelDisplayLabel(r.level)}] ${r.reason}`,
                      )
                      .join("\n")}`
                : "No significant risk patterns were detected in this agreement.",
    },
];

/**
 * Picks the sentences of a section that best match the question terms.
 */
const relevantSentences = (content: string, terms: string[], limit = 2) => {
    const stems = terms.map(stem);
    return splitSentences(content)
        .map((sentence) => {
            const words = new Set(tokenize(sentence).map(stem));
            const hits = stems.filter((s) => words.has(s)).length;
            return { sentence, hits };
        })
        .filter((s) => s.hits > 0)
        .sort((a, b) => b.hits - a.hits)
        .slice(0, limit)
        .map((s) => truncate(s.sentence, 400));
};

/**
 * Answers a question using extracted fields and full-text matched clauses.
 */
export const answerQuestion = (question: string, ctx: QueryContext): string => {
    const answers: string[] = [];
    const matched = INTENTS.filter((intent) => intent.pattern.test(question));

    for (const intent of matched) {
        const answer = intent.answer(ctx);
        if (answer) answers.push(answer);
        if (intent.id === "greeting" && answer) return answer;
    }

    const terms = queryTerms(question);
    const excerpts: string[] = [];
    for (const section of ctx.sections) {
        for (const sentence of relevantSentences(section.content, terms)) {
            excerpts.push(
                `• ${section.heading} (clause ${section.ref}): ${sentence}`,
            );
        }
        if (excerpts.length >= 4) break;
    }

    if (excerpts.length > 0) {
        answers.push(
            `${answers.length ? "Relevant clauses" : "Here is what the agreement says"}:\n${excerpts.join("\n")}`,
        );
    }

    if (answers.length === 0) {
        return "I couldn't find anything about that in this agreement. Try asking about the rent, deposit, start or end dates, notice period, termination, maintenance, repairs, or risks.";
    }

    return answers.join("\n\n");
};
