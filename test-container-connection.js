const { DynamoDBClient, ListTablesCommand } = require("@aws-sdk/client-dynamodb");
const { NodeHttpHandler } = require("@aws-sdk/node-http-handler");
const http = require('http');

// Configuration for the DynamoDB client
const config = {
  region: 'us-west-2', // Default region, can be overridden by environment
  endpoint: 'http://host.docker.internal:8000',
  sslEnabled: false,
  credentials: {
    accessKeyId: 'local',
    secretAccessKey: 'local',
  },
  maxRetries: 3,
  requestHandler: new NodeHttpHandler({
    connectionTimeout: 5000,
    socketTimeout: 10000,
  })
};

// Create a new DynamoDB client
const client = new DynamoDBClient(config);

// Test function to check connectivity and list tables
async function testConnection() {
  console.error('===== STARTING CONNECTION TEST =====');
  console.error('Configuration:', JSON.stringify({
    region: config.region,
    endpoint: config.endpoint,
    sslEnabled: config.sslEnabled,
    credentials: config.credentials ? {
      accessKeyId: config.credentials.accessKeyId,
      secretAccessKey: config.credentials.secretAccessKey ? '***' : undefined
    } : undefined
  }, null, 2));

  try {
    // Test HTTP connection to the endpoint
    console.error('Testing HTTP connection to', config.endpoint);
    await new Promise((resolve, reject) => {
      const url = new URL(config.endpoint);
      const req = http.request({
        hostname: url.hostname,
        port: url.port || 80,
        path: '/',
        method: 'HEAD',
        timeout: 5000
      }, (res) => {
        console.error(`HTTP ${res.statusCode} ${res.statusMessage}`);
        res.resume();
        resolve();
      });
      
      req.on('error', (e) => {
        console.error('HTTP connection error:', e.message);
        reject(e);
      });
      
      req.on('timeout', () => {
        req.destroy(new Error('HTTP request timed out'));
      });
      
      req.end();
    });
    
    console.error('HTTP connection test passed');
    
    // Test DynamoDB ListTables command
    console.error('Executing ListTables command...');
    const command = new ListTablesCommand({});
    const response = await client.send(command);
    
    console.error('ListTables command successful');
    console.error('Tables found:', response.TableNames || []);
    
    // If tables exist, try to describe the SteadyStreakUsers table
    if (response.TableNames && response.TableNames.includes('SteadyStreakUsers')) {
      console.error('\nFound SteadyStreakUsers table, checking indexes...');
      try {
        const { DynamoDBClient: DDBClient, DescribeTableCommand } = require("@aws-sdk/client-dynamodb");
        const ddbClient = new DDBClient(config);
        const describeCmd = new DescribeTableCommand({ TableName: 'SteadyStreakUsers' });
        const tableInfo = await ddbClient.send(describeCmd);
        
        console.error('SteadyStreakUsers table details:', {
          TableStatus: tableInfo.Table.TableStatus,
          KeySchema: tableInfo.Table.KeySchema,
          GlobalSecondaryIndexes: tableInfo.Table.GlobalSecondaryIndexes?.map(idx => ({
            IndexName: idx.IndexName,
            KeySchema: idx.KeySchema,
            Projection: idx.Projection.ProjectionType
          })) || []
        });
      } catch (descError) {
        console.error('Error describing SteadyStreakUsers table:', descError);
      }
    }
    
    console.error('\n===== CONNECTION TEST COMPLETED SUCCESSFULLY =====');
    return true;
  } catch (error) {
    console.error('\n===== CONNECTION TEST FAILED =====');
    console.error('Error:', error);
    
    if (error.name === 'ResourceInUseException' || error.name === 'ResourceNotFoundException') {
      console.error('\nDynamoDB Error Details:', {
        name: error.name,
        message: error.message,
        code: error.code,
        statusCode: error.$metadata?.httpStatusCode,
        requestId: error.$metadata?.requestId,
        time: new Date().toISOString()
      });
    }
    
    console.error('\nTroubleshooting Tips:');
    console.error('1. Ensure DynamoDB Local is running and accessible at', config.endpoint);
    console.error('2. Check that the container can reach the host machine (use host.docker.internal)');
    console.error('3. Verify that the table and indexes exist in the local DynamoDB instance');
    console.error('4. Check for any network/firewall issues between the container and host');
    
    return false;
  }
}

// Run the test
testConnection()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(err => {
    console.error('Unhandled error in test:', err);
    process.exit(1);
  });
