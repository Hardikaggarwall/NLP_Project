import { randomUUID } from "node:crypto";
import type { AgreementAnalysis } from "@/nlp";

interface MemoryFile {
    id: string;
    userId: string;
    fileName: string;
    mimeType: string;
    size: number;
    data: Buffer;
    status: "UPLOADED";
    createdAt: Date;
}

interface MemoryChatMessage {
    id: string;
    chatId: string;
    userId: string;
    agreementId: string;
    role: "user" | "assistant" | "system";
    content: string;
    createdAt: Date;
}

interface MemoryAgreement {
    id: string;
    userId: string;
    fileId: string;
    fileName: string;
    status: "PENDING" | "PROCESSING" | "SUCCESS" | "FAILED";
    error: string | null;
    createdAt: Date;
    updatedAt: Date;
    analysis: AgreementAnalysis | null;
    chatId: string | null;
    messages: MemoryChatMessage[];
}

const files = new Map<string, MemoryFile>();
const agreements = new Map<string, MemoryAgreement>();

export const createMemoryFile = (
    userId: string,
    fileName: string,
    mimeType: string,
    data: Buffer,
) => {
    const file: MemoryFile = {
        id: randomUUID(),
        userId,
        fileName,
        mimeType,
        size: data.length,
        data: Buffer.from(data),
        status: "UPLOADED",
        createdAt: new Date(),
    };
    files.set(file.id, file);
    return { fileId: file.id };
};

export const hasMemoryFile = (fileId: string) => files.has(fileId);

export const getMemoryFile = (userId: string, fileId: string) => {
    const file = files.get(fileId);
    if (!file || file.userId !== userId) return null;
    return file;
};

export const listMemoryFiles = (userId: string) =>
    [...files.values()]
        .filter((file) => file.userId === userId)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .map(({ id, fileName, mimeType, size, status, createdAt }) => ({
            id,
            fileName,
            mimeType,
            size,
            status,
            createdAt,
        }));

export const isMemoryFileProcessed = (userId: string, fileId: string) =>
    [...agreements.values()].some(
        (agreement) =>
            agreement.userId === userId && agreement.fileId === fileId,
    );

export const createMemoryAgreement = (userId: string, fileId: string) => {
    const file = getMemoryFile(userId, fileId);
    if (!file) throw new Error("File not found");

    const now = new Date();
    const agreement: MemoryAgreement = {
        id: randomUUID(),
        userId,
        fileId,
        fileName: file.fileName,
        status: "PENDING",
        error: null,
        createdAt: now,
        updatedAt: now,
        analysis: null,
        chatId: null,
        messages: [],
    };
    agreements.set(agreement.id, agreement);
    return agreement.id;
};

export const hasMemoryAgreement = (agreementId: string) =>
    agreements.has(agreementId);

export const getMemoryAgreementRecord = (
    agreementId: string,
    userId: string,
) => {
    const agreement = agreements.get(agreementId);
    if (!agreement || agreement.userId !== userId) return null;
    return agreement;
};

export const listMemoryAgreements = (userId: string) =>
    [...agreements.values()]
        .filter((agreement) => agreement.userId === userId)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .map((agreement) => ({
            id: agreement.id,
            type: agreement.analysis?.type ?? "OTHER",
            title: agreement.analysis?.title ?? agreement.fileName,
            status: agreement.status,
            updatedAt: agreement.updatedAt,
            createdAt: agreement.createdAt,
        }));

export const getMemoryAgreement = (agreementId: string, userId: string) => {
    const agreement = getMemoryAgreementRecord(agreementId, userId);
    if (!agreement) return null;
    const analysis = agreement.analysis;
    return {
        id: agreement.id,
        title: analysis?.title ?? agreement.fileName,
        type: analysis?.type ?? "OTHER",
        metadata: analysis?.metadata ?? null,
        property: analysis?.property ?? null,
        payments: analysis?.payments ?? null,
        parties: analysis?.parties ?? [],
        summary: analysis?.summary ?? [],
        status: agreement.status,
        error: agreement.error,
        userId: agreement.userId,
        fileId: agreement.fileId,
        createdAt: agreement.createdAt,
        updatedAt: agreement.updatedAt,
    };
};

export const setMemoryAgreementStatus = (
    agreementId: string,
    userId: string,
    status: MemoryAgreement["status"],
    error: string | null,
) => {
    const agreement = getMemoryAgreementRecord(agreementId, userId);
    if (!agreement) return false;
    agreement.status = status;
    agreement.error = error;
    agreement.updatedAt = new Date();
    return true;
};

export const setMemoryAgreementAnalysis = (
    agreementId: string,
    userId: string,
    analysis: AgreementAnalysis,
) => {
    const agreement = getMemoryAgreementRecord(agreementId, userId);
    if (!agreement) return false;
    agreement.analysis = analysis;
    agreement.status = "SUCCESS";
    agreement.error = null;
    agreement.updatedAt = new Date();
    return true;
};

export const getMemoryRisks = (agreementId: string, userId: string) => {
    const agreement = getMemoryAgreementRecord(agreementId, userId);
    return (agreement?.analysis?.risks ?? []).map((risk, index) => ({
        id: `${agreementId}-${index}`,
        ...risk,
    }));
};

export const getMemorySections = (agreementId: string, userId: string) =>
    getMemoryAgreementRecord(agreementId, userId)?.analysis?.sections ?? [];

export const getMemoryChat = (
    agreementId: string,
    userId: string,
    create = false,
) => {
    const agreement = getMemoryAgreementRecord(agreementId, userId);
    if (!agreement) return null;
    if (!agreement.chatId && create) agreement.chatId = randomUUID();
    if (!agreement.chatId) return null;
    return {
        id: agreement.chatId,
        user_id: userId,
        agreement_id: agreementId,
        created_at: agreement.createdAt,
        messages: agreement.messages,
    };
};

export const appendMemoryChatMessage = (
    chatId: string,
    userId: string,
    agreementId: string,
    role: MemoryChatMessage["role"],
    content: string,
) => {
    const chat = getMemoryChat(agreementId, userId);
    if (!chat || chat.id !== chatId) throw new Error("Chat not found");
    const message: MemoryChatMessage = {
        id: randomUUID(),
        chatId,
        userId,
        agreementId,
        role,
        content,
        createdAt: new Date(),
    };
    chat.messages.push(message);
    return message;
};

export const listMemoryChatMessages = (
    chatId: string,
    userId: string,
    agreementId: string,
    limit: number,
    cursor?: string,
) => {
    const chat = getMemoryChat(agreementId, userId);
    if (!chat || chat.id !== chatId) throw new Error("Chat not found");
    const ordered = [...chat.messages].sort(
        (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
    );
    const cursorId = cursor
        ? Buffer.from(cursor, "base64url").toString("utf8")
        : undefined;
    const cursorIndex = cursorId
        ? ordered.findIndex((message) => message.id === cursorId)
        : -1;
    const page = ordered.slice(
        cursorIndex >= 0 ? cursorIndex + 1 : 0,
        (cursorIndex >= 0 ? cursorIndex + 1 : 0) + limit,
    );
    const nextCursor =
        page.length === limit
            ? Buffer.from(page.at(-1)!.id).toString("base64url")
            : null;
    return { messages: page, nextCursor };
};