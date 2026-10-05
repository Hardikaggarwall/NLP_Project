import { AgreementStatus } from "@/constants";
import { Agreements } from "@/db/schema/agreements";
import { Risks } from "@/db/schema/risks";
import { Sections } from "@/db/schema/sections";
import { databaseAvailable, db } from "@/infra/db.client";
import type { AgreementAnalysis } from "@/nlp";
import * as MemoryStore from "@/services/memory.store";
import { and, desc, eq, sql } from "drizzle-orm";

/**
 * Ensures the existence of an agreement for a specific user.
 */
export const ensureAgreementExists = async (
    agreementId: string,
    userId: string,
) => {
    if (MemoryStore.hasMemoryAgreement(agreementId)) {
        if (!MemoryStore.getMemoryAgreementRecord(agreementId, userId)) {
            throw new Error("Unauthorized access");
        }
        return true;
    }
    if (!databaseAvailable) throw new Error("Agreement not found");

    const [agreement] = await db
        .select({ userId: Agreements.user_id })
        .from(Agreements)
        .where(eq(Agreements.id, agreementId));

    if (!agreement) throw new Error("Agreement not found");
    if (agreement.userId !== userId) throw new Error("Unauthorized access");

    return true;
};

/**
 * Fetch agreement details
 */
export const fetchAgreement = async (agreementId: string, userId: string) => {
    const memoryAgreement = MemoryStore.getMemoryAgreement(agreementId, userId);
    if (memoryAgreement) return memoryAgreement;
    if (!databaseAvailable) return null;

    const [agreement] = await db
        .select({
            id: Agreements.id,
            title: Agreements.title,
            type: Agreements.type,
            metadata: Agreements.metadata,
            property: Agreements.property,
            payments: Agreements.payments,
            parties: Agreements.parties,
            summary: Agreements.summary,
            status: Agreements.status,
            error: Agreements.error,
            userId: Agreements.user_id,
            fileId: Agreements.file_id,
            createdAt: Agreements.created_at,
            updatedAt: Agreements.updated_at,
        })
        .from(Agreements)
        .where(
            and(eq(Agreements.id, agreementId), eq(Agreements.user_id, userId)),
        );

    return agreement ?? null;
};

/**
 * Fetch all agreements for a user
 */
export const fetchAgreementsByUser = async (userId: string) => {
    const memoryAgreements = MemoryStore.listMemoryAgreements(userId);
    if (!databaseAvailable) return memoryAgreements;

    const agreements = await db
        .select({
            id: Agreements.id,
            type: Agreements.type,
            title: Agreements.title,
            status: Agreements.status,
            updatedAt: Agreements.updated_at,
            createdAt: Agreements.created_at,
        })
        .from(Agreements)
        .where(eq(Agreements.user_id, userId))
        .orderBy(desc(Agreements.created_at));
    const agreementIds = new Set(agreements.map((agreement) => agreement.id));
    return [
        ...agreements,
        ...memoryAgreements.filter((agreement) => !agreementIds.has(agreement.id)),
    ];
};

/**
 * Check if file is processed
 */
export const isFileProcessed = async (fileId: string, userId: string) => {
    if (MemoryStore.hasMemoryFile(fileId)) {
        return MemoryStore.isMemoryFileProcessed(userId, fileId);
    }
    if (!databaseAvailable) return false;

    const [agreement] = await db
        .select({ id: Agreements.id })
        .from(Agreements)
        .where(
            and(eq(Agreements.user_id, userId), eq(Agreements.file_id, fileId)),
        );

    return Boolean(agreement);
};

/**
 * Inserts a new agreement record into the database.
 */
export const createAgreement = async (
    userId: string,
    fileId: string,
): Promise<string> => {
    if (!databaseAvailable || MemoryStore.hasMemoryFile(fileId)) {
        return MemoryStore.createMemoryAgreement(userId, fileId);
    }

    const [agreement] = await db
        .insert(Agreements)
        .values({
            user_id: userId,
            file_id: fileId,
        })
        .returning({ id: Agreements.id });

    if (!agreement) {
        throw new Error("Failed to create agreement.");
    }

    return agreement.id;
};

/**
 * Updates an agreement's status
 */
