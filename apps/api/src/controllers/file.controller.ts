import { SUPPORTED_MIME_TYPES } from "@/constants";
import * as AnalysisService from "@/services/analysis.service";
import * as FileService from "@/services/file.service";
import { logger } from "@/utils/logger.util";
import { Request, Response } from "express";

/**
 * Upload a file; the raw request body is stored in the database
 */
export const uploadFile = async (req: Request, res: Response) => {
    try {
        const { userId } = req.user;
        const { fileName } = req.query as { fileName: string };
        const mimeType = req.headers["content-type"]?.split(";")[0] ?? "";

        if (!fileName) {
            return res.status(400).json({ error: "Filename is required" });
        }

        if (!SUPPORTED_MIME_TYPES.hasOwnProperty(mimeType)) {
            return res
                .status(400)
                .json({ error: `Unsupported file type: ${mimeType}` });
        }

        const data = req.body;
        if (!Buffer.isBuffer(data) || data.length === 0) {
            return res.status(400).json({ error: "File content is empty" });
        }

        // Verify PDF magic bytes rather than trusting the header
        if (data.subarray(0, 5).toString() !== "%PDF-") {
            return res.status(400).json({ error: "File is not a valid PDF" });
        }

        const { fileId } = await FileService.uploadFile(
            userId,
            fileName.slice(0, 255),
            mimeType,
            data,
        );

        return res.status(201).json({ fileId });
    } catch (error: any) {
        logger.error(error.message);
        return res.status(500).json({ error: "Internal server error" });
    }
};

/**
 * Download a stored file
 */
export const downloadFile = async (req: Request, res: Response) => {
    try {
        const { userId } = req.user;
        const { fileId } = req.query as { fileId: string };

        if (!fileId) {
            return res.status(400).json({ error: "File ID is required" });
        }

        const file = await FileService.fetchFileContent(userId, fileId);
        if (!file) {
            return res.status(404).json({ error: "File not found" });
        }

        res.setHeader("Content-Type", file.mimeType);
        res.setHeader(
            "Content-Disposition",
            `attachment; filename="${encodeURIComponent(file.fileName)}"`,
        );
        return res.status(200).send(file.data);
    } catch (error: any) {
        logger.error(error.message);
        return res.status(500).json({ error: "Internal server error" });
    }
};

/**
 * Process uploaded file
 */
export const processFile = async (req: Request, res: Response) => {
    try {
        const { userId } = req.user;
        const { fileId } = req.body as { fileId: string };

        if (!fileId) {
            return res.status(400).json({ error: "File ID is required" });
        }

        const { success, agreementId, error } =
            await AnalysisService.processFile(userId, fileId);

        if (!success) {
            return res.status(400).json({ error });
        }

        return res.status(200).json({ success, agreementId });
    } catch (error: any) {
        logger.error(error.message);
        return res.status(500).json({ error: "Internal server error" });
    }
};

/**
 * Get all user uploaded files
 */
export const getUserFiles = async (req: Request, res: Response) => {
    try {
        const { userId } = req.user;
        const { files } = await FileService.fetchFilesByUser(userId);

        return res.status(200).json({
            files,
        });
    } catch (error: any) {
        logger.error(error.message);
        return res.status(500).json({ error: "Internal server error" });
    }
};
