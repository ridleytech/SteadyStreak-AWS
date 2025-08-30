# App Attest API (Demo build)

Deploy:
  npm install
  sam build --cached
  sam deploy --guided --stack-name appattest --region us-west-2 --capabilities CAPABILITY_IAM

After deploy, enable demo env vars in AWS Lambda console:
- RegisterFn: DEMO_ACCEPT_UNVERIFIED=true
- AuthorizerFn: DEMO_ACCEPT_ASSERTION=true

Test:
  curl "$API/nonce?purpose=request"
  # Register (send a dummy PEM in publicKeyPem)
  # Protected (send minimal headers as shown earlier)
