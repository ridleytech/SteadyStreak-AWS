const { DynamoDBClient, ListTablesCommand } = require('@aws-sdk/client-dynamodb');

async function testConnection() {
  const config = {
    region: 'us-west-2',
    endpoint: 'http://host.docker.internal:8000',
    sslEnabled: false,
    credentials: {
      accessKeyId: 'local',
      secretAccessKey: 'local',
    },
  };

  const client = new DynamoDBClient(config);
  
  try {
    console.log('Attempting to list tables...');
    const command = new ListTablesCommand({});
    const response = await client.send(command);
    console.log('Successfully connected to DynamoDB');
    console.log('Tables:', response.TableNames);
    return response;
  } catch (error) {
    console.error('Error connecting to DynamoDB:', error);
    throw error;
  }
}

testConnection()
  .then(() => console.log('Test completed'))
  .catch(err => console.error('Test failed:', err));
