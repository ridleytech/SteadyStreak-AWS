// src/sync.js
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import jwt from "jsonwebtoken";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const TABLE = process.env.TABLE_USERS;
const JWT_SECRET = process.env.JWT_SECRET;
const REQUIRE_NONCE = process.env.REQUIRE_NONCE === "true";
const NONCE_TABLE = process.env.NONCE_TABLE;

export const handler = withCors(async (event) => {
  await verifyNonceIfRequired(event);

  const auth =
    event.headers?.authorization || event.headers?.Authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return bad("Missing Authorization header", 401);

  let sess;
  try {
    sess = jwt.verify(token, JWT_SECRET);
  } catch {
    return bad("Invalid token", 401);
  }

  const payload = json(event); // { userId, generatedAt, exercises, macroGoals, repEntries }
  if (!payload || !payload.userId || payload.userId !== sess.userId) {
    return bad("userId mismatch", 403);
  }

  const now = new Date().toISOString();

  await ddb.send(
    new UpdateCommand({
      TableName: TABLE,
      Key: { userId: sess.userId },
      UpdateExpression: "SET snapshot = :s, updatedAt = :u",
      ExpressionAttributeValues: {
        ":s": payload,
        ":u": now,
      },
    })
  );

  return ok({ ok: true, updatedAt: now });
});

// ---------- helpers ----------
function json(event) {
  try {
    return JSON.parse(event.body || "{}");
  } catch {
    return {};
  }
}
function ok(body) {
  return { statusCode: 200, headers: cors(), body: JSON.stringify(body) };
}
function bad(message, status = 400) {
  return {
    statusCode: status,
    headers: cors(),
    body: JSON.stringify({ error: message }),
  };
}
function withCors(handler) {
  return async (event) =>
    event.httpMethod === "OPTIONS"
      ? { statusCode: 200, headers: cors(), body: "" }
      : handler(event);
}
function cors() {
  return {
    "Access-Control-Allow-Origin": process.env.CORS_ORIGIN || "*",
    "Access-Control-Allow-Headers": "Content-Type,Authorization,X-Nonce",
    "Access-Control-Allow-Methods": "OPTIONS,POST",
  };
}

async function verifyNonceIfRequired(event) {
  if (!REQUIRE_NONCE) return;
  const nonce = event.headers?.["x-nonce"] || event.headers?.["X-Nonce"];
  if (!nonce) throw new Error("Missing nonce");

  // Mirror your existing nonce consumption logic
  // If you already have a lambda/route for it, reuse that instead of touching Dynamo here.
  // (Left out intentionally to avoid duplicating whatever you implemented for StreakPaths.)
}
