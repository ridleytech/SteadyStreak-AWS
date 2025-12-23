// src/users.js
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
  UpdateCommand,
  ListTablesCommand,
  DescribeTableCommand
} from "@aws-sdk/lib-dynamodb";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";

// Log all environment variables for debugging
const logDebug = (message, data = {}) => {
  const logEntry = {
    timestamp: new Date().toISOString(),
    message,
    ...data
  };
  // Write directly to stderr to ensure output is flushed immediately
  process.stderr.write(JSON.stringify(logEntry) + '\n');
};

// Log all relevant environment variables and config
logDebug('Environment variables and config', {
  AWS_REGION: process.env.AWS_REGION,
  DYNAMODB_ENDPOINT: process.env.DYNAMODB_ENDPOINT,
  DYNAMODB_LOCAL_ENDPOINT: process.env.DYNAMODB_LOCAL_ENDPOINT,
  DYNAMODB_ENDPOINT_URL: process.env.DYNAMODB_ENDPOINT_URL,
  DYNAMODB_LOCAL: process.env.DYNAMODB_LOCAL,
  NODE_ENV: process.env.NODE_ENV,
  TABLE_USERS: process.env.TABLE_USERS,
  EMAIL_INDEX: process.env.EMAIL_INDEX,
  IS_LOCAL: process.env.IS_LOCAL,
  // Log the actual endpoint being used
  DYNAMODB_ACTUAL_ENDPOINT: process.env.DYNAMODB_ENDPOINT_URL || process.env.DYNAMODB_LOCAL_ENDPOINT || process.env.DYNAMODB_ENDPOINT || 'http://host.docker.internal:8000',
  // Log the current working directory
  CWD: process.cwd(),
  // Log the files in the current directory
  FILES: require('fs').readdirSync('.'),
  // Log the files in the src directory
  SRC_FILES: require('fs').existsSync('./src') ? require('fs').readdirSync('./src') : 'No src directory',
  // Log the files in the node_modules directory
  NODE_MODULES: require('fs').existsSync('./node_modules') ? 'node_modules exists' : 'No node_modules directory'
});

// Simplified DynamoDB client configuration
const dynamoDbConfig = {
  region: 'us-west-2',
  endpoint: 'http://host.docker.internal:8000',
  sslEnabled: false,
  credentials: {
    accessKeyId: 'local',
    secretAccessKey: 'local',
  },
  maxRetries: 3,
  httpOptions: {
    connectTimeout: 5000,
    timeout: 10000
  }
};

// Log the DynamoDB configuration
console.error('DynamoDB Configuration:', JSON.stringify({
  region: dynamoDbConfig.region,
  endpoint: dynamoDbConfig.endpoint,
  sslEnabled: dynamoDbConfig.sslEnabled,
  tableName: 'SteadyStreakUsers',
  indexName: 'EmailIndex',
  env: {
    DYNAMODB_LOCAL: process.env.DYNAMODB_LOCAL,
    NODE_ENV: process.env.NODE_ENV,
    TABLE_USERS: process.env.TABLE_USERS,
    EMAIL_INDEX: process.env.EMAIL_INDEX
  }
}, null, 2));

// Create the DynamoDB client
const ddbClient = new DynamoDBClient(dynamoDbConfig);
const ddb = DynamoDBDocumentClient.from(ddbClient, {
  marshallOptions: {
    removeUndefinedValues: true,
    convertClassInstanceToMap: true,
  },
  unmarshallOptions: {
    wrapNumbers: false,
  },
});

// Test the DynamoDB connection
async function testDynamoDBConnection() {
  try {
    console.error('Testing DynamoDB connection...');
    const command = new QueryCommand({
      TableName: 'SteadyStreakUsers',
      IndexName: 'EmailIndex',
      KeyConditionExpression: 'email = :email',
      ExpressionAttributeValues: { ':email': 'test@example.com' },
      Limit: 1
    });
    
    const result = await ddb.send(command);
    console.error('DynamoDB connection test successful:', JSON.stringify(result, null, 2));
    return true;
  } catch (error) {
    console.error('DynamoDB connection test failed:', {
      error: error.message,
      code: error.code,
      stack: error.stack,
      time: new Date().toISOString()
    });
    return false;
  }
}

