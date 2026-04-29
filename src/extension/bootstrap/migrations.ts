// SQL files are loaded as string literals via esbuild's `text` loader
// (see esbuild.js loader config). Order matters — earliest first.
// The bootstrap snippet itself lives in src/shared/bootstrapSnippet.ts —
// imported directly by the onboarding UI for display + copy.
import schemaSql from "../../../migrations/0001_schema.sql";
import revokeSql from "../../../migrations/0002_revoke.sql";
import invoiceUniqueSql from "../../../migrations/0004_invoice_unique.sql";
import storageSql from "../../../migrations/0005_storage.sql";

export type Migration = { name: string; sql: string };

export const MIGRATIONS: Migration[] = [
  { name: "0001_schema.sql", sql: schemaSql },
  { name: "0002_revoke.sql", sql: revokeSql },
  { name: "0004_invoice_unique.sql", sql: invoiceUniqueSql },
  { name: "0005_storage.sql", sql: storageSql },
];
