import { answerQuestion, analyzeAgreementText, queryTerms } from "@/nlp";
import * as AgreementsService from "@/services/agreements.service";
import * as ChatService from "@/services/chat.service";
import * as FileService from "@/services/file.service";
import { logger } from "@/utils/logger.util";
import { parsePDF } from "@/utils/pdf.util";

/**
 * Reads the stored file from the database, runs the NLP pipeline and saves
 * the results. Runs inline within the request; no queues or workers.
 */
export const analyzeAgreement = async (
    agreementId: string,
    userId: string,
): Promise<{ success: boolean; error?: string }> => {
    const serviceLogger = logger.child({
        service: "analysis.service",
        agreementId,
        userId,
    });

    const agreement = await AgreementsService.fetchAgreement(
        agreementId,
        userId,
    );
    if (!agreement) {
        return { success: false, error: "Agreement not found" };
    }

    const fail = async (error: string) => {
        await AgreementsService.updateAgreementStatus(
            agreementId,
            "FAILED",
            error,
            userId,
        );
        return { success: false, error };
    };

    try {
        await AgreementsService.updateAgreementStatus(
            agreementId,
            "PROCESSING",
            null,
            userId,
        );

        const file = await FileService.fetchFileContent(
            userId,
            agreement.fileId,
        );
        if (!file) return await fail("File not found");

        const { text } = await parsePDF(agreementId, file.data);
        if (!text.trim()) {
            return await fail("No readable text found in the document");
        }

        const result = analyzeAgreementText(text);
        if ("error" in result) return await fail(result.error);

        await AgreementsService.saveAgreementAnalysis(
            agreementId,
            userId,
            result.analysis,
        );

        serviceLogger.info(
            {
                sections: result.analysis.sections.length,
                risks: result.analysis.risks.length,
            },
            "Agreement analysis completed",
        );
        return { success: true };
    } catch (error: any) {
        serviceLogger.error(error.message, "Agreement analysis failed");
        return await fail("Failed to analyze the document");
    }
};

/**
 * Creates an agreement for an uploaded file and analyzes it.
 */
export const processFile = async (userId: string, fileId: string) => {
    if (!(await FileService.fileExists(userId, fileId))) {
        return { success: false, error: "File not found" };
    }

    if (await AgreementsService.isFileProcessed(fileId, userId)) {
        return { success: false, error: "File is already processed" };
    }

    const agreementId = await AgreementsService.createAgreement(
        userId,
        fileId,
    );
    const { error } = await analyzeAgreement(agreementId, userId);

    // The agreement exists either way; a failed analysis is shown on it
    return { success: true, agreementId, error };
};

/**
 * Re-runs analysis for an existing agreement.
 */
export const reprocessAgreement = async (
    agreementId: string,
    userId: string,
) => {
    const agreement = await AgreementsService.fetchAgreement(
        agreementId,
        userId,
    );
    if (!agreement) throw new Error("Agreement not found");

    return await analyzeAgreement(agreementId, userId);
};

/**
 * Answers a chat question about an agreement and stores both messages.
 */
export const processAgreementQuery = async (
    agreementId: string,
    userId: string,
    chatId: string,
    query: string,
) => {
    if (query.length == 0) {
        return { error: "Query cannot be empty" };
    }

    if (!agreementId || !chatId || !userId) {
        throw new Error("Agreement ID, Chat ID and User ID are required.");
    }

    const agreement = await AgreementsService.fetchAgreement(
        agreementId,
        userId,
    );
    if (!agreement) {
        return { error: "Agreement not found" };
    }

    if (agreement.status !== "SUCCESS") {
        return { error: "Agreement is not processed yet" };
    }

    const chat = await ChatService.fetchChatById(chatId, userId, agreementId);
    if (!chat) {
        return { error: "Chat not found" };
    }

    const userMessage = await ChatService.insertChatMessage(
        chatId,
        userId,
        agreementId,
        { role: "user", content: query },
    );

    const [risks, sections] = await Promise.all([
        AgreementsService.fetchRisksByAgreement(agreementId, userId),
        AgreementsService.searchSections(
            agreementId,
            userId,
            queryTerms(query),
        ),
    ]);

    const answer = answerQuestion(query, {
        agreement: agreement as any,
        risks,
        sections,
    });

    const assistantMessage = await ChatService.insertChatMessage(
        chatId,
        userId,
        agreementId,
        { role: "assistant", content: answer },
    );

    return { chatId, userMessage, assistantMessage };
};
