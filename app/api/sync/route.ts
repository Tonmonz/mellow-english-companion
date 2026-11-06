import { getChatGPTUser } from "../../chatgpt-auth";
import { getD1 } from "../../../db";

const MAX_STATE_BYTES = 1_500_000;

type SyncRow = {
  stateJson: string;
  revision: number;
  updatedAt: number;
};

async function readState(userId: string) {
  return getD1()
    .prepare(
      `SELECT state_json AS stateJson, revision, updated_at AS updatedAt
       FROM mellow_states
       WHERE user_id = ?`,
    )
    .bind(userId)
    .first<SyncRow>();
}

function responseFromRow(row: SyncRow | null) {
  if (!row) {
    return Response.json({ data: null, revision: 0, updatedAt: null });
  }

  try {
    return Response.json({
      data: JSON.parse(row.stateJson),
      revision: row.revision,
      updatedAt: row.updatedAt,
    });
  } catch {
    return Response.json({ error: "invalid_cloud_state" }, { status: 500 });
  }
}

async function requireApiUser() {
  const user = await getChatGPTUser();
  if (!user) return null;
  return user;
}

export async function GET() {
  const user = await requireApiUser();
  if (!user) return Response.json({ error: "sign_in_required" }, { status: 401 });

  return responseFromRow(await readState(user.userId));
}

export async function PUT(request: Request) {
  const user = await requireApiUser();
  if (!user) return Response.json({ error: "sign_in_required" }, { status: 401 });

  const rawBody = await request.text();
  if (!rawBody || rawBody.length > MAX_STATE_BYTES) {
    return Response.json({ error: "invalid_state_size" }, { status: 413 });
  }

  let body: { data?: unknown; baseRevision?: unknown };
  try {
    body = JSON.parse(rawBody) as { data?: unknown; baseRevision?: unknown };
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  if (!body.data || typeof body.data !== "object" || Array.isArray(body.data)) {
    return Response.json({ error: "invalid_state" }, { status: 400 });
  }

  const baseRevision = body.baseRevision;
  if (!Number.isInteger(baseRevision) || (baseRevision as number) < 0) {
    return Response.json({ error: "invalid_revision" }, { status: 400 });
  }

  const stateJson = JSON.stringify(body.data);
  if (stateJson.length > MAX_STATE_BYTES) {
    return Response.json({ error: "state_too_large" }, { status: 413 });
  }

  const now = Date.now();
  const d1 = getD1();
  let changes = 0;

  if (baseRevision === 0) {
    const result = await d1
      .prepare(
        `INSERT OR IGNORE INTO mellow_states
         (user_id, state_json, revision, updated_at)
         VALUES (?, ?, 1, ?)`,
      )
      .bind(user.userId, stateJson, now)
      .run();
    changes = result.meta.changes ?? 0;
  } else {
    const result = await d1
      .prepare(
        `UPDATE mellow_states
         SET state_json = ?, revision = revision + 1, updated_at = ?
         WHERE user_id = ? AND revision = ?`,
      )
      .bind(stateJson, now, user.userId, baseRevision)
      .run();
    changes = result.meta.changes ?? 0;
  }

  if (changes === 0) {
    const current = await readState(user.userId);
    const response = responseFromRow(current);
    return new Response(response.body, {
      status: 409,
      headers: response.headers,
    });
  }

  return Response.json({
    ok: true,
    revision: baseRevision === 0 ? 1 : baseRevision + 1,
    updatedAt: now,
  });
}

export async function DELETE() {
  const user = await requireApiUser();
  if (!user) return Response.json({ error: "sign_in_required" }, { status: 401 });

  await getD1()
    .prepare("DELETE FROM mellow_states WHERE user_id = ?")
    .bind(user.userId)
    .run();

  return Response.json({ ok: true });
}
