import { db } from "@/server/db";
import { getSession } from "@/server/auth";
import { exportData } from "@/server/services/data-transfer";

export const dynamic = "force-dynamic";

/** Full JSON export of all personal data (download). */
export async function GET() {
  if (!(await getSession())) return Response.json({ error: "unauthorized" }, { status: 401 });
  const data = await exportData(db);
  const name = `bettarrow-export-${data.exportedAt.slice(0, 10)}.json`;
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="${name}"`,
      "cache-control": "no-store",
    },
  });
}
