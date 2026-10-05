import { RISK_LEVELS, RiskLevelType } from "@/constants";
import { AgreementPayments } from "./extract";
import { parseCount, splitSentences, truncate } from "./text";

export interface DetectedRisk {
    clause: string;
    reason: string;
    level: RiskLevelType;
}

interface RiskRule {
    pattern: RegExp;
    level: RiskLevelType | ((match: RegExpMatchArray) => RiskLevelType | null);
    reason: string | ((match: RegExpMatchArray) => string);
}

const LANDLORD = "(?:landlord|lessor|licensor|owner)";
const TENANT = "(?:tenant|lessee|licensee)";

/**
 * Risk rules: each flags a sentence that matches a genuinely unfavourable term.
 * Standard clauses (fixed rent dates, notice periods, usage restrictions) are
 * intentionally not flagged.
 */
const RULES: RiskRule[] = [
    {
        pattern: new RegExp(
            `\\b(evict\\w*|remove|dispossess\\w*|lock(?:ed)? out|throw out)\\b[^.]{0,100}\\bwithout\\s+(?:any\\s+)?(?:prior\\s+)?(notice|court|legal (?:process|proceedings)|recourse)`,
            "i",
        ),
        level: "CRITICAL",
        reason: "Allows removing the tenant without notice or legal process, bypassing basic eviction protections.",
    },
    {
        pattern: new RegExp(
            `\\b${LANDLORD}\\b[^.]{0,80}\\b(retain|seize|sell|dispose of|take possession of)\\b[^.]{0,80}\\b(belongings|goods|articles|furniture|possessions|property of the ${TENANT})`,
            "i",
        ),
        level: "CRITICAL",
        reason: "Lets the landlord seize or sell the tenant's personal belongings.",
    },
    {
        pattern: new RegExp(
            `\\b${LANDLORD}\\b[^.]{0,100}\\b(terminat\\w*|cancel\\w*|revoke\\w*|end)\\b[^.]{0,80}\\b(at any time|anytime|without (?:any )?(?:notice|reason|cause)|without assigning any reason|at (?:his|her|its|their) (?:sole )?discretion)`,
            "i",
        ),
        level: "HIGH",
        reason: "The landlord can end the agreement at any time or without a reason, leaving the tenant with little security.",
    },
    {
        pattern:
            /\b(enter|entry|access|inspect\w*)\b[^.]{0,100}\b(at any time|anytime|without (?:any )?(?:prior )?notice)/i,
        level: "HIGH",
        reason: "Permits entry into the property at any time or without prior notice, affecting the tenant's privacy.",
    },
    {
        pattern:
            /\b(deposit|security amount)\b[^.]{0,120}\b(forfeit\w*|non[- ]?refundable|not be refund\w*|shall not be returned)/i,
        level: "HIGH",
        reason: "Part or all of the deposit can be forfeited or is non-refundable.",
    },
    {
        pattern:
            /\b(disconnect\w*|cut off|stop|suspend\w*)\b[^.]{0,50}\b(electricity|water|gas|utilit\w*|power supply)/i,
        level: "HIGH",
        reason: "Allows essential utilities to be disconnected, which can be used as pressure on the tenant.",
    },
    {
        pattern: new RegExp(
            `\\b${TENANT}\\b[^.]{0,80}\\b(indemnif\\w*|hold harmless)\\b[^.]{0,120}\\b(all|any)\\b[^.]{0,30}\\b(loss\\w*|claims?|damages?|liabilit\\w*|costs?)`,
            "i",
        ),
        level: "HIGH",
        reason: "Broad, one-sided indemnity: the tenant may have to cover any and all claims or losses, with no cap.",
    },
    {
        pattern: new RegExp(
            `\\b${TENANT}\\b[^.]{0,80}\\b(all|any)\\s+(?:kinds? of\\s+)?(?:major\\s+)?(?:structural\\s+)?repairs?\\b`,
            "i",
        ),
        level: (m) => (/structural|major/i.test(m[0]) ? "HIGH" : "MEDIUM"),
        reason: (m) =>
            /structural|major/i.test(m[0])
                ? "Makes the tenant responsible for major or structural repairs, which normally fall on the landlord."
                : "Makes the tenant responsible for all repairs, not just minor day-to-day ones.",
    },
    {
        pattern:
            /\barbitrator\b[^.]{0,60}\b(appointed|nominated|chosen|selected)\s+(?:solely\s+|only\s+)?by\s+(?:the\s+)?(landlord|lessor|licensor|owner)/i,
        level: "HIGH",
        reason: "The landlord alone picks the arbitrator, so dispute resolution may not be neutral.",
    },
    {
        pattern:
            /\bwaive\w*\b[^.]{0,60}\b(rights?|claims?|remed(y|ies)|jury)\b/i,
        level: "HIGH",
        reason: "Asks the tenant to give up legal rights or remedies.",
    },
    {
        pattern:
            /\b(increase|escalat\w*|enhance\w*|revis\w*|hike)\b[^.]{0,80}\b(rent|licen[cs]e fee)\b[^.]{0,80}?(\d+(?:\.\d+)?)\s*(%|per\s*cent|percent)/i,
        level: (m) => {
            const pct = Number(m[3]);
            if (pct > 10) return "HIGH";
            if (pct > 5) return "MEDIUM";
            return null;
        },
        reason: (m) =>
            `Rent increases by ${m[3]}%, which is above the typical 5% annual escalation.`,
    },
    {
        pattern:
            /\b(rent|licen[cs]e fee)\b[^.]{0,80}\b(increase\w*|revis\w*|chang\w*)\b[^.]{0,60}\b(sole|absolute) discretion/i,
        level: "HIGH",
        reason: "The landlord can raise rent at their sole discretion, with no cap.",
    },
    {
        pattern:
            /\b(late|delay\w*|belated)\b[^.]{0,80}\b(fee|fine|penalt\w*|interest|charges?)\b/i,
        level: (m) =>
            /per day|each day|daily|\b(2[4-9]|[3-9]\d)\s*%/i.test(m.input ?? "")
                ? "HIGH"
                : "MEDIUM",
        reason: (m) =>
            /per day|each day|daily/i.test(m.input ?? "")
                ? "Charges a daily late penalty, which can add up quickly."
                : "Late payment attracts penalties or interest; check the amount is reasonable.",
    },
    {
        pattern: /\block[- ]?in\b/i,
        level: (m) =>
            // Clauses that only apply once the lock-in has ended are not a risk
            /\b(after|post|beyond|upon expiry of) the lock[- ]?in\b/i.test(
                m.input ?? "",
            )
                ? null
                : /forfeit|entire|remaining|balance|full/i.test(m.input ?? "")
                  ? "HIGH"
                  : "MEDIUM",
        reason: (m) =>
            /forfeit|entire|remaining|balance|full/i.test(m.input ?? "")
                ? "Leaving during the lock-in period means paying rent for the remaining period or losing the deposit."
                : "There is a lock-in period during which the tenant cannot leave without penalty.",
    },
    {
        pattern:
            /\b(automatic\w*\s+renew\w*|auto[- ]?renew\w*|renew\w*\s+automatically|deemed (?:to be )?renewed)\b/i,
        level: "MEDIUM",
        reason: "The agreement renews automatically; missing the opt-out window may lock the tenant in for another term.",
    },
    {
        pattern: new RegExp(
            `\\b${LANDLORD}\\b\\s+(?:shall|will)\\s+not\\s+be\\s+(?:held\\s+)?(?:liable|responsible)\\s+for\\s+(?:any|all)\\b`,
            "i",
        ),
        level: "MEDIUM",
        reason: "The landlord excludes liability for any loss or damage, even where they may be at fault.",
    },
    {
        pattern: /\b(sole|absolute)\s+(and\s+absolute\s+)?discretion\b/i,
        level: "MEDIUM",
        reason: "Gives one party unchecked discretion over a decision that affects the tenant.",
    },
    {
        pattern:
            /\b(brokerage|commission)\b[^.]{0,80}\b(non[- ]?refundable|not refundable|payable by the (tenant|lessee|licensee))/i,
        level: "LOW",
        reason: "Brokerage or commission is payable by the tenant and not refundable.",
    },
];

