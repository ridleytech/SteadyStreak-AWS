# Lambda code for App Attest + WAF + REST API Gateway

This folder contains the Lambda source code referenced by the SAM template I gave you.

## Structure

```
src/
  nonce/            -> issues one-time nonces (GET /nonce)
  register/         -> verifies App Attest attestation & stores app install (POST /register)
  authorizer/       -> API Gateway REQUEST authorizer: verifies assertions per request
  protected/        -> example protected endpoint
package.json
```

## Install & Build (local)

```bash
npm install
# deploy with SAM using the template.yaml provided earlier
```

sam build && sam deploy --guided
sam build --cached

Built Artifacts : .aws-sam/build
Built Template : .aws-sam/build/template.yaml

# Commands you can use next

[*] Validate SAM template: sam validate
[*] Invoke Function: sam local invoke
[*] Test Function in the Cloud: sam sync --stack-name {{stack-name}} --watch
[*] Deploy: sam deploy --guided

AWS SAM CLI does not guarantee 100% fidelity between authorizers locally  
and authorizers deployed on AWS. Any application critical behavior should  
be validated thoroughly before deploying to production.

Testing application behaviour against authorizers deployed on AWS can be done using the sam sync  
command.

sam-app$ sam local invoke SamTestFunction --event events/event.json

sam local invoke NonceFn --env-vars env.json --event events/nonce.json
sam local invoke RegisterFn --env-vars env.json --event events/register.json
sam local invoke AuthorizerFn --env-vars env.json --event events/authorizer.json
sam local invoke ProtectedFn --env-vars env.json --event events/protected.json

- or -

sam local start-api --env-vars env.json

curl http://127.0.0.1:3000/nonce
curl -X POST http://127.0.0.1:3000/register -H "Content-Type: application/json" -d '{"keyId":"demo-key"}'

🧪 1. GET /nonce

curl "http://127.0.0.1:3000/nonce?purpose=request"

Expected response:

{"nonce":"<base64url string>","expiresIn":120}

🧪 2. POST /register

curl -X POST http://127.0.0.1:3000/register \
 -H "Content-Type: application/json" \
 -d '{
"keyId": "demo-key-123",
"attestationObject": "dummyAttObj",
"clientDataHashB64": "abcd1234",
"publicKeyPem": "-----BEGIN PUBLIC KEY-----\nMIIBIjANBg...snip...\n-----END PUBLIC KEY-----"
}'

Expected response:

{"registered":true}

🧪 3. POST /protected (with fake authorizer headers)

curl -X POST http://127.0.0.1:3000/protected \
 -H "X-AppAttest-KeyId: demo-key-123" \
 -H "X-AppAttest-Assertion: dummyAssertion" \
 -H "X-Req-Nonce: dummyNonce" \
 -H "X-Req-Timestamp: 1734885000" \
 -H "Content-Type: application/json" \
 -d '{}'

    Expected response:

{"ok":true,"message":"Protected endpoint reached."}

🧪 4. Hitting /protected without headers

curl -X POST http://127.0.0.1:3000/protected -d '{}'

This should fail with a 401/403 because the authorizer rejects missing headers.

# SAM tutorial

https://www.youtube.com/watch?v=AUQRyl1SNcU&list=PL9nWRykSBSFjodfc8l8M8yN0ieP94QeEL&index=20

deploy

npm install
sam build --cached

sam deploy --guided \
 --stack-name steadystreak \
 --region us-west-2 \
 --capabilities CAPABILITY_IAM

sam build && sam deploy --stack-name steadystreak --region us-west-2

prod testing

API="https://rv0am18e5a.execute-api.us-west-2.amazonaws.com/prod"
curl "$API/nonce?purpose=request"
{"nonce":"bpk1wkmilZt0KuMuP0Km5AwTuiOXJWct853D0uDdFJI","expiresIn":120}%

curl -X POST "$API/register" -H "Content-Type: application/json" -d '{"keyId":"s3x3/m/E5DxSaWeWONFNWwWa51lJx5okNWGkoV7SiQk="}'

curl -X POST "$API/protected" -H "X-AppAttest-KeyId: demo" -H "X-AppAttest-Assertion: dummy" -H "X-Req-Nonce: BiSnVgMR4VfcCXLd/jspQ1Yc4x3hTphB7p1mIyAAUxw=" -H "X-Req-Timestamp: 1734885000" -d '{}'

## Security notes

- **Attestation** (`src/register/verify-attestation.js`) and **assertion** (`src/authorizer/verify-assertion.js`) verification are security-critical.
- The included files provide **secure-by-default stubs** that throw unless you explicitly set an env var for TEST mode:
  - `DEMO_ACCEPT_UNVERIFIED=true` for /register (attestation)
  - `DEMO_ACCEPT_ASSERTION=true` for the authorizer (assertion)
- Use these TEST modes only to wire up the end-to-end flow, then **replace the TODOs** with full Apple App Attest verification.
  - You can implement verification using a COSE/CBOR library (e.g., `cose-js`) and Apple’s published roots/intermediates.
  - Keep checks strict: teamId, bundleId, nonce binding, cert chain, algorithm (ES256), key type (P-256).

## Environment variables

- `APP_INSTALLS_TABLE` (authorizer/register)
- `NONCES_TABLE` (authorizer/nonce)
- Optional testing:
  - `DEMO_ACCEPT_UNVERIFIED=true` (register) – **do not use in production**
  - `DEMO_ACCEPT_ASSERTION=true` (authorizer) – **do not use in production**
