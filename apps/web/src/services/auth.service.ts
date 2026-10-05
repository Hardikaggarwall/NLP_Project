import api, { ApiResponse } from "@/lib/api.client";

export interface LoginResponse {
    message: string;
    enableOnboarding: boolean;
}

/**
 * Login / signup with email.
 * Automatically saves the received auth token via the api.client interceptor.
 */
export const login = async (
    email: string,
): Promise<ApiResponse<LoginResponse>> => {
    return api.post<LoginResponse>("/api/auth/login", { email });
};

/**
 * Logout the authenticated user
 */
export const logout = async (): Promise<ApiResponse<{ message: string }>> => {
    return api.post<{ message: string }>("/api/auth/logout");
};
