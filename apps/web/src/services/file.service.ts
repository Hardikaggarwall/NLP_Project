import api, { ApiResponse } from "@/lib/api.client";

export interface FileUploadResponse {
    fileId: string;
}

export interface ProcessFileResponse {
    success: boolean;
    agreementId: string;
}

export interface UserFileItem {
    id: string;
    fileName?: string;
    mimeType?: string;
    status: string;
    createdAt?: string;
    [key: string]: any;
}

export interface GetUserFilesResponse {
    files: UserFileItem[];
}

/**
 * Upload a PDF file; its content is stored by the API in the database
 */
export const uploadFile = async (
    file: File,
): Promise<ApiResponse<FileUploadResponse>> => {
    return api.post<FileUploadResponse>("/api/files/upload", file, {
        params: { fileName: file.name },
        headers: { "Content-Type": "application/pdf" },
        timeout: 120000,
    });
};

/**
 * Trigger file processing after upload is complete
 */
export const processFile = async (
    fileId: string,
): Promise<ApiResponse<ProcessFileResponse>> => {
    // Analysis runs synchronously, so allow extra time for large/scanned PDFs
    return api.post<ProcessFileResponse>(
        "/api/files/process",
        { fileId },
        { timeout: 180000 },
    );
};

/**
 * Get all files uploaded by the authenticated user
 */
export const getUserFiles = async (): Promise<
    ApiResponse<GetUserFilesResponse>
> => {
    return api.get<GetUserFilesResponse>("/api/files");
};
