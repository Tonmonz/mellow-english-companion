import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const mellowStates = sqliteTable("mellow_states", {
  userId: text("user_id").primaryKey(),
  stateJson: text("state_json").notNull(),
  revision: integer("revision").notNull().default(1),
  updatedAt: integer("updated_at").notNull(),
});
