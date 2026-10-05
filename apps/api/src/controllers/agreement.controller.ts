import * as AgreementService from "@/services/agreements.service";
import * as ChatService from "@/services/chat.service";
import * as AnalysisService from "@/services/analysis.service";
import { logger } from "@/utils/logger.util";
import { Request, Response } from "express";

/**
 * Get user agreements with cursor-based pagination on created_at timestamp
 */
export const getUserAgreements = async (req: Request, res: Response) => {
    try {
        const { userId } = req.user;

        const agreements = await AgreementService.fetchAgreementsByUser(userId);

        return res.status(200).json({
            agreements,
        });
    } catch (error: any) {
        logger.error(error.message);
        return res.status(500).json({ error: "Internal server error" });
    }
};

/**
 * Get agreement details with sections
 */
export const getAgreementDetails = async (req: Request, res: Response) => {
    try {
        const { userId } = req.user;
        const { id } = req.query as { id: string };
        if (!id) {
            return res.status(400).json({ error: "Agreement ID is required" });
        }

        const agreement = await AgreementService.fetchAgreement(id, userId);
        if (!agreement) {
            return res.status(404).json({ error: "Agreement not found" });
        }

        const [risks, chatId] = await Promise.all([
            AgreementService.fetchRisksByAgreement(id, userId),
            ChatService.fetchChatByAgreement(id, userId),
        ]);

        return res.status(200).json({
            agreement,
            risks,
            chatId,
        });
    } catch (error: any) {
        logger.error(error.message);
        return res.status(500).json({ error: "Internal server error" });
    }
};

/**
 * Force trigger agreement processing
 */
export const processAgreement = async (req: Request, res: Response) => {
    try {
        const { userId } = req.user;
        const { id } = req.body;
        if (!id) {
            return res.status(400).json({ error: "Agreement ID is required" });
        }

        const { success, error } = await AnalysisService.reprocessAgreement(
            id,
            userId,
        );

        if (!success) {
            return res.status(400).json({ error });
        }

        return res.status(200).json({
            message: "Agreement processed successfully",
        });
    } catch (error: any) {
        logger.error(error.message);
        return res.status(500).json({ error: "Internal server error" });
    }
};

/**
 * Answer a question about an agreement (synchronous)
 */
export const sendAgreementQuery = async (req: Request, res: Response) => {
    try {
        const { userId } = req.user;
        const { agreementId, message, chatId } = req.body;

        if (!agreementId || !message) {
            return res
                .status(400)
                .json({ error: "Required arguments are missing" });
        }

        const messageLen = message.trim().length;
        if (messageLen === 0) {
            return res.status(400).json({ error: "Message cannot be empty" });
        }
        if (messageLen > 5000) {
            return res.status(400).json({ error: "Message is too long" });
        }

        const { userMessage, assistantMessage, error } =
            await AnalysisService.processAgreementQuery(
                agreementId,
                userId,
                chatId,
                message.trim(),
            );

        if (error) {
            return res.status(400).json({ error });
        }

        return res.status(200).json({
            userMessage,
            assistantMessage,
        });
    } catch (error: any) {
        logger.error(error.message);
        return res.status(500).json({ error: "Internal server error" });
    }
};

/**
 * Get chat messages for an agreement
 */
export const getChatMessages = async (req: Request, res: Response) => {
    try {
        const { userId } = req.user;
        const { chatId, agreementId, cursor } = req.query as {
            chatId: string;
            agreementId: string;
            cursor?: string;
        };

        if (!chatId || !agreementId) {
            return res
                .status(400)
                .json({ error: "Required arguments are missing" });
        }

        const { messages, nextCursor } = await ChatService.fetchChatMessages(
            chatId,
            userId,
            agreementId,
            10,
            cursor,
        );

        return res
            .status(200)
            .json({ messages: messages.reverse(), nextCursor });
    } catch (error: any) {
        logger.error(error.message);
        return res.status(500).json({ error: "Internal server error" });
    }
};
