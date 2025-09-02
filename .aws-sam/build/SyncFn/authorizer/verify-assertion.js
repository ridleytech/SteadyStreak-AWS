import { verifyAssertion } from "node-app-attest";

/**
 * Validates an App Attest assertion produced by generateAssertion(keyId, clientDataHash).
 *
 * @param {object} p
 * @param {string} p.assertionB64     // base64 string from generateAssertion(...)
 * @param {Buffer|string} p.payload   // EXACT same bytes you hashed into clientDataHash on iOS
 * @param {string} p.publicKeyPem     // previously stored PEM from attestation
 * @param {number} p.signCount        // optional: last known counter; pass 0 if you don't track it yet
 */
export function verifyAppAttestAssertion({
  assertionB64,
  payload,
  publicKeyPem,
  signCount = 0,
}) {
  console.log(
    `bundleIdentifier: ${process.env.BUNDLE_ID} -- verify-assertion.js`
  );
  console.log(`teamIdentifier: ${process.env.TEAM_ID} -- verify-assertion.js`);
  console.log(`signCount: ${signCount} -- verify-assertion.js`);
  console.log(`assertionB64: ${assertionB64} -- verify-assertion.js`);
  console.log(`payload: ${payload} -- verify-assertion.js`);
  console.log(`publicKeyPem: ${publicKeyPem} -- verify-assertion.js`);

  const result = verifyAssertion({
    assertion: Buffer.from(assertionB64, "base64"),
    payload, // library hashes as needed
    publicKey: publicKeyPem,
    bundleIdentifier: process.env.BUNDLE_ID,
    teamIdentifier: process.env.TEAM_ID,
    signCount, // the lib returns updated count if you want to persist it
  });

  console.log(
    `Assertion verified: ${result.signCount} (was ${signCount}) -- verify-assertion.js`
  );

  return result; // { signCount: <number> }
}
