import { DynamoDBClient, PutItemCommand } from "@aws-sdk/client-dynamodb";

// You must fully verify Apple's App Attest "attestationObject" per Apple spec,
// extract the app-generated public key, and confirm TeamID/BundleID match.
// For brevity, we assume a function verifyAttestation returns { publicKeyPem }.
// Implement with CBOR/COSE + X.509 chain checks.
import { verifyAttestationServer } from "./verify-attestation.js";

const ddb = new DynamoDBClient({});
const TABLE = process.env.APP_INSTALLS_TABLE;

export const handler = async (event) => {
  try {
    if (!event.body) return bad(400, "missing body");
    const { keyId, attestationB64, clientDataHashB64, challenge } = JSON.parse(
      event.body || "{}"
    );

    if (!keyId || !attestationB64 || !clientDataHashB64) {
      console.log(`register: missing fields -- register/index.js`);

      if (!keyId) console.log("missing keyId --register/index.js");
      if (!attestationB64)
        console.log("missing attestationB64 -- register/index.js");
      if (!clientDataHashB64)
        console.log("missing challenge -- register/index.js");

      return bad(400, "missing fields");
    }

    // console.log(
    //   `attestationObject: ${attestationObject.slice(
    //     0,
    //     20
    //   )} -- register/index.js`
    // );

    // console.log(`nonce: ${nonce} -- register/index.js`);

    // const { publicKeyPem } = await verifyAttestationServer(
    //   keyId,
    //   attestationObject,
    //   clientDataHashB64
    // );

    const { publicKeyPem } = verifyAttestationServer({
      keyId,
      attestationB64, // base64 from iOS
      challengeStr: challenge, // the nonce string the client received
      clientDataHashB64, // optional: if you send it
    });

    console.log(`register: registering keyId ${keyId} -- register/index.js`);
    console.log(`nonce: ${clientDataHashB64} -- register/index.js`);

    if (!publicKeyPem) {
      console.error("register: publicKeyPem is missing -- register/index.js");
      return bad(400, "attestation verify failed");
    } else {
      console.log(
        `register: publicKeyPem is ${publicKeyPem} -- register/index.js`
      );
    }

    const now = Math.floor(Date.now() / 1000);
    await ddb.send(
      new PutItemCommand({
        TableName: TABLE,
        Item: {
          keyId: { S: keyId },
          publicKeyPem: { S: publicKeyPem },
          createdAt: { N: String(now) },
        },
        ConditionExpression: "attribute_not_exists(keyId)",
      })
    );

    return ok({ registered: true });
  } catch (error) {
    console.error("register error -- register/index.js", error);
    return bad(400, "attestation verify failed");
  }
};

const ok = (body) => ({
  statusCode: 200,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});
const bad = (code, msg) => ({
  statusCode: code,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ error: msg }),
});
