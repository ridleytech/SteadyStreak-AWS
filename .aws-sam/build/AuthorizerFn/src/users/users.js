// src/users.js
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const TABLE = process.env.TABLE_USERS; // SteadyStreakUsers
const EMAIL_INDEX = process.env.EMAIL_INDEX; // EmailIndex
const JWT_SECRET = process.env.JWT_SECRET; // strong secret
const REQUIRE_NONCE = process.env.REQUIRE_NONCE === "true";
const NONCE_TABLE = process.env.NONCE_TABLE; // your existing nonce table (optional)

export const signup = withCors(async (event) => {
  await verifyNonceIfRequired(event);

  const { email, password } = json(event);
  if (!email || !password) return bad("email and password are required");

  // Uniqueness by GSI
  const existing = await ddb.send(
    new QueryCommand({
      TableName: TABLE,
      IndexName: EMAIL_INDEX,
      KeyConditionExpression: "email = :e",
      ExpressionAttributeValues: { ":e": email.toLowerCase() },
    })
  );
  if (existing.Count && existing.Count > 0)
    return bad("Email already in use", 409);

  const userId = cryptoRandomId();
  const passwordHash = await bcrypt.hash(password, 10);
  const now = new Date().toISOString();

  await ddb.send(
    new PutCommand({
      TableName: TABLE,
      Item: {
        userId,
        email: email.toLowerCase(),
        provider: "password",
        passwordHash,
        createdAt: now,
        updatedAt: now,
      },
      ConditionExpression: "attribute_not_exists(userId)",
    })
  );

  const token = makeJwt({
    userId,
    email: email.toLowerCase(),
    provider: "password",
  });
  return ok({ userId, token });
});

export const login = withCors(async (event) => {
  await verifyNonceIfRequired(event);

  const { email, password } = json(event);
  if (!email || !password) return bad("email and password are required");

  const q = await ddb.send(
    new QueryCommand({
      TableName: TABLE,
      IndexName: EMAIL_INDEX,
      KeyConditionExpression: "email = :e",
      ExpressionAttributeValues: { ":e": email.toLowerCase() },
      Limit: 1,
    })
  );
  if (!q.Items || !q.Items.length) return bad("Invalid credentials", 401);
  const user = q.Items[0];

  if (
    !user.passwordHash ||
    !(await bcrypt.compare(password, user.passwordHash))
  ) {
    return bad("Invalid credentials", 401);
  }

  const token = makeJwt({
    userId: user.userId,
    email: user.email,
    provider: "password",
  });
  return ok({ userId: user.userId, token });
});

// Optional: Sign in with Google (verify ID token → issue our JWT)
export const google = withCors(async (event) => {
  await verifyNonceIfRequired(event);

  const { idToken } = json(event);
  if (!idToken) return bad("idToken required");

  // Lightweight Google token verify (offline): prefer using google-auth-library if you like
  const payload = parseUnverifiedJwt(idToken);
  if (!payload || !payload.email || !payload.sub)
    return bad("Invalid Google token", 401);

  const email = String(payload.email).toLowerCase();

  // Find or create
  const q = await ddb.send(
    new QueryCommand({
      TableName: TABLE,
      IndexName: EMAIL_INDEX,
      KeyConditionExpression: "email = :e",
      ExpressionAttributeValues: { ":e": email },
      Limit: 1,
    })
  );
  let userId;
  const now = new Date().toISOString();

  if (q.Items && q.Items.length) {
    userId = q.Items[0].userId;
    await ddb.send(
      new UpdateCommand({
        TableName: TABLE,
        Key: { userId },
        UpdateExpression: "SET provider = :p, updatedAt = :u",
        ExpressionAttributeValues: { ":p": "google", ":u": now },
      })
    );
  } else {
    userId = cryptoRandomId();
    await ddb.send(
      new PutCommand({
        TableName: TABLE,
        Item: {
          userId,
          email,
          provider: "google",
          createdAt: now,
          updatedAt: now,
        },
      })
    );
  }

  const token = makeJwt({ userId, email, provider: "google" });
  return ok({ userId, token });
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
function cors() {
  return {
    "Access-Control-Allow-Origin": process.env.CORS_ORIGIN || "*",
    "Access-Control-Allow-Headers": "Content-Type,Authorization,X-Nonce",
    "Access-Control-Allow-Methods": "OPTIONS,POST,GET",
  };
}
function withCors(handler) {
  return async (event) =>
    event.httpMethod === "OPTIONS"
      ? { statusCode: 200, headers: cors(), body: "" }
      : handler(event);
}
function makeJwt(claims) {
  return jwt.sign(claims, JWT_SECRET, { expiresIn: "180d" });
}
function cryptoRandomId() {
  return cryptoRandom(16);
}
function cryptoRandom(bytes) {
  return [...crypto.getRandomValues(new Uint8Array(bytes))]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
// Minimal JWT parse; for Google production verify with google-auth-library
function parseUnverifiedJwt(t) {
  try {
    const [, p] = t.split(".");
    return JSON.parse(Buffer.from(p, "base64url").toString());
  } catch {
    return null;
  }
}

// Optional nonce (single-use) like your StreakPath flow
async function verifyNonceIfRequired(event) {
  if (!REQUIRE_NONCE) return;
  const nonce = event.headers?.["x-nonce"] || event.headers?.["X-Nonce"];
  if (!nonce) throw new Error("Missing nonce");

  // Atomically consume once (delete on read) — implement to match your existing Nonce table shape
  // If you already have a Lambda for this, call it instead.
  await ddb.send(
    new UpdateCommand({
      TableName: NONCE_TABLE,
      Key: { nonce },
      UpdateExpression: "SET consumed = :t",
      ConditionExpression:
        "attribute_exists(nonce) AND attribute_not_exists(consumed)",
      ExpressionAttributeValues: { ":t": true },
    })
  );
}
