// src/services/file.service.ts
import { Files } from "@/db/schema/files";
import { databaseAvailable, db } from "@/infra/db.client";
import * as MemoryStore from "@/services/memory.store";
import { and, desc, eq } from "drizzle-orm";

/**
 * Stores an uploaded file's content in the database.
 */
export const uploadFile = async (
    userId: string,
    fileName: string,
    mimeType: string,
    data: Buffer,
) => {
    if (!databaseAvailable) {
        return MemoryStore.createMemoryFile(userId, fileName, mimeType, data);
    }

    const [file] = await db
        .insert(Files)
        .values({
            user_id: userId,
            file_name: fileName,
            mime_type: mimeType,
            size: data.length,
            data,
            status: "UPLOADED",
        })
        .returning({ id: Files.id });

    return { fileId: file.id };
};

/**
 * Fetches a file's metadata and binary content (ownership checked).
 */
export const fetchFileContent = async (userId: string, fileId: string) => {
    const memoryFile = MemoryStore.getMemoryFile(userId, fileId);
    if (memoryFile) {
        return {
            id: memoryFile.id,
            fileName: memoryFile.fileName,
            mimeType: memoryFile.mimeType,
            data: memoryFile.data,
        };
    }
    if (!databaseAvailable) return null;

    const [file] = await db
        .select({
            id: Files.id,
            fileName: Files.file_name,
            mimeType: Files.mime_type,
            data: Files.data,
        })
        .from(Files)
        .where(and(eq(Files.id, fileId), eq(Files.user_id, userId)));

    return file ?? null;
};

/**
 * Checks that a file exists and belongs to the user.
 */
export const fileExists = async (userId: string, fileId: string) => {
    if (MemoryStore.getMemoryFile(userId, fileId)) return true;
    if (!databaseAvailable) return false;

    const [file] = await db
        .select({ id: Files.id })
        .from(Files)
        .where(and(eq(Files.id, fileId), eq(Files.user_id, userId)));

    return Boolean(file);
};

/**
 * Fetch files by user ID
 */
export const fetchFilesByUser = async (userId: string) => {
    if (!databaseAvailable) {
        return { success: true, files: MemoryStore.listMemoryFiles(userId) };
    }

    const files = await db
        .select({
            id: Files.id,
            fileName: Files.file_name,
            mimeType: Files.mime_type,
            size: Files.size,
            status: Files.status,
            createdAt: Files.created_at,
        })
        .from(Files)
        .where(and(eq(Files.user_id, userId), eq(Files.status, "UPLOADED")))
        .orderBy(desc(Files.created_at));

    const memoryFiles = MemoryStore.listMemoryFiles(userId);
    const fileIds = new Set(files.map((file) => file.id));
    return {
        success: true,
        files: [...files, ...memoryFiles.filter((file) => !fileIds.has(file.id))],
    };
};
