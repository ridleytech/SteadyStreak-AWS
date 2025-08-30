import { verifyAttestation } from "node-app-attest";
import crypto from "crypto";

/**
 * Validates Apple's App Attest attestation and returns the extracted device public key (PEM).
 *
 * @param {object} p
 * @param {string} p.keyId               // keyId returned by DCAppAttestService.generateKey()
 * @param {string|Buffer} p.attestation  // base64 string from attestKey(...).base64EncodedString()
 * @param {string|Buffer} p.challenge    // the ORIGINAL server-issued nonce (string or Buffer),
 *                                       // the same value whose SHA-256 you passed as clientDataHash on iOS
 */

const sha256 = (buf) => crypto.createHash("sha256").update(buf).digest();

export function verifyAttestationServer({
  keyId,
  attestationB64,
  challengeStr,
  clientDataHashB64,
}) {
  if (!keyId) {
    console.log(`missing keyId -- verify-attestation.js`);
    throw new Error("missing keyId");
  }
  if (!attestationB64) {
    console.log(`missing attestation -- verify-attestation.js`);

    throw new Error("missing attestation");
  }
  if (!challengeStr && !clientDataHashB64) {
    console.log(`missing challenge/hash -- verify-attestation.js`);
    throw new Error("missing challenge/hash");
  }

  const allowDevelopmentEnvironment =
    (process.env.ALLOW_DEV || "").toLowerCase() === "true";

  const attestation = Buffer.from(attestationB64, "base64");

  // 1) Decode the original challenge bytes (from either base64 or base64url)
  const challengeBytes = challengeStr
    ? fromB64OrB64Url(challengeStr)
    : undefined;

  // 2) Compute/accept clientDataHash bytes
  const clientHashBytes = clientDataHashB64
    ? Buffer.from(clientDataHashB64, "base64")
    : challengeBytes
    ? sha256(challengeBytes)
    : undefined;

  // Sanity logging (short digests)
  const dbg = (b) =>
    b
      ? crypto.createHash("sha256").update(b).digest("hex").slice(0, 12)
      : "none";

  console.log(
    `${{
      keyId,
      attestation: attestation.length + "B",
      challengeSHA256: dbg(challengeBytes),
      clientHashBytes: dbg(clientHashBytes),
      BUNDLE: process.env.BUNDLE_ID,
      TEAM: process.env.TEAM_ID,
      allowDevelopmentEnvironment,
    }} -- verifying attestation.js`
  );

  const baseArgs = {
    attestation,
    keyId,
    bundleIdentifier: process.env.BUNDLE_ID,
    teamIdentifier: process.env.TEAM_ID,
    allowDevelopmentEnvironment,
  };

  // 3) Try with the ORIGINAL challenge bytes first (most libraries expect this)
  if (challengeBytes) {
    try {
      const { publicKey } = verifyAttestation({
        ...baseArgs,
        challenge: challengeBytes,
      });

      console.log(
        ` verified with RAW challenge bytes -- verify-attestation.js`
      );

      return { publicKeyPem: publicKey };
    } catch (e) {
      console.warn(
        `raw-challenge verify failed (will try hash): ${e.message} -- verify-attestation.js`
      );
    }
  }

  // 4) Fallback: try with the HASH bytes (some libs expect clientDataHash)
  if (clientHashBytes) {
    const { publicKey } = verifyAttestation({
      ...baseArgs,
      challenge: clientHashBytes,
    });
    console.log(
      "verified with HASH bytes (clientDataHash) -- verify-attestation.js"
    );
    return { publicKeyPem: publicKey };
  }

  throw new Error(
    "unable to verify attestation (no usable challenge/hash) -- verify-attestation.js"
  );
}

export function fromB64OrB64Url(str = "") {
  const s = String(str || "");
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = (4 - (b64.length % 4)) % 4;
  return Buffer.from(b64 + "=".repeat(pad), "base64");
}
