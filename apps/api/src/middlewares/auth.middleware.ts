import { PUBLIC_USER_ID } from "@/config/public-user.config";
import { getContext } from "@/utils/context.util";
import { NextFunction, Request, Response } from "express";

// Extend Express Request interface to include custom properties
declare global {
    namespace Express {
        interface Request {
            user: {
                userId: string;
            };
        }
    }
}

export const authorize = (req: Request, _res: Response, next: NextFunction) => {
    req.user = { userId: PUBLIC_USER_ID };
    const ctx = getContext();
    if (ctx) ctx.userId = PUBLIC_USER_ID;

    return next();
};
