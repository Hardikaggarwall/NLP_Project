import {
    AgreementDepositType,
    AgreementPartyRole,
    AgreementType,
    getAgreementTypeDisplayLabel,
} from "@/constants";
import {
    countMatches,
    flatten,
    parseCount,
    splitSentences,
    toTitleCase,
    truncate,
} from "./text";

export interface AgreementMetadata {
    effectiveDate: string | null;
    expiryDate: string | null;
    autoRenewal: boolean | null;
    governingLaw: string | null;
}

export interface AgreementProperty {
    type:
        "Flat" | "House" | "Office" | "Shop" | "Warehouse" | "Building" | null;
    country: string | null;
    state: string | null;
    address: string | null;
    size: string | null;
    usageTerm: string | null;
}

export interface AgreementPayments {
    currency: string | null;
    depositAmount: number | null;
    depositType: AgreementDepositType | null;
    rentAmount: number | null;
    rentCycle:
        "Monthly" | "Quarterly" | "Yearly" | "Half Yearly" | "Every 2 Months";
}

export interface AgreementParty {
    name: string;
    role: AgreementPartyRole;
    address: string | null;
}

export interface ExtractedFields {
    title: string | null;
    type: AgreementType;
    metadata: AgreementMetadata;
    property: AgreementProperty | null;
    payments: AgreementPayments | null;
    parties: AgreementParty[] | null;
}

// ── Validity ───────────────────────────────────────────────────

const RENTAL_TERMS =
    /\b(rent\w*|lease\w*|tenan\w*|landlord|lessor|lessee|licen[cs]or|licen[cs]ee|premises|leave and licen[cs]e|security deposit)\b/gi;

/**
 * Checks whether the text looks like a rental/lease agreement.
 */
export const isRentalAgreement = (text: string): boolean =>
    text.length >= 200 && countMatches(text, RENTAL_TERMS) >= 5;

// ── Dates ──────────────────────────────────────────────────────

const MONTHS: Record<string, number> = {
    jan: 1,
    feb: 2,
    mar: 3,
    apr: 4,
    may: 5,
    jun: 6,
    jul: 7,
    aug: 8,
    sep: 9,
    oct: 10,
    nov: 11,
    dec: 12,
};
const MONTH_NAME =
    "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";

const DATE_PATTERNS: {
    regex: RegExp;
    toParts: (
        m: RegExpMatchArray,
        preferMDY: boolean,
    ) => [number, number, number];
}[] = [
    // 2024-01-31
    {
        regex: /\b(\d{4})-(\d{1,2})-(\d{1,2})\b/gi,
        toParts: (m) => [+m[1], +m[2], +m[3]],
    },
    // 1st day of January, 2024 / 1 January 2024
    {
        regex: new RegExp(
            `\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:day\\s+of\\s+)?${MONTH_NAME}\\.?,?\\s+(\\d{4})\\b`,
            "gi",
        ),
        toParts: (m) => [+m[3], MONTHS[m[2].slice(0, 3).toLowerCase()], +m[1]],
    },
    // January 1st, 2024
    {
        regex: new RegExp(
            `\\b${MONTH_NAME}\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})\\b`,
            "gi",
        ),
        toParts: (m) => [+m[3], MONTHS[m[1].slice(0, 3).toLowerCase()], +m[2]],
    },
    // 31/01/2024, 01-31-2024, 31.01.24
    {
        regex: /\b(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2}|\d{4})\b/g,
        toParts: (m, preferMDY) => {
            let a = +m[1];
            let b = +m[2];
            const year = m[3].length === 2 ? 2000 + +m[3] : +m[3];
            // Decide day/month order; ambiguity resolved by locale preference
            const mdy = a > 12 ? false : b > 12 ? true : preferMDY;
            return mdy ? [year, a, b] : [year, b, a];
        },
    },
];

const toISODate = ([y, m, d]: [number, number, number]): string | null => {
    if (!y || !m || !d || m > 12 || d > 31 || y < 1950 || y > 2150) return null;
    const date = new Date(Date.UTC(y, m - 1, d));
    if (date.getUTCDate() !== d) return null;
    return date.toISOString().slice(0, 10);
};

interface FoundDate {
    iso: string;
    index: number;
}

/**
 * Finds all dates in a string, sorted by position.
 */
