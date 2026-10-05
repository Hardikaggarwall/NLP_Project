import { logger } from "@/utils/logger.util";
import * as AuthService from "@/services/auth.service";
import { isEmail } from "@/utils/validator.util";
import { Request, Response } from "express";

/**
 * Login / signup with email and issue JWT + Session ID
 */
export const login = async (req: Request, res: Response) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({ error: "Email is required" });
        }
        if (!isEmail(email)) {
            return res.status(400).json({ error: "Email is invalid" });
        }

        const { token, enableOnboarding } =
            await AuthService.authenticateWithEmail(email);

        // Set token header
        res.setHeader("x-access-token", token);
        res.setHeader("Access-Control-Expose-Headers", "x-access-token");

        return res.status(200).json({
            message: "Logged in successfully",
            enableOnboarding,
        });
    } catch (error: any) {
        logger.error(error.message);
        return res.status(500).json({ error: "Internal server error" });
    }
};

/**
 * Logout - tokens are stateless, so the client simply discards its token
 */
export const logout = async (req: Request, res: Response) => {
    return res.status(200).json({
        message: "Logged out successfully",
    });
};