const NOTICE =
    /\b([a-z]+|\d+)\s*(?:\((\d+)\)\s*)?(days?|weeks?|months?)['’]?\s*(?:prior\s+|advance\s+)?(?:written\s+)?notice\b/i;

/**
 * Flags unusually short notice periods.
 */
const checkNoticePeriod = (sentence: string): DetectedRisk | null => {
    const m = sentence.match(NOTICE);
    if (!m) return null;
    const count = parseCount(m[2] ?? m[1]);
    if (!count) return null;
    const days = /week/i.test(m[3])
        ? count * 7
        : /month/i.test(m[3])
          ? count * 30
          : count;

    if (days < 15) {
        return {
            clause: sentence,
            level: "HIGH",
            reason: `Only ${days} day${days === 1 ? "" : "s"} of notice is required, which gives very little time to arrange alternatives.`,
        };
    }
    if (days < 30) {
        return {
            clause: sentence,
            level: "MEDIUM",
            reason: `A ${days}-day notice period is shorter than the usual 30 days.`,
        };
    }
    return null;
};

const LEVEL_RANK: Record<RiskLevelType, number> = Object.fromEntries(
    RISK_LEVELS.map((level, i) => [level, i]),
) as Record<RiskLevelType, number>;

/**
 * Scans agreement sentences against the risk rule set.
 */
export const detectRisks = (
    text: string,
    payments: AgreementPayments | null,
): DetectedRisk[] => {
    const risks = new Map<string, DetectedRisk>();

    const consider = (risk: DetectedRisk) => {
        const key = risk.clause.toLowerCase();
        const existing = risks.get(key);
        if (!existing || LEVEL_RANK[risk.level] > LEVEL_RANK[existing.level]) {
            risks.set(key, risk);
        }
    };

    for (const raw of splitSentences(text)) {
        if (raw.length < 25) continue;
        const sentence = truncate(raw, 600);

        for (const rule of RULES) {
            const match = raw.match(rule.pattern);
            if (!match) continue;
            const level =
                typeof rule.level === "function"
                    ? rule.level(match)
                    : rule.level;
            if (!level) continue;
            const reason =
                typeof rule.reason === "function"
                    ? rule.reason(match)
                    : rule.reason;
            consider({ clause: sentence, level, reason });
        }

        const notice = checkNoticePeriod(sentence);
        if (notice) consider(notice);
    }

    // Deposit much larger than rent
    if (payments?.rentAmount && payments.depositAmount) {
        const months = payments.depositAmount / payments.rentAmount;
        if (payments.rentCycle === "Monthly" && months > 6) {
            consider({
                clause: `Deposit of ${payments.depositAmount} against a monthly rent of ${payments.rentAmount}.`,
                level: months > 10 ? "HIGH" : "MEDIUM",
                reason: `The deposit equals about ${Math.round(months)} months of rent, which is higher than usual and ties up a lot of money.`,
            });
        }
    }

    return [...risks.values()]
        .sort((a, b) => LEVEL_RANK[b.level] - LEVEL_RANK[a.level])
        .slice(0, 20);
};