export const findDates = (text: string, preferMDY = false): FoundDate[] => {
    const found: FoundDate[] = [];
    for (const { regex, toParts } of DATE_PATTERNS) {
        for (const m of text.matchAll(regex)) {
            const iso = toISODate(toParts(m, preferMDY));
            if (iso && !found.some((f) => f.index === m.index)) {
                found.push({ iso, index: m.index ?? 0 });
            }
        }
    }
    return found.sort((a, b) => a.index - b.index);
};

const addDuration = (iso: string, months: number): string => {
    const date = new Date(iso + "T00:00:00Z");
    date.setUTCMonth(date.getUTCMonth() + months);
    date.setUTCDate(date.getUTCDate() - 1);
    return date.toISOString().slice(0, 10);
};

/**
 * Extracts the lease duration in months ("eleven (11) months", "2 years").
 */
export const extractDurationMonths = (text: string): number | null => {
    const match = text.match(
        /\b(?:period|term|duration)\b[^.]{0,80}?\b([a-z]+|\d+)\s*(?:\((\d+)\)\s*)?(months?|years?)\b/i,
    );
    if (!match) return null;
    const count = parseCount(match[2] ?? match[1]);
    if (!count) return null;
    return /year/i.test(match[3]) ? count * 12 : count;
};

const extractTermDates = (
    sentences: string[],
    fullText: string,
    preferMDY: boolean,
): { effectiveDate: string | null; expiryDate: string | null } => {
    let effectiveDate: string | null = null;
    let expiryDate: string | null = null;

    for (const s of sentences) {
        // "from 1 Jan 2024 to 30 Nov 2024"
        if (
            /\bfrom\b/i.test(s) &&
            /\b(to|till|until|upto|up to|ending)\b/i.test(s)
        ) {
            const dates = findDates(s, preferMDY);
            if (dates.length >= 2) {
                effectiveDate ??= dates[0].iso;
                expiryDate ??= dates[1].iso;
            }
        }
    }

    for (const s of sentences) {
        const dates = findDates(s, preferMDY);
        if (dates.length === 0) continue;
        if (
            !effectiveDate &&
            /\b(commenc\w*|effective|start\w*|begin\w*|w\.?e\.?f)\b/i.test(s)
        ) {
            effectiveDate = dates[0].iso;
        }
        if (
            !expiryDate &&
            /\b(expir\w*|ending|end on|ends on|till|until|upto|up to|terminate on)\b/i.test(
                s,
            )
        ) {
            expiryDate = dates[dates.length - 1].iso;
        }
    }

    // Execution date ("made on this 1st day of ...") as a fallback start
    if (!effectiveDate) {
        const exec = sentences.find((s) =>
            /\b(made|executed|entered into|signed)\b/i.test(s),
        );
        const dates = exec ? findDates(exec, preferMDY) : [];
        if (dates.length > 0) effectiveDate = dates[0].iso;
    }

    // Derive expiry from duration
    if (effectiveDate && !expiryDate) {
        const months = extractDurationMonths(fullText);
        if (months) expiryDate = addDuration(effectiveDate, months);
    }

    if (effectiveDate && expiryDate && expiryDate <= effectiveDate) {
        expiryDate = null;
    }

    return { effectiveDate, expiryDate };
};

// ── Money ──────────────────────────────────────────────────────

const CURRENCIES: { code: string; pattern: RegExp }[] = [
    { code: "INR", pattern: /₹|\brs\.?(?=\s*\d)|\binr\b|\brupees?\b/gi },
    { code: "USD", pattern: /\$|\busd\b|\bdollars?\b/gi },
    { code: "EUR", pattern: /€|\beur\b|\beuros?\b/gi },
    { code: "GBP", pattern: /£|\bgbp\b|\bpounds? sterling\b/gi },
    { code: "AED", pattern: /\baed\b|\bdirhams?\b/gi },
    { code: "CAD", pattern: /\bcad\b|\bcanadian dollars?\b/gi },
    { code: "AUD", pattern: /\baud\b|\baustralian dollars?\b/gi },
    { code: "SGD", pattern: /\bsgd\b|\bsingapore dollars?\b/gi },
];

const detectCurrency = (text: string): string | null => {
    let best: string | null = null;
    let bestCount = 0;
    for (const { code, pattern } of CURRENCIES) {
        const count = countMatches(text, pattern);
        if (count > bestCount) {
            best = code;
            bestCount = count;
        }
    }
    return best;
};

