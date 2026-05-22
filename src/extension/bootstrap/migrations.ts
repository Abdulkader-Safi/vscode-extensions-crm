// SQL files are loaded as string literals via esbuild's `text` loader
// (see esbuild.js loader config). Order matters — earliest first.
// The bootstrap snippet itself lives in src/shared/bootstrapSnippet.ts —
// imported directly by the onboarding UI for display + copy.
import schemaSql from "../../../migrations/0001_schema.sql";
import revokeSql from "../../../migrations/0002_revoke.sql";
import invoiceUniqueSql from "../../../migrations/0004_invoice_unique.sql";
import storageSql from "../../../migrations/0005_storage.sql";
import softDeleteSql from "../../../migrations/0006_soft_delete.sql";
import profileTzFxSql from "../../../migrations/0007_profile_timezone_fx.sql";
import invoiceSaveFnSql from "../../../migrations/0008_invoice_save_fn.sql";
import invoiceRecurringSql from "../../../migrations/0009_invoice_recurring.sql";
import invoiceShareSql from "../../../migrations/0010_invoice_share.sql";
import taskSubtasksCategoriesSql from "../../../migrations/0011_task_subtasks_categories.sql";
import leadsClientLinkSql from "../../../migrations/0012_leads_client_link.sql";
import commLogsLeadSql from "../../../migrations/0013_comm_logs_lead.sql";
import taskPositionSql from "../../../migrations/0014_task_position.sql";
import commLogsTaskSql from "../../../migrations/0015_comm_logs_task.sql";
import taskClientLinkSql from "../../../migrations/0016_task_client_link.sql";

export type Migration = { name: string; sql: string };

export const MIGRATIONS: Migration[] = [
  { name: "0001_schema.sql", sql: schemaSql },
  { name: "0002_revoke.sql", sql: revokeSql },
  { name: "0004_invoice_unique.sql", sql: invoiceUniqueSql },
  { name: "0005_storage.sql", sql: storageSql },
  { name: "0006_soft_delete.sql", sql: softDeleteSql },
  { name: "0007_profile_timezone_fx.sql", sql: profileTzFxSql },
  { name: "0008_invoice_save_fn.sql", sql: invoiceSaveFnSql },
  { name: "0009_invoice_recurring.sql", sql: invoiceRecurringSql },
  { name: "0010_invoice_share.sql", sql: invoiceShareSql },
  {
    name: "0011_task_subtasks_categories.sql",
    sql: taskSubtasksCategoriesSql,
  },
  { name: "0012_leads_client_link.sql", sql: leadsClientLinkSql },
  { name: "0013_comm_logs_lead.sql", sql: commLogsLeadSql },
  { name: "0014_task_position.sql", sql: taskPositionSql },
  { name: "0015_comm_logs_task.sql", sql: commLogsTaskSql },
  { name: "0016_task_client_link.sql", sql: taskClientLinkSql },
];
