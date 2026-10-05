import { describe, expect, it, vi } from "vitest";

// The NLP module only needs the constants; avoid loading env config
vi.mock("@/config/env.config", () => ({ env: {} }));

import { analyzeAgreementText, answerQuestion } from "../src/nlp";

const INDIAN_AGREEMENT = `
RENTAL AGREEMENT

This Rental Agreement is made and executed on this 1st day of January, 2024 at New Delhi, by and between Mr. Rajesh Kumar, S/o Late Shri Mohan Lal, residing at 45, Lajpat Nagar, New Delhi - 110024 (hereinafter called the LANDLORD) of the ONE PART and Ms. Priya Sharma, D/o Shri Anil Sharma, residing at 12, MG Road, Jaipur, Rajasthan (hereinafter called the TENANT) of the OTHER PART.

WHEREAS the Landlord is the owner of the residential flat situated at Flat No. 204, Green Park Apartments, Saket, New Delhi - 110017 measuring 950 sq ft, and the Tenant has agreed to take the said premises on rent for residential purposes only.

NOW THIS AGREEMENT WITNESSETH AS UNDER:

1. TERM: The tenancy shall be for a period of eleven (11) months commencing from 1st January 2024.

2. RENT: The Tenant shall pay a monthly rent of Rs. 25,000/- (Rupees Twenty Five Thousand only) per month on or before the 5th day of each month.

3. SECURITY DEPOSIT: The Tenant has paid an interest-free security deposit of Rs. 1,00,000/- which shall be refunded at the time of vacating the premises after deducting any dues.

4. LATE PAYMENT: In case of delay in payment of rent, a late fee of Rs. 500 per day shall be charged to the Tenant.

5. MAINTENANCE: The Tenant shall pay the society maintenance charges and keep the premises clean and in good condition.

6. REPAIRS: The Tenant shall be responsible for all structural repairs of the premises during the tenancy.

7. UTILITIES: The Tenant shall pay the electricity and water bills as per the meter readings directly to the concerned authorities.

8. TERMINATION: The Landlord may terminate this agreement at any time without assigning any reason. The Tenant may vacate the premises by giving 7 days notice in writing.

9. INSPECTION: The Landlord or his agent may enter the premises at any time for inspection.

10. RENEWAL: This agreement shall be renewed automatically for a further period of eleven months unless terminated.

11. JURISDICTION: This agreement shall be governed by the laws of India and the courts at New Delhi shall have exclusive jurisdiction.
`;

describe("nlp.analyzeAgreementText", () => {
    const result = analyzeAgreementText(INDIAN_AGREEMENT);
    if ("error" in result) throw new Error(result.error);
    const analysis = result.analysis;

    it("extracts core fields", () => {
        expect(analysis.title).toBe("Rental Agreement");
        expect(analysis.type).toBe("HOUSE_RENTAL");
        expect(analysis.payments?.rentAmount).toBe(25000);
        expect(analysis.payments?.depositAmount).toBe(100000);
        expect(analysis.payments?.depositType).toBe("SECURITY_DEPOSIT");
        expect(analysis.payments?.currency).toBe("INR");
        expect(analysis.payments?.rentCycle).toBe("Monthly");
    });

    it("extracts dates and metadata", () => {
        expect(analysis.metadata.effectiveDate).toBe("2024-01-01");
        expect(analysis.metadata.expiryDate).toBe("2024-11-30");
        expect(analysis.metadata.autoRenewal).toBe(true);
        expect(analysis.metadata.governingLaw).toBe("India");
    });

    it("extracts parties and property", () => {
        expect(analysis.parties).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    name: "Mr. Rajesh Kumar",
                    role: "LANDLORD",
                }),
                expect.objectContaining({
                    name: "Ms. Priya Sharma",
                    role: "TENANT",
                }),
            ]),
        );
        expect(analysis.property?.type).toBe("Flat");
        expect(analysis.property?.address).toBe(
            "Flat No. 204, Green Park Apartments, Saket, New Delhi - 110017",
        );
        expect(analysis.property?.state).toBe("Delhi");
        expect(analysis.property?.size).toBe("950 sq ft");
        expect(analysis.property?.usageTerm).toBe("Residential");
        expect(analysis.property?.country).toBe("India");
    });

    it("splits and classifies sections", () => {
        const byRef = Object.fromEntries(
            analysis.sections.map((s) => [s.ref, s]),
        );
        expect(byRef["2"].type).toBe("RENT_PAYMENT");
        expect(byRef["3"].type).toBe("DEPOSIT");
        expect(byRef["8"].type).toBe("TERMINATION");
        expect(byRef["11"].type).toBe("DISPUTE_RESOLUTION");
        expect(byRef["2"].heading).toBe("Rent");
    });

    it("flags genuine risks only", () => {
        const levels = analysis.risks.map((r) => r.level);
        expect(levels).toContain("HIGH");
        const reasons = analysis.risks.map((r) => r.reason).join(" ");
        expect(reasons).toMatch(/at any time or without a reason/);
        expect(reasons).toMatch(/7 days of notice/);
        expect(reasons).toMatch(/daily late penalty/);
        expect(reasons).toMatch(/structural repairs/);
        expect(reasons).toMatch(/renews automatically/);
        // The standard monthly rent clause must not be flagged
        expect(analysis.risks.some((r) => r.clause.startsWith("RENT:"))).toBe(
            false,
        );
    });

    it("builds a plain-English summary", () => {
        expect(analysis.summary.length).toBeGreaterThanOrEqual(3);
        expect(analysis.summary.join(" ")).toMatch(/Rent is INR 25,000/);
        expect(analysis.summary.every((p) => p.length <= 240)).toBe(true);
    });

    it("answers questions from fields and clauses", () => {
        const ctx = {
            agreement: analysis,
            risks: analysis.risks,
            sections: analysis.sections,
        };
        expect(answerQuestion("How much is the rent?", ctx)).toMatch(
            /INR 25,000/,
        );
        const deposit = answerQuestion("How much is the deposit?", ctx);
        expect(deposit).toMatch(/security deposit is INR 100,000/);
        expect(deposit).not.toMatch(/The rent is/);
        expect(answerQuestion("When does it expire?", ctx)).toMatch(
            /30 Nov 2024/,
        );
        const electricity = answerQuestion(
            "Who pays the electricity bill?",
            ctx,
        );
        expect(electricity).toMatch(/electricity and water bills/);
        expect(electricity).not.toMatch(/The parties are/);
    });
});