const MONEY =
    /(?:₹|\brs\.?|\binr|\$|\busd|€|\beur|£|\bgbp|\baed|\bcad|\baud|\bsgd)\s*([\d,]+(?:\.\d{1,2})?)|\b([\d,]{3,}(?:\.\d{1,2})?)\s*(?:\/-\s*)?(?:rupees|dollars|euros?|pounds|dirhams|inr|usd|eur|gbp|aed)?/gi;

/**
 * Finds monetary amounts in a sentence (ignores years and small numbers).
 */
export const findAmounts = (sentence: string): number[] => {
    const amounts: number[] = [];
    for (const m of sentence.matchAll(MONEY)) {
        const raw = (m[1] ?? m[2] ?? "").replace(/,/g, "");
        const value = Number(raw);
        const isYear = /^(19|20|21)\d{2}$/.test(raw) && !m[1];
        if (Number.isFinite(value) && value >= 100 && !isYear) {
            amounts.push(value);
        }
    }
    return amounts;
};

const extractPayments = (
    sentences: string[],
    text: string,
): AgreementPayments | null => {
    const rentSentences = sentences.filter(
        (s) =>
            /\b(rent\w*|licen[cs]e fee|monthly charges?)\b/i.test(s) &&
            !/\b(deposit|security|advance (rent|amount|payment)|brokerage|penalt\w*|late fee|interest)\b/i.test(
                s,
            ),
    );
    const preferred = rentSentences.find((s) =>
        /\b(per month|monthly|p\.?\s?m\.?|every month|a month)\b/i.test(s),
    );
    const rentAmount =
        [preferred, ...rentSentences]
            .filter(Boolean)
            .map((s) => findAmounts(s!)[0])
            .find((a) => a !== undefined) ?? null;

    const depositSentence = sentences.find(
        (s) =>
            /\b(deposit|security amount)\b/i.test(s) && findAmounts(s).length,
    );
    const depositAmount = depositSentence
        ? findAmounts(depositSentence)[0]
        : null;

    if (rentAmount === null && depositAmount === null) return null;

    let depositType: AgreementDepositType | null = null;
    if (depositSentence) {
        if (/\bsecurity\b/i.test(depositSentence))
            depositType = "SECURITY_DEPOSIT";
        else if (/\badvance\b/i.test(depositSentence))
            depositType = "ADVANCE_RENT";
        else if (/\b(utilit\w*|electricity|water)\b/i.test(depositSentence))
            depositType = "UTILITY_FEE";
        else depositType = "OTHER";
    }

    let rentCycle: AgreementPayments["rentCycle"] = "Monthly";
    const cycleText = (preferred ?? rentSentences[0] ?? text).toLowerCase();
    if (/half[- ]?year|semi[- ]?annual|six months/.test(cycleText))
        rentCycle = "Half Yearly";
    else if (/quarter/.test(cycleText)) rentCycle = "Quarterly";
    else if (/every (two|2) months|bi-?monthly/.test(cycleText))
        rentCycle = "Every 2 Months";
    else if (
        /\b(per annum|annual\w*|yearly|per year|p\.?\s?a\.?)\b/.test(
            cycleText,
        ) &&
        !/\b(per month|monthly)\b/.test(cycleText)
    )
        rentCycle = "Yearly";

    return {
        currency: detectCurrency(text),
        depositAmount,
        depositType,
        rentAmount,
        rentCycle,
    };
};

// ── Parties ────────────────────────────────────────────────────

const ROLE_WORDS =
    "landlords?|lessors?|owners?|licensors?|tenants?|lessees?|licensees?";

// Case-insensitive character classes for use inside case-sensitive patterns
const ci = (source: string) =>
    source.replace(/[a-z]/g, (c) => `[${c}${c.toUpperCase()}]`);

const toRole = (word: string): AgreementPartyRole =>
    /landlord|lessor|owner|licensor/i.test(word)
        ? "LANDLORD"
        : /tenant|lessee|licensee/i.test(word)
          ? "TENANT"
          : "OTHER";

const cleanName = (name: string): string =>
    flatten(name)
        // Stop at the next role label ("Mr. X LICENSEE: ...")
        .replace(new RegExp(`\\s+\\b(${ROLE_WORDS}|witness)\\b.*$`, "i"), "")
        .replace(/^(?:the\s+)?(?:said\s+)?/i, "")
        .replace(/^(?:mr|mrs|ms|miss|shri|smt|sh|dr|m\/s)\.?\s+/i, (t) =>
            t.trim().endsWith(".") ? t : t.trim() + ". ",
        )
        .replace(/[,;:\s]+$/, "")
        .trim();

