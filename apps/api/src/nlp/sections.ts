import { SectionClauseType, getClauseTypeDisplayLabel } from "@/constants";
import { flatten, splitSentences, toTitleCase, truncate } from "./text";

export interface ParsedSection {
    ref: string;
    type: SectionClauseType;
    heading: string;
    content: string;
}

/**
 * Keyword patterns per clause type. Heading hits weigh more than body hits.
 */
const CLAUSE_KEYWORDS: Record<Exclude<SectionClauseType, "GENERAL">, RegExp> = {
    PARTIES: /\b(part(y|ies)|between|hereinafter|first part|second part)\b/gi,
    TERM: /\b(term|period of (the )?(lease|licen[cs]e|agreement)|duration|commenc\w*|months?|years?)\b/gi,
    RENT_PAYMENT:
        /\b(rent\w*|licen[cs]e fee|payment|payable|pay|monthly|due date|per month)\b/gi,
    DEPOSIT:
        /\b(deposit|security amount|refundable|advance amount|interest[- ]free)\b/gi,
    MAINTENANCE: /\b(maint\w*|upkeep|clean\w*|society charges|common area)\b/gi,
    REPAIRS: /\b(repair\w*|damage\w*|wear and tear|replace\w*|fix\w*)\b/gi,
    TERMINATION:
        /\b(terminat\w*|cancel\w*|vacat\w*|premature\w*|lock[- ]in|end of (the )?(lease|agreement))\b/gi,
    NOTICE_PERIOD: /\b(notice\w*|intimat\w*|in writing)\b/gi,
    RESTRICTIONS:
        /\b(shall not|not (be )?(allowed|permitted)|prohibit\w*|sub[- ]?let\w*|pets?|smok\w*|alteration\w*|purpose|use of)\b/gi,
    UTILITIES:
        /\b(electricity|water|gas|utilit(y|ies)|bills?|internet|meter)\b/gi,
    INSURANCE: /\b(insur\w*)\b/gi,
    EVICTION:
        /\b(evict\w*|re-?enter|repossess\w*|possession|forfeit\w*|dispossess\w*)\b/gi,
    DISPUTE_RESOLUTION:
        /\b(disputes?|arbitrat\w*|courts?|jurisdiction|governed by|laws? of)\b/gi,
    INDEMNIFICATION: /\b(indemni\w*|hold harmless|liab(le|ility)|losses)\b/gi,
    RENEWAL: /\b(renew\w*|extend\w*|extension)\b/gi,
};

const countIn = (text: string, pattern: RegExp) =>
    (text.match(pattern) ?? []).length;

/**
 * Classifies a section into a clause type using weighted keyword scores.
 */
export const classifySection = (
    heading: string,
    content: string,
): SectionClauseType => {
    let best: SectionClauseType = "GENERAL";
    let bestScore = 1.5;
    const body = content.slice(0, 3000);

    for (const [type, pattern] of Object.entries(CLAUSE_KEYWORDS)) {
        const score =
            countIn(heading, pattern) * 4 + Math.min(countIn(body, pattern), 6);
        if (score > bestScore) {
            best = type as SectionClauseType;
            bestScore = score;
        }
    }
    return best;
};

// "1.", "2)", "Clause 3", "Article 4:", "Section 5 -"
const NUMBERED_HEADING =
    /^(?:(?:clause|article|section|para(?:graph)?)\s+)?(\d{1,2})\s*[.):\-]\s*(?!\d)(.*)$/i;
// "FIRST:", "SECONDLY,"
const ORDINAL_HEADING =
    /^(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth|thirteenth|fourteenth|fifteenth|sixteenth|seventeenth|eighteenth|nineteenth|twentieth)(?:ly)?\s*[:,.\-]\s*(.*)$/i;