// Run the connection test when the module loads
testDynamoDBConnection().then(success => {
  console.error(`DynamoDB connection test ${success ? 'succeeded' : 'failed'}`);
});

const TABLE = process.env.TABLE_USERS; // SteadyStreakUsers
const EMAIL_INDEX = process.env.EMAIL_INDEX; // EmailIndex
const JWT_SECRET = process.env.JWT_SECRET; // strong secret
const REQUIRE_NONCE = process.env.REQUIRE_NONCE === "true";
const NONCE_TABLE = process.env.NONCE_TABLE; // your existing nonce table (optional)

export const signup = withCors(async (event) => {
  // Enhanced debug logging at the start of the function
  console.error('===== SIGNUP_HANDLER_START =====', new Date().toISOString());
  console.error('Event:', JSON.stringify(event, null, 2));
  console.error('Environment Variables:', {
    TABLE_USERS: process.env.TABLE_USERS,
    EMAIL_INDEX: process.env.EMAIL_INDEX,
    DYNAMODB_ENDPOINT: process.env.DYNAMODB_ENDPOINT,
    DYNAMODB_LOCAL: process.env.DYNAMODB_LOCAL,
    NODE_ENV: process.env.NODE_ENV,
    DYNAMODB_ENDPOINT_URL: process.env.DYNAMODB_ENDPOINT_URL,
    DYNAMODB_LOCAL_ENDPOINT: process.env.DYNAMODB_LOCAL_ENDPOINT,
    AWS_REGION: process.env.AWS_REGION,
    AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID ? '***' : undefined,
    AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY ? '***' : undefined,
    AWS_SESSION_TOKEN: process.env.AWS_SESSION_TOKEN ? '***' : undefined
  });
  
  console.error('DynamoDB Client Config:', JSON.stringify({
    region: dynamoDbConfig.region,
    endpoint: dynamoDbConfig.endpoint,
    sslEnabled: dynamoDbConfig.sslEnabled,
    credentials: dynamoDbConfig.credentials ? {
      accessKeyId: dynamoDbConfig.credentials.accessKeyId,
      secretAccessKey: dynamoDbConfig.credentials.secretAccessKey ? '***' : undefined
    } : undefined,
    maxRetries: dynamoDbConfig.maxRetries,
    httpOptions: dynamoDbConfig.httpOptions
  }, null, 2));
  
  // Log the actual table and index names being used
  const tableName = TABLE || 'SteadyStreakUsers';
  const indexName = EMAIL_INDEX || 'EmailIndex';
  console.error('Using Table:', tableName, 'Index:', indexName);
  
  try {
    // Verify nonce if required
    try {
      await verifyNonceIfRequired(event);
      console.error('Nonce verification passed');
    } catch (nonceError) {
      console.error('Nonce verification failed:', nonceError);
      return bad("Invalid or missing nonce", 400);
    }
    
    // Parse request body
    let body;
    try {
      body = json(event);
      console.error('Parsed request body:', JSON.stringify(body, null, 2));
    } catch (parseError) {
      console.error('Error parsing request body:', parseError);
      return bad("Invalid request body", 400);
    }
    
    // Validate required fields
    const { email, password, name } = body || {};
    console.error('Extracted fields:', { email: !!email, password: !!password, name: !!name });
    
    if (!email || !password || !name) {
      console.error('Missing required fields. Email, password, and name are required');
      return bad("email, password, and name are required", 400);
    }

    // Check if email already exists
    console.error(`===== CHECKING IF EMAIL EXISTS: ${email} =====`);
    let existing;
    try {
      const queryParams = {
        TableName: tableName,
        IndexName: indexName,
        KeyConditionExpression: "email = :e",
        ExpressionAttributeValues: { ":e": email.toLowerCase() },
        Limit: 1
      };
      
      console.error('Executing DynamoDB Query with params:', JSON.stringify(queryParams, null, 2));
      
      // Log the actual DynamoDB client state
      console.error('DynamoDB Client State:', {
        config: {
          region: ddb.config.region,
          endpoint: ddb.config.endpoint,
          credentials: ddb.config.credentials ? {
            accessKeyId: ddb.config.credentials.accessKeyId,
            secretAccessKey: ddb.config.credentials.secretAccessKey ? '***' : undefined
          } : undefined
        },
        tableName: tableName,
        indexName: indexName
      });
      
      // Execute the query
      const queryCommand = new QueryCommand(queryParams);
      console.error('Created QueryCommand, sending to DynamoDB...');
      
      existing = await ddb.send(queryCommand);
      console.error('DynamoDB Query Result:', JSON.stringify({
        Count: existing.Count,
        ScannedCount: existing.ScannedCount,
        Items: existing.Items ? existing.Items.length : 0,
        LastEvaluatedKey: existing.LastEvaluatedKey ? 'present' : 'not present'
      }, null, 2));
      
    } catch (queryError) {
      console.error('===== DYNAMODB QUERY ERROR =====');
      console.error('Error details:', {
        name: queryError.name,
        message: queryError.message,
        code: queryError.code,
        statusCode: queryError.$metadata?.httpStatusCode,
        requestId: queryError.$metadata?.requestId,
        tableName,
        indexName,
        endpoint: dynamoDbConfig.endpoint,
        region: dynamoDbConfig.region,
        time: new Date().toISOString(),
        stack: queryError.stack
      });
      
      // Try to get more details about the error
      if (queryError.name === 'ResourceNotFoundException') {
        console.error('The table or index was not found. Please check the following:');
        console.error(`1. Table name: ${tableName}`);
        console.error(`2. Index name: ${indexName}`);
        console.error('3. That the DynamoDB local instance is running and accessible');
        console.error('4. That the table and index exist in the local DynamoDB instance');
        
        // Try to list all tables to help with debugging
        try {
          const listTablesCommand = new ListTablesCommand({});
          const tables = await ddb.send(listTablesCommand);
          console.error('Available tables in local DynamoDB:', tables.TableNames || []);
          
          // If the table exists, try to describe it to see the indexes
          if (tables.TableNames && tables.TableNames.includes(tableName)) {
            const describeTableCommand = new DescribeTableCommand({ TableName: tableName });
            const tableInfo = await ddb.send(describeTableCommand);
            console.error(`Table ${tableName} details:`, {
              TableStatus: tableInfo.Table?.TableStatus,
              KeySchema: tableInfo.Table?.KeySchema,
              GlobalSecondaryIndexes: tableInfo.Table?.GlobalSecondaryIndexes?.map(idx => ({
                IndexName: idx.IndexName,
                KeySchema: idx.KeySchema,
                Projection: idx.Projection.ProjectionType
              })) || []
            });
          }
        } catch (descError) {
          console.error('Error getting table information:', descError);
        }
      }
      
      return bad("Error checking email availability", 500);
    }
    
    if (existing.Count && existing.Count > 0) {
      console.log(`Email already in use: ${email}`);
      return bad("Email already in use", 409);
    }

    // Create new user
    const userId = cryptoRandomId();
    const passwordHash = await bcrypt.hash(password, 10);
    const now = new Date().toISOString();
    const userItem = {
      userId,
      email: email.toLowerCase(),
      name,
      provider: "password",
      passwordHash,
      createdAt: now,
      updatedAt: now,
    };

    console.log('Creating user with data:', JSON.stringify(userItem, null, 2));
    
    try {
      await ddb.send(
        new PutCommand({
          TableName: TABLE,
          Item: userItem,
          ConditionExpression: "attribute_not_exists(userId)",
        })
      );
      console.log('User created successfully:', userId);
    } catch (putError) {
      console.error('Error creating user in DynamoDB:', putError);
      console.error('Table:', TABLE);
      return bad("Error creating user account", 500);
    }

    // Generate JWT token
    const token = makeJwt({
      userId,
      email: email.toLowerCase(),
      provider: "password",
    });
    
    console.log('User registered successfully:', { userId, email });
    return ok({ userId, token });
  } catch (error) {
    console.error('Unexpected error in signup handler:', error);
    return bad('An unexpected error occurred', 500);
  }
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