describe("nlp edge cases", () => {
    const analyze = (text: string) => {
        const result = analyzeAgreementText(text);
        if ("error" in result) throw new Error(result.error);
        return result.analysis;
    };

    it("reads rent paid 'per month in advance'", () => {
        const analysis = analyze(
            INDIAN_AGREEMENT.replace(
                "per month on or before",
                "per month in advance on or before",
            ),
        );
        expect(analysis.payments?.rentAmount).toBe(25000);
    });

    it("ignores signature-block repeats and page footers", () => {
        const analysis = analyze(
            INDIAN_AGREEMENT +
                "\nPage 1 of 2\nLANDLORD: Mr. Rajesh Kumar            TENANT: Ms. Priya Sharma\n",
        );
        expect(analysis.parties?.map((p) => p.name)).toEqual([
            "Mr. Rajesh Kumar",
            "Ms. Priya Sharma",
        ]);
        const allText = analysis.sections.map((s) => s.content).join(" ");
        expect(allText).not.toMatch(/Page 1 of 2/);
    });

    it("does not flag clauses that apply after the lock-in", () => {
        const analysis = analyze(
            INDIAN_AGREEMENT.replace(
                "The Tenant may vacate the premises by giving 7 days notice in writing.",
                "After the lock-in period, either party may terminate by giving one month written notice.",
            ),
        );
        expect(
            analysis.risks.some((r) => /After the lock-in/.test(r.clause)),
        ).toBe(false);
    });
});

describe("nlp validity check", () => {
    it("rejects non-rental documents", () => {
        const result = analyzeAgreementText(
            "Quarterly sales report. Revenue grew 12% year over year across all regions. ".repeat(
                10,
            ),
        );
        expect(result).toEqual({
            error: "File is not a valid rental agreement",
        });
    });
});

const US_LEASE = `RESIDENTIAL LEASE AGREEMENT

This Lease Agreement is entered into on March 15, 2025 between John Miller ("Landlord") and Sarah Connor ("Tenant").

Property
The Landlord agrees to lease to the Tenant the house located at 742 Evergreen Terrace, Springfield, Oregon 97403 for residential use only.

Lease Term
The lease term begins on 04/01/2025 and ends on 03/31/2026.

Rent
Tenant shall pay rent of $2,400 per month, due on the first day of each month. A late charge of 10% will apply to payments received after the 5th.

Security Deposit
Upon signing, Tenant shall pay a security deposit of $4,800. The deposit is non-refundable if Tenant terminates the lease early.

Entry
Landlord may enter the premises with 24 hours notice for inspection or repairs.

Liability
Tenant agrees to indemnify and hold harmless the Landlord from any and all claims arising from Tenant's use of the premises.

Governing Law
This Lease shall be governed by the laws of the State of Oregon.`;

describe("nlp with US lease formatting", () => {
    const result = analyzeAgreementText(US_LEASE);
    if ("error" in result) throw new Error(result.error);
    const analysis = result.analysis;

    it("reads Title Case headings as sections", () => {
        const headings = analysis.sections.map((s) => s.heading);
        expect(headings).toEqual(
            expect.arrayContaining(["Rent", "Security Deposit", "Lease Term"]),
        );
        const rent = analysis.sections.find((s) => s.heading === "Rent");
        expect(rent?.type).toBe("RENT_PAYMENT");
        expect(rent?.content.startsWith("Tenant shall pay")).toBe(true);
    });

    it("parses US dates, parties and location", () => {
        expect(analysis.metadata.effectiveDate).toBe("2025-04-01");
        expect(analysis.metadata.expiryDate).toBe("2026-03-31");
        expect(analysis.metadata.governingLaw).toBe("Oregon");
        expect(analysis.parties?.map((p) => [p.name, p.role])).toEqual([
            ["John Miller", "LANDLORD"],
            ["Sarah Connor", "TENANT"],
        ]);
        expect(analysis.property?.address).toBe(
            "742 Evergreen Terrace, Springfield, Oregon 97403",
        );
        expect(analysis.property?.state).toBe("Oregon");
        expect(analysis.payments?.currency).toBe("USD");
    });

    it("does not flag a standard 24-hour entry notice", () => {
        expect(analysis.risks.some((r) => /24 hours/.test(r.clause))).toBe(
            false,
        );
        expect(analysis.risks.map((r) => r.level)).toContain("HIGH");
    });
});
