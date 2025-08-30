import crypto from "crypto";
import { PutItemCommand } from "@aws-sdk/client-dynamodb";
import { ddb } from "../_ddb.js";

const TABLE = process.env.NONCES_TABLE;
const TTL_SECONDS = 120;

export const handler = async (event) => {
  try {
    const purpose = (
      event?.queryStringParameters?.purpose || "request"
    ).toLowerCase();
    const raw = crypto.randomBytes(32);
    const nonceB64 = raw.toString("base64url");

    console.log(`inserting nonce: ${nonceB64} -- nonce/index.js`);

    const now = Math.floor(Date.now() / 1000);

    await ddb.send(
      new PutItemCommand({
        TableName: TABLE,
        Item: {
          nonce: { S: nonceB64 },
          purpose: { S: purpose },
          used: { BOOL: false },
          createdAt: { N: String(now) },
          ttl: { N: String(now + TTL_SECONDS) },
        },
        ConditionExpression: "attribute_not_exists(nonce)",
      })
    );

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
      body: JSON.stringify({ nonce: nonceB64, expiresIn: TTL_SECONDS }),
    };
  } catch (e) {
    console.error(e);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "internal" }),
    };
  }
};