export const updateAgreementStatus = async (
    agreementId: string,
    status: AgreementStatus,
    error: string | null,
    userId: string,
): Promise<void> => {
    if (MemoryStore.hasMemoryAgreement(agreementId)) {
        MemoryStore.setMemoryAgreementStatus(agreementId, userId, status, error);
        return;
    }
    if (!databaseAvailable) throw new Error("Agreement not found");

    await db
        .update(Agreements)
        .set({
            status,
            error: error ?? null,
        })
        .where(
            and(eq(Agreements.id, agreementId), eq(Agreements.user_id, userId)),
        );
};

/**
 * Atomically replaces all analysis output (fields, sections, risks) and marks
 * the agreement as SUCCESS.
 */
export const saveAgreementAnalysis = async (
    agreementId: string,
    userId: string,
    analysis: AgreementAnalysis,
): Promise<void> => {
    if (MemoryStore.hasMemoryAgreement(agreementId)) {
        MemoryStore.setMemoryAgreementAnalysis(agreementId, userId, analysis);
        return;
    }
    if (!databaseAvailable) throw new Error("Agreement not found");

    await db.transaction(async (tx) => {
        await tx.delete(Sections).where(eq(Sections.agreement_id, agreementId));
        await tx.delete(Risks).where(eq(Risks.agreement_id, agreementId));

        await tx
            .update(Agreements)
            .set({
                title: analysis.title,
                type: analysis.type,
                metadata: analysis.metadata,
                property: analysis.property,
                payments: analysis.payments,
                parties: analysis.parties,
                summary: analysis.summary,
                status: "SUCCESS",
                error: null,
            })
            .where(
                and(
                    eq(Agreements.id, agreementId),
                    eq(Agreements.user_id, userId),
                ),
            );

        if (analysis.sections.length > 0) {
            await tx.insert(Sections).values(
                analysis.sections.map((sec) => ({
                    agreement_id: agreementId,
                    ref: sec.ref,
                    heading: sec.heading.slice(0, 255),
                    type: sec.type,
                    content: sec.content,
                })),
            );
        }

        if (analysis.risks.length > 0) {
            await tx.insert(Risks).values(
                analysis.risks.map((risk) => ({
                    agreement_id: agreementId,
                    clause: risk.clause,
                    reason: risk.reason,
                    level: risk.level,
                })),
            );
        }
    });
};

/**
 * Full-text search over an agreement's sections (Postgres tsvector ranking).
 * Terms are OR-ed so partial matches still rank.
 */
export const searchSections = async (
    agreementId: string,
    userId: string,
    terms: string[],
    limit: number = 4,
) => {
    if (MemoryStore.hasMemoryAgreement(agreementId)) {
        const termsLower = terms.map((term) => term.toLowerCase());
        return MemoryStore.getMemorySections(agreementId, userId)
            .filter((section) => {
                const searchable = `${section.heading} ${section.content}`.toLowerCase();
                return termsLower.some((term) => searchable.includes(term));
            })
            .slice(0, limit);
    }
    if (!databaseAvailable) return [];

    await ensureAgreementExists(agreementId, userId);

    const safeTerms = terms
        .map((t) => t.replace(/[^a-z0-9]/gi, ""))
        .filter(Boolean);
    if (safeTerms.length === 0) return [];

    const document = sql`to_tsvector('english', ${Sections.heading} || ' ' || ${Sections.content})`;
    const query = sql`to_tsquery('english', ${safeTerms.join(" | ")})`;
    const rank = sql<number>`ts_rank_cd(${document}, ${query})`;

    return await db
        .select({
            id: Sections.id,
            ref: Sections.ref,
            heading: Sections.heading,
            content: Sections.content,
            rank,
        })
        .from(Sections)
        .where(
            and(
                eq(Sections.agreement_id, agreementId),
                sql`${document} @@ ${query}`,
            ),
        )
        .orderBy((t) => desc(t.rank))
        .limit(limit);
};

/**
 * Fetch agreement risks if exists.
 */
export const fetchRisksByAgreement = async (
    agreementId: string,
    userId: string,
) => {
    if (MemoryStore.hasMemoryAgreement(agreementId)) {
        return MemoryStore.getMemoryRisks(agreementId, userId);
    }
    if (!databaseAvailable) return [];

    await ensureAgreementExists(agreementId, userId);

    const risks = await db
        .select({
            id: Risks.id,
            clause: Risks.clause,
            reason: Risks.reason,
            level: Risks.level,
        })
        .from(Risks)
        .where(eq(Risks.agreement_id, agreementId));

    return risks;
};
