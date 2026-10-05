import { SECTION_CLAUSE_TYPES } from "@/constants";
import { sql } from "drizzle-orm";
import {
    index,
    pgEnum,
    pgTable,
    text,
    timestamp,
    uuid,
    varchar,
} from "drizzle-orm/pg-core";
import { Agreements } from "./agreements";

export const TypeEnum = pgEnum("section_type", SECTION_CLAUSE_TYPES);

export const Sections = pgTable(
    "sections",
    {
        id: uuid()
            .primaryKey()
            .default(sql`uuidv7()`)
            .notNull(),
        agreement_id: uuid()
            .references(() => Agreements.id)
            .notNull(),
        ref: varchar({ length: 10 }).notNull(),
        heading: varchar({ length: 255 }).notNull(),
        type: TypeEnum().notNull(),
        content: text().notNull(),
        updated_at: timestamp()
            .defaultNow()
            .notNull()
            .$onUpdate(() => new Date()),
        created_at: timestamp().defaultNow().notNull(),
    },
    (table) => [
        index("sections_agreement_id_idx").on(table.agreement_id),
        // Full-text search index used by the chat query engine
        index("sections_search_idx").using(
            "gin",
            sql`to_tsvector('english', ${table.heading} || ' ' || ${table.content})`,
        ),
    ],
);

export type SectionsSchema = typeof Sections.$inferSelect;
