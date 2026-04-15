import { db } from "../db";
import { maintenanceLogs, projects } from "@shared/schema";
import { eq, and, gte } from "drizzle-orm";
import { format } from "date-fns";

export async function migrateHostingLogs() {
  try {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthStartStr = format(monthStart, "yyyy-MM-dd");

    const hostingProjects = await db.select({ id: projects.id, name: projects.name })
      .from(projects)
      .where(eq(projects.status, "hosting"));

    let totalConverted = 0;
    for (const project of hostingProjects) {
      const result = await db.update(maintenanceLogs)
        .set({ logType: "hosting" })
        .where(
          and(
            eq(maintenanceLogs.projectId, project.id),
            eq(maintenanceLogs.logType, "development"),
            gte(maintenanceLogs.logDate, monthStartStr)
          )
        )
        .returning({ id: maintenanceLogs.id });

      if (result.length > 0) {
        console.log(`[Migration] Converted ${result.length} dev logs to hosting for "${project.name}"`);
        totalConverted += result.length;
      }
    }

    if (totalConverted > 0) {
      console.log(`[Migration] Total: ${totalConverted} development logs converted to hosting`);
    } else {
      console.log("[Migration] No development logs needed conversion");
    }
  } catch (error) {
    console.error("[Migration] Failed to migrate hosting logs:", error);
  }
}
