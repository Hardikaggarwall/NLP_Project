import { z } from "zod";
import dotenv from "dotenv";

dotenv.config();

const envSchema = z.object({
    // Server Config
    NODE_ENV: z.preprocess(
        (value) => (value ? value : "development"),
        z.enum(["development", "production", "test"]),
    ),
    PORT: z.preprocess(
        (value) => (value === undefined || value === "" ? 4000 : value),
        z.coerce.number(),
    ),
    ALLOW_DOMAINS: z.string().optional(),

    // Database Config
    DB_HOST: z.preprocess(
        (value) => (value ? value : "localhost"),
        z.string(),
    ),
    DB_PORT: z.preprocess(
        (value) => (value === undefined || value === "" ? 5432 : value),
        z.coerce.number(),
    ),
    DB_USER: z.preprocess((value) => (value ? value : "clause"), z.string()),
    DB_PASSWORD: z.preprocess(
        (value) => (value ? value : "clause"),
        z.string(),
    ),
    DB_SSL: z
        .enum(["true", "false"])
        .default("false")
        .transform((v) => v === "true"),
    DB_NAME: z.preprocess((value) => (value ? value : "clause"), z.string()),

    // Auth Config
    JWT_SECRET: z.preprocess(
        (value) => (value ? value : "public-mode-unused-secret"),
        z.string(),
    ),
    JWT_EXPIRES_IN: z.string().default("7d"),
});

const _env = envSchema.safeParse(process.env);

if (!_env.success) {
    process.stderr.write(
        `❌ Missing environment variables: ${JSON.stringify(_env.error.format(), null, 2)}\n`,
    );
    process.exit(1);
}

export const env = _env.data;