const cleanAddress = (address: string): string =>
    truncate(
        flatten(address)
            .replace(/\b(hereinafter|herein after)\b.*$/i, "")
            .replace(/[,;:(\s]+$/, ""),
        200,
    );

const extractParties = (text: string): AgreementParty[] | null => {
    const flat = flatten(text);
    const parties: AgreementParty[] = [];
    const seen = new Set<string>();

    const add = (name: string, roleWord: string, address: string | null) => {
        const cleaned = cleanName(name);
        if (cleaned.length < 3 || cleaned.length > 100) return;
        if (!/^[A-Z]/.test(cleaned)) return;
        if (/\b(agreement|premises|property|hereinafter)\b/i.test(cleaned))
            return;
        const role = toRole(roleWord);
        // Skip the same person listed again (e.g. in the signature block)
        const key = cleaned.toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        parties.push({ name: cleaned, role, address });
    };

    // "... between Mr. X, S/o ..., residing at ... (hereinafter called the LANDLORD)"
    const intro = new RegExp(
        `(?:\\bby\\s+and\\s+between|\\bbetween|\\band|\\bby|\\bwith|\\bto)\\s*:?\\s+((?:(?:mr|mrs|ms|shri|smt|dr|m\\/s)\\.?\\s+)?[A-Za-z][A-Za-z.&' ]{1,80}?)\\s*(?:,|\\(|\\bs\\/o\\b|\\bd\\/o\\b|\\bw\\/o\\b|\\bson of\\b|\\bdaughter of\\b|\\bwife of\\b|\\baged\\b|\\bresiding\\b|\\bhaving\\b|\\br\\/o\\b|\\bof\\b)(.{0,400}?)(?:hereinafter|herein after)[^.]{0,40}?(?:called|referred to as|referred as|known as|to be called)\\s+(?:as\\s+)?(?:the\\s+)?["'(]*\\s*(${ROLE_WORDS})`,
        "gi",
    );
    for (const m of flat.matchAll(intro)) {
        const addressMatch = m[2].match(
            /(?:residing at|r\/o|resident of|address(?:ed)?\s*(?:at)?|having (?:its )?(?:registered )?office at|situated at)\s*:?\s*(.+)/i,
        );
        add(m[1], m[3], addressMatch ? cleanAddress(addressMatch[1]) : null);
    }

    // "Landlord: John Smith" / "Name of Tenant - Jane Doe"
    const labeled = new RegExp(
        `\\b(?:name of (?:the )?)?(${ROLE_WORDS})(?:'?s)?\\s*(?:name)?\\s*[:\\-]\\s*((?:(?:mr|mrs|ms|shri|smt|dr|m\\/s)\\.?\\s+)?[A-Z][A-Za-z.&']*(?:\\s+[A-Z][A-Za-z.&']*){0,5})`,
        "gi",
    );
    for (const m of flat.matchAll(labeled)) {
        add(m[2], m[1], null);
    }

    // 'John Miller ("Landlord")' / 'ABC Pvt Ltd, a company ... (the "Tenant")'
    const parenthetical = new RegExp(
        `${ci("(?:between|and|by)")}\\s+((?:(?:Mr|Mrs|Ms|Dr|M\\/s)\\.?\\s+)?[A-Z][A-Za-z.&']*(?:\\s+[A-Z][A-Za-z.&']*){0,5})\\s*,?[^()]{0,150}?\\(\\s*(?:${ci("hereinafter")}\\s+(?:${ci("called|referred to as")})\\s+)?(?:${ci("the")}\\s+)?["']?(${ci(ROLE_WORDS)})["']?\\s*\\)`,
        "g",
    );
    for (const m of flat.matchAll(parenthetical)) {
        add(m[1], m[2], null);
    }

    return parties.length > 0 ? parties.slice(0, 6) : null;
};

// ── Property ───────────────────────────────────────────────────

const PROPERTY_TYPES: { type: AgreementProperty["type"]; pattern: RegExp }[] = [
    { type: "Flat", pattern: /\b(flat|apartment|condo\w*|unit no)\b/gi },
    { type: "House", pattern: /\b(house|villa|bungalow|dwelling|home)\b/gi },
    { type: "Office", pattern: /\b(office\s+(?:space|premises|unit))\b/gi },
    { type: "Shop", pattern: /\b(shop|showroom|store|kiosk|retail space)\b/gi },
    { type: "Warehouse", pattern: /\b(warehouse|godown|storage facility)\b/gi },
    { type: "Building", pattern: /\b(entire building|whole building)\b/gi },
];

const INDIAN_STATES = [
    "Andhra Pradesh",
    "Arunachal Pradesh",
    "Assam",
    "Bihar",
    "Chhattisgarh",
    "Goa",
    "Gujarat",
    "Haryana",
    "Himachal Pradesh",
    "Jharkhand",
    "Karnataka",
    "Kerala",
    "Madhya Pradesh",
    "Maharashtra",
    "Manipur",
    "Meghalaya",
    "Mizoram",
    "Nagaland",
    "Odisha",
    "Punjab",
    "Rajasthan",
    "Sikkim",
    "Tamil Nadu",
    "Telangana",
    "Tripura",
    "Uttar Pradesh",
    "Uttarakhand",
    "West Bengal",
    "Delhi",
    "Chandigarh",
    "Jammu and Kashmir",
    "Puducherry",
];

const US_STATES = [
    "Alabama",
    "Alaska",
    "Arizona",
    "Arkansas",
    "California",
    "Colorado",
    "Connecticut",
    "Delaware",
    "Florida",
    "Georgia",
    "Hawaii",
    "Idaho",
    "Illinois",
    "Indiana",
    "Iowa",
    "Kansas",
    "Kentucky",
    "Louisiana",
    "Maine",
    "Maryland",
    "Massachusetts",
    "Michigan",
    "Minnesota",
    "Mississippi",
    "Missouri",
    "Montana",
    "Nebraska",
    "Nevada",
    "New Hampshire",
    "New Jersey",
    "New Mexico",
    "New York",
    "North Carolina",
    "North Dakota",
    "Ohio",
    "Oklahoma",
    "Oregon",
    "Pennsylvania",
    "Rhode Island",
    "South Carolina",
    "South Dakota",
    "Tennessee",
    "Texas",
    "Utah",
    "Vermont",
    "Virginia",
    "Washington",
    "West Virginia",
    "Wisconsin",
    "Wyoming",
];

const COUNTRIES: { name: string; pattern: RegExp }[] = [
    { name: "India", pattern: /\bindia\b/i },
    { name: "United States", pattern: /\b(united states|u\.s\.a?\.?|usa)\b/i },
    { name: "United Kingdom", pattern: /\b(united kingdom|england|u\.k\.)\b/i },
    { name: "Canada", pattern: /\bcanada\b/i },
    { name: "Australia", pattern: /\baustralia\b/i },
    { name: "United Arab Emirates", pattern: /\b(u\.a\.e|uae|dubai)\b/i },
    { name: "Singapore", pattern: /\bsingapore\b/i },
];

const findState = (text: string) => {
    for (const state of INDIAN_STATES) {
        if (new RegExp(`\\b${state}\\b`, "i").test(text))
            return { state, country: "India" };
    }
    for (const state of US_STATES) {
        if (new RegExp(`\\b${state}\\b`).test(text))
            return { state, country: "United States" };
    }
    return null;
};

const extractProperty = (
    text: string,
    currency: string | null,
): AgreementProperty | null => {
    const flat = flatten(text);

    let type: AgreementProperty["type"] = null;
    let bestCount = 0;
    for (const { type: t, pattern } of PROPERTY_TYPES) {
        const count = countMatches(flat, pattern);
        if (count > bestCount) {
            type = t;
            bestCount = count;
        }
    }

    const addressMatch = flat.match(
        /\b(?:premises|property|flat|house|apartment|unit|shop|office|building)\b[^.]{0,80}?\b(?:situated at|situate at|located at|bearing|address(?:ed)? at|known as|lying at)\s*:?\s*((?:[^.;]|(?<=\b(?:No|Nos|St|Rd|Apt|Plot|Sec|Sector|Blk))\.){10,220}?)(?=\s*(?:\(|hereinafter|herein after|which|(?:ad)?measuring|consisting|comprising|having|for\s+(?:a|the|residential|commercial|use|office|business)\b|together|[.;]))/i,
    );
    const address = addressMatch ? cleanAddress(addressMatch[1]) : null;

    const sizeMatch = flat.match(
        /\b(\d[\d,.]*)\s*(sq\.?\s*(?:ft|feet|mtrs?|m|meters?|metres?|yds?|yards?)\.?|square\s+(?:feet|foot|metres?|meters?|yards?))/i,
    );
    const size = sizeMatch
        ? `${sizeMatch[1]} ${sizeMatch[2].replace(/\s+/g, " ").trim()}`
        : null;

    const usageMatch = flat.match(
        /\bfor\s+(?:the\s+)?(?:purpose\s+of\s+)?(residential|commercial|industrial|retail|office|business)\s+(?:purposes?|use|only)/i,
    );
    const usageTerm = usageMatch
        ? toTitleCase(usageMatch[1])
        : /\bresiden(ce|tial)\b/i.test(flat)
          ? "Residential"
          : /\bcommercial\b/i.test(flat)
            ? "Commercial"
            : null;

    const location = findState(address ?? "") ?? findState(flat);
    let country = location?.country ?? null;
    if (!country) {
        country = COUNTRIES.find((c) => c.pattern.test(flat))?.name ?? null;
    }
    if (!country && currency === "INR") country = "India";

    if (!type && !address && !size && !usageTerm) return null;

    return {
        type,
        country,
        state: location?.state ?? null,
        address,
        size,
        usageTerm,
    };
};

// ── Metadata ───────────────────────────────────────────────────

const extractGoverningLaw = (text: string): string | null => {
    const flat = flatten(text);
    const law = flat.match(
        /governed by (?:and construed in accordance with )?(?:the )?laws? (?:of|in force in) (?:the )?([A-Z][A-Za-z ,]{2,60}?)(?=[.;]| and\b| without\b)/,
    );
    if (law)
        return law[1]
            .replace(/,\s*$/, "")
            .replace(
                /^(?:the\s+)?(?:state|province|republic|commonwealth)\s+of\s+/i,
                "",
            )
            .trim();

    const court = flat.match(
        /\bcourts?\s+(?:at|in|of)\s+([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+)?)[^.]{0,40}?\bjurisdiction/,
    );
    if (court) return court[1].trim();

    const location = findState(flat);
    return location ? `${location.state}, ${location.country}` : null;
};

const extractAutoRenewal = (text: string): boolean | null => {
    if (
        /\b(automatic\w*\s+renew\w*|auto[- ]?renew\w*|renew\w*\s+automatically|deemed (to be )?renewed)\b/i.test(
            text,
        )
    )
        return true;
    if (/\brenew\w*\b/i.test(text)) return false;
    return null;
};

// ── Agreement type & title ─────────────────────────────────────

const detectAgreementType = (text: string): AgreementType => {
    const scores: [AgreementType, number][] = [
        [
            "SHORT_TERM_RENTAL",
            countMatches(
                text,
                /\b(short[- ]term|vacation|holiday|nightly|per night|check-?in|check-?out)\b/gi,
            ) * 2,
        ],
        [
            "OFFICE_RENTAL",
            countMatches(text, /\b(office|workspace|co-?working)\b/gi),
        ],
        [
            "SHOP_RENTAL",
            countMatches(text, /\b(shop|showroom|retail|store)\b/gi),
        ],
        [
            "HOUSE_RENTAL",
            countMatches(
                text,
                /\b(residential|residence|house|flat|apartment|dwelling|family)\b/gi,
            ),
        ],
    ];
    const [type, score] = scores.sort((a, b) => b[1] - a[1])[0];
    return score >= 2 ? type : "OTHERS";
};

const extractTitle = (text: string, type: AgreementType): string => {
    const lines = text
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
        .slice(0, 12);
    const titleLine = lines.find(
        (l) =>
            /\b(agreement|lease|deed|contract|licen[cs]e)\b/i.test(l) &&
            l.length <= 100 &&
            l.split(" ").length <= 12,
    );
    if (titleLine) {
        const cleaned = titleLine.replace(/[^A-Za-z0-9 &'\-]/g, " ");
        return toTitleCase(flatten(cleaned));
    }
    return getAgreementTypeDisplayLabel(type);
};

/**
 * Extracts structured data fields from agreement text.
 */
export const extractFields = (text: string): ExtractedFields => {
    const sentences = splitSentences(text);
    const currency = detectCurrency(text);
    const preferMDY = currency === "USD";
    const type = detectAgreementType(text);

    return {
        title: extractTitle(text, type),
        type,
        metadata: {
            ...extractTermDates(sentences, flatten(text), preferMDY),
            autoRenewal: extractAutoRenewal(text),
            governingLaw: extractGoverningLaw(text),
        },
        property: extractProperty(text, currency),
        payments: extractPayments(sentences, text),
        parties: extractParties(text),
    };
};
