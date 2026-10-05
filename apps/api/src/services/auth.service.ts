import * as UserService from "@/services/user.service";
import { generateToken } from "@/utils/jwt.util";

/**
 * Find or create user and return a signed token
 */
export const authenticateWithEmail = async (email: string) => {
    const { userId, created } = await UserService.createUser(email);

    const token = generateToken({ userId });

    return {
        token,
        enableOnboarding: created,
    };
};
