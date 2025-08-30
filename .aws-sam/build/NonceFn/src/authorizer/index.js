import crypto from "crypto";
import {
  GetItemCommand,
  UpdateItemCommand,
  DeleteItemCommand,
} from "@aws-sdk/client-dynamodb";
import { ddb } from "../_ddb.js";
import { verifyAppAttestAssertion } from "./verify-assertion.js";

const INSTALLS = process.env.APP_INSTALLS_TABLE;
const NONCES = process.env.NONCES_TABLE;

// Bypass in demo mode right away to avoid 502s
const DEMO_ASSERT =
  (process.env.DEMO_ACCEPT_ASSERTION || "").toLowerCase() === "true";

const lowerCaseKeys = (o) =>
  Object.fromEntries(
    Object.entries(o || {}).map(([k, v]) => [String(k).toLowerCase(), v])
  );
const sha256b64 = (buf) =>
  crypto.createHash("sha256").update(buf).digest("base64");

// Safe base64url decoder (no Node flag/engine surprises)
function b64urlToBuf(s = "") {
  const str = String(s || "");
  const b64 = str.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4 === 2 ? "==" : b64.length % 4 === 3 ? "=" : "";
  return Buffer.from(b64 + pad, "base64");
}

// API Gateway authorizers don't get body; accept client-provided hash header or assume empty body
function getBodyHashBase64FromHeader(headersLc) {
  const h = headersLc["x-body-sha256"];
  if (h && typeof h === "string" && h.length > 0) return h.trim();
  return sha256b64(Buffer.alloc(0)); // sha256("")
}

async function consumeNonceOnce(nonceB64Url) {
  try {
    await ddb.send(
      new UpdateItemCommand({
        TableName: NONCES,
        Key: { nonce: { S: nonceB64Url } },
        UpdateExpression: "SET used = :t",
        ConditionExpression: "attribute_exists(nonce) AND used = :f",
        ExpressionAttributeValues: {
          ":t": { BOOL: true },
          ":f": { BOOL: false },
        },
      })
    );

    console.log(`Consumed nonce ${nonceB64Url} -- index.js authorizer`);

    await ddb.send(
      new DeleteItemCommand({
        TableName: NONCES,
        Key: { nonce: { S: nonceB64Url } },
      })
    );
    return true;
  } catch (e) {
    console.warn("consumeNonceOnce failed", e?.name || e?.message || e);
    return false;
  }
}

async function getPublicKeyPem(keyId) {
  try {
    const out = await ddb.send(
      new GetItemCommand({ TableName: INSTALLS, Key: { keyId: { S: keyId } } })
    );

    console.log(
      `getPublicKeyPem(${keyId}) ->`,
      out.Item?.publicKeyPem?.S || "not found"
    );
    return out.Item?.publicKeyPem?.S;
  } catch (e) {
    console.error("getPublicKeyPem error", e?.name || e?.message || e);
    return undefined;
  }
}

export const handler = async (event) => {
  try {
    if (DEMO_ASSERT) {
      console.log("Authorizer DEMO mode ON: allowing all requests.");
      return allow("demo", event?.methodArn || "*");
    }

    const headersLc = lowerCaseKeys(event?.headers);
    const keyId = headersLc["x-appattest-keyid"] || "";
    const assertionB64 = headersLc["x-appattest-assertion"] || "";
    const nonceB64Url = headersLc["x-req-nonce"] || "";
    const tsRaw = headersLc["x-req-timestamp"] || "";
    const ts = Number(tsRaw);

    if (!keyId || !assertionB64 || !nonceB64Url || !Number.isFinite(ts)) {
      console.warn("Missing required headers", {
        hasKeyId: !!keyId,
        hasAssertion: !!assertionB64,
        hasNonce: !!nonceB64Url,
        ts: tsRaw,
      });
      return deny("missing headers");
    }

    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - ts) > 60) {
      return deny("stale timestamp");
    }

    const nonceOk = await consumeNonceOnce(nonceB64Url);
    if (!nonceOk) {
      console.log(
        `Nonce ${nonceB64Url} invalid/used/expired -- index.js authorizer`
      );

      return deny("nonce invalid/used/expired");
    }

    const publicKeyPem = await getPublicKeyPem(keyId);
    if (!publicKeyPem) {
      console.log(
        `No publicKeyPem found for keyId ${keyId} -- index.js authorizer`
      );

      return deny("unknown keyId");
    }

    const method = (
      event?.httpMethod ||
      event?.requestContext?.httpMethod ||
      "POST"
    ).toUpperCase();
    const path =
      event?.path ||
      event?.requestContext?.path ||
      event?.requestContext?.resourcePath ||
      "/protected";
    const bodyHashB64 = getBodyHashBase64FromHeader(headersLc);

    // method|path|timestamp|bodySha256(base64)|nonce(base64url)
    const payload = Buffer.concat([
      Buffer.from(method, "utf8"),
      Buffer.from("|", "utf8"),
      Buffer.from(path, "utf8"),
      Buffer.from("|", "utf8"),
      Buffer.from(String(ts), "utf8"),
      Buffer.from("|", "utf8"),
      Buffer.from(bodyHashB64, "base64"),
      Buffer.from("|", "utf8"),
      b64urlToBuf(nonceB64Url),
    ]);

    // If you want to test cryptographic path, set DEMO_ACCEPT_ASSERTION=false and implement real verifier
    const result = await verifyAppAttestAssertion({
      assertionB64,
      payload,
      publicKeyPem,
      signCount: 0,
    });

    return allow("app-instance", event?.methodArn || "*");
  } catch (e) {
    console.log(
      `Authorizer error (caught): ${e?.message || e} -- index.js authorizer`
    );
    console.error(
      `Authorizer error (caught): ${e?.message || e} -- index.js authorizer`
    );
    return deny("error");
  }
};

const deny = (reason) => ({
  principalId: "unauthorized",
  policyDocument: {
    Version: "2012-10-17",
    Statement: [
      { Action: "execute-api:Invoke", Effect: "Deny", Resource: "*" },
    ],
  },
  context: { reason },
});

const allow = (principalId, resource = "*") => ({
  principalId,
  policyDocument: {
    Version: "2012-10-17",
    Statement: [
      { Action: "execute-api:Invoke", Effect: "Allow", Resource: resource },
    ],
  },
});