// Short all-caps line, e.g. "TERM OF LEASE"
const CAPS_HEADING = /^[A-Z][A-Z0-9 &/,'()\-]{2,70}:?$/;
const MINOR_WORDS = new Set([
    "of",
    "and",
    "the",
    "to",
    "for",
    "in",
    "on",
    "&",
    "or",
]);

/**
 * Short Title Case line followed by a longer body line, e.g. "Security Deposit"
 */
const isTitleCaseHeading = (line: string, next: string | undefined) => {
    const words = line.replace(/:$/, "").split(" ");
    if (words.length > 6 || line.length > 50 || /[.,;]$/.test(line))
        return false;
    if (!/[a-z]/.test(line)) return false;
    const titled = words.every(
        (w, i) => /^[A-Z]/.test(w) || (i > 0 && MINOR_WORDS.has(w)),
    );
    return (
        titled &&
        !!next &&
        next.length > line.length &&
        next.split(" ").length >= 5
    );
};

/**
 * Splits a leading "Heading: body" or "HEADING. body" into its parts.
 */
const splitInlineHeading = (
    line: string,
): { heading: string; body: string } => {
    const match =
        line.match(/^([A-Z][A-Za-z &/'\-]{2,60}?)\s*[:\-]\s+(.+)$/) ??
        line.match(/^([A-Z][A-Z &/'\-]{2,60}?)\.\s+(.+)$/);
    if (match && match[1].split(" ").length <= 8) {
        return { heading: match[1].trim(), body: match[2] };
    }
    return { heading: "", body: line };
};

interface RawSection {
    ref: string;
    heading: string;
    lines: string[];
}

/**
 * Detects headings in the document and groups following lines into sections.
 */
const detectSections = (text: string): RawSection[] => {
    const lines = text.split("\n").map((l) => l.trim());
    const sections: RawSection[] = [];
    let current: RawSection = { ref: "0", heading: "Preamble", lines: [] };
    let lastNumber = 0;
    let ordinalIndex = 0;

    const push = () => {
        if (current.lines.join(" ").trim().length > 0 || current.heading) {
            sections.push(current);
        }
    };

    const nonEmpty = lines.filter(Boolean);

    for (const [index, line] of nonEmpty.entries()) {
        const numbered = line.match(NUMBERED_HEADING);
        // Only accept strictly sequential numbering to avoid amounts/dates
        if (numbered && Number(numbered[1]) === lastNumber + 1) {
            push();
            lastNumber = Number(numbered[1]);
            const { heading, body } = splitInlineHeading(numbered[2]);
            current = {
                ref: String(lastNumber),
                heading,
                lines: body ? [body] : [],
            };
            continue;
        }

        const ordinal = line.match(ORDINAL_HEADING);
        if (ordinal) {
            push();
            ordinalIndex += 1;
            const { heading, body } = splitInlineHeading(ordinal[2]);
            current = {
                ref: String(ordinalIndex),
                heading,
                lines: body ? [body] : [],
            };
            continue;
        }

        const letters = line.replace(/[^A-Za-z]/g, "");
        const hasContentBefore = sections.length + current.lines.length > 0;
        if (
            hasContentBefore &&
            ((CAPS_HEADING.test(line) &&
                letters.length >= 4 &&
                line.split(" ").length <= 10) ||
                isTitleCaseHeading(line, nonEmpty[index + 1]))
        ) {
            push();
            current = {
                ref: String(sections.length + 1),
                heading: line.replace(/:$/, ""),
                lines: [],
            };
            continue;
        }

        current.lines.push(line);
    }
    push();

    return sections;
};

/**
 * Chunks unstructured text into sections of a few sentences each.
 */
const chunkBySentences = (text: string, size = 5): RawSection[] => {
    const paragraphs = text
        .split(/\n\s*\n/)
        .map(flatten)
        .filter((p) => p.length > 40);

    const blocks =
        paragraphs.length >= 3
            ? paragraphs
            : (() => {
                  const sentences = splitSentences(text);
                  const out: string[] = [];
                  for (let i = 0; i < sentences.length; i += size) {
                      out.push(sentences.slice(i, i + size).join(" "));
                  }
                  return out;
              })();

    return blocks.map((block, i) => ({
        ref: String(i + 1),
        heading: "",
        lines: [block],
    }));
};

/**
 * Breaks an agreement into typed, headed sections.
 */
export const extractSections = (text: string): ParsedSection[] => {
    let raw = detectSections(text);

    // Fall back to paragraph chunks when no structure was detected
    if (raw.filter((s) => s.ref !== "0").length < 2) {
        raw = chunkBySentences(text);
    }

    return raw
        .map((section) => {
            const content = flatten(section.lines.join(" "));
            const type = classifySection(section.heading, content);
            const heading = section.heading
                ? truncate(
                      section.heading === section.heading.toUpperCase()
                          ? toTitleCase(section.heading)
                          : section.heading,
                      120,
                  )
                : getClauseTypeDisplayLabel(type);

            return {
                ref: section.ref.slice(0, 10),
                type,
                heading,
                content,
            };
        })
        .filter((s) => s.content.length > 0);
};
