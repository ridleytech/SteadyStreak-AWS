import { DynamoDBClient } from "@aws-sdk/client-dynamodb";

const endpoint =
  process.env.DDB_ENDPOINT ||
  process.env.DYNAMODB_ENDPOINT ||
  (process.env.AWS_SAM_LOCAL ? "http://host.docker.internal:8000" : undefined);

console.warn(
  "Using DynamoDB endpoint:",
  endpoint || "default AWS region endpoint"
);

const region = process.env.AWS_REGION || "us-west-2";

export const ddb = new DynamoDBClient(
  endpoint
    ? {
        region,
        endpoint,
        credentials: { accessKeyId: "local", secretAccessKey: "local" },
      }
    : { region }
);
