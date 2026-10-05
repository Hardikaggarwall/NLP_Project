/**
 * Low-level text helpers shared by the rule-based NLP pipeline.
 */

const ABBREVIATIONS =
    /\b(Rs|No|Nos|Mr|Mrs|Ms|Dr|Sr|Jr|St|Ltd|Pvt|Co|Inc|Corp|Sq|Ft|approx|viz|vs|Smt|Shri|Sh|Hon|Govt|Dept|Apt|Flr|Rd|Nr|Opp|i\.e|e\.g|etc)\./gi;
const DOT_PLACEHOLDER = "․"; // one dot leader, restored after splitting

export const WORD_NUMBERS: Record<string, number> = {
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
    ten: 10,
    eleven: 11,
    twelve: 12,
    fifteen: 15,
    twenty: 20,
    thirty: 30,
    sixty: 60,
    ninety: 90,
};

/**
 * Normalizes whitespace, ligatures and quotes while keeping line breaks.
 */
export const normalizeText = (raw: string): string =>
    raw
        .replace(/\r\n?/g, "\n")
        .replace(/ﬁ/g, "fi")
        .replace(/ﬂ/g, "fl")
        .replace(/[‘’]/g, "'")
        .replace(/[“”]/g, '"')
        .replace(/[–—]/g, "-")
        .replace(/ /g, " ")
        .replace(/[ \t]+/g, " ")
        .replace(/ *\n */g, "\n")
        // Page footers/headers such as "Page 1 of 2" or "- 3 -"
        .replace(/^(page\s+\d+(\s+of\s+\d+)?|-\s*\d+\s*-)$/gim, "")
        .replace(/\n{3,}/g, "\n\n")
        .trim();

/**
 * Collapses all whitespace (including newlines) into single spaces.
 */
export const flatten = (text: string): string =>
    text.replace(/\s+/g, " ").trim();

/**
 * Splits text into sentences, protecting common abbreviations and decimals.
 */
export const splitSentences = (text: string): string[] => {
    const protectedText = flatten(text)
        .replace(ABBREVIATIONS, (m) => m.slice(0, -1) + DOT_PLACEHOLDER)
        .replace(/(\d)\.(\d)/g, `$1${DOT_PLACEHOLDER}$2`);

    return protectedText
        .split(/(?<=[.!?;])\s+(?=["'(]?[A-Z0-9])/)
        .map((s) => s.replaceAll(DOT_PLACEHOLDER, ".").trim())
        .filter((s) => s.length > 2);
};

/**
 * Lowercase word tokens (letters/digits only).
 */
export const tokenize = (text: string): string[] =>
    text.toLowerCase().match(/[a-z0-9]+/g) ?? [];

/**
 * Converts "30", "thirty" or "thirty (30)" style values into a number.
 */
export const parseCount = (value: string): number | null => {
    const digits = value.match(/\d+/);
    if (digits) return Number(digits[0]);
    return WORD_NUMBERS[value.toLowerCase().trim()] ?? null;
};

/**
 * Truncates text at a word boundary.
 */
export const truncate = (text: string, max: number): string => {
    if (text.length <= max) return text;
    const cut = text.slice(0, max - 1);
    const lastSpace = cut.lastIndexOf(" ");
    return (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut) + "…";
};

/**
 * Title-cases a string ("LEAVE AND LICENSE" -> "Leave And License").
 */
export const toTitleCase = (text: string): string =>
    text
        .toLowerCase()
        .replace(/\b([a-z])/g, (c) => c.toUpperCase())
        .trim();

/**
 * Rewrites legal jargon into plain everyday terms.
 */
export const plainEnglish = (text: string): string =>
    text
        .replace(/\b(the\s+)?(lessor|licensor|owner)s?\b/gi, "$1Landlord")
        .replace(/\b(the\s+)?(lessee|licensee)s?\b/gi, "$1Tenant")
        .replace(/\bhereinafter\b[^,.;]*?(called|referred to as)\s*/gi, "")
        .replace(
            /\b(hereto|hereby|herein|thereof|whereof|heretofore)\b\s*/gi,
            "",
        )
        .replace(/\bshall\b/gi, "must")
        .replace(/\bdemised premises\b/gi, "property")
        .replace(/\bpremises\b/gi, "property")
        .replace(/\s{2,}/g, " ")
        .trim();

/**
 * Counts regex matches in text.
 */
export const countMatches = (text: string, pattern: RegExp): number => {
    const flags = pattern.flags.includes("g")
        ? pattern.flags
        : pattern.flags + "g";
    return (text.match(new RegExp(pattern.source, flags)) ?? []).length;
};
