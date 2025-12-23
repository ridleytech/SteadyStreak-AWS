# SteadyStreak API Documentation

This document provides comprehensive documentation for the SteadyStreak API, including available endpoints, request/response formats, and local testing instructions.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Local Development Setup](#local-development-setup)
- [API Endpoints](#api-endpoints)
  - [Authentication](#authentication)
    - [User Signup](#user-signup)
    - [User Login](#user-login)
    - [Google OAuth](#google-oauth)
  - [Sync](#sync-data)
  - [Protected Routes](#protected-routes)
    - [Get Protected Data](#get-protected-data)
    - [Update Protected Data](#update-protected-data)
    - [Generate Plan](#generate-plan)
  - [App Attestation](#app-attestation)
    - [Get Nonce](#get-nonce)
    - [Register Device](#register-device)
- [Testing with SAM Local](#testing-with-sam-local)

## Prerequisites

- AWS SAM CLI
- Node.js 20.x
- Docker (for local DynamoDB and Lambda execution)
- AWS CLI configured with appropriate credentials

## Local Development Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Start local DynamoDB (if needed):

   ```bash
   docker run -p 8000:8000 amazon/dynamodb-local
   ```

3. Create local tables (run in a separate terminal):

   ```bash
   aws dynamodb create-table --table-name SteadyStreakUsers \
     --attribute-definitions AttributeName=userId,AttributeType=S \
     --key-schema AttributeName=userId,KeyType=HASH \
     --billing-mode PAY_PER_REQUEST \
     --endpoint-url http://localhost:8000
   ```

4. Build and start the local API:
   ```bash
   sam build
   sam local start-api --env-vars env.json --docker-network host
   ```

The API will be available at `http://127.0.0.1:3000`

## API Endpoints

### Authentication

#### User Signup

Create a new user account.

```bash
curl -X POST http://127.0.0.1:3000/users/signup \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "securePassword123",
    "name": "John Doe"
  }'
```

**Response:**

```json
{
  "userId": "123e4567-e89b-12d3-a456-426614174000",
  "email": "user@example.com",
  "name": "John Doe",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

#### User Login

Authenticate and receive a JWT token.

```bash
curl -X POST http://127.0.0.1:3000/users/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "securePassword123"
  }'
```

**Response:**

```json
{
  "userId": "123e4567-e89b-12d3-a456-426614174000",
  "email": "user@example.com",
  "name": "John Doe",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

#### Google OAuth

Authenticate with Google OAuth.

```bash
curl -X POST http://127.0.0.1:3000/users/google \
  -H "Content-Type: application/json" \
  -d '{
    "idToken": "google_id_token_here"
  }'
```

**Response:**

```json
{
  "userId": "123e4567-e89b-12d3-a456-426614174000",
  "email": "user@example.com",
  "name": "John Doe",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

### Sync Data

Synchronize user data across devices.

```bash
curl -X POST http://127.0.0.1:3000/sync \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "lastSyncTime": "2025-09-01T12:00:00Z",
    "data": {}
  }'
```

**Response:**

```json
{
  "success": true,
  "lastSyncTime": "2025-09-01T18:30:00Z",
  "data": {}
}
```

### Protected Routes

#### Get Protected Data

Retrieve protected user data.

```bash
curl -X GET http://127.0.0.1:3000/protected \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Response:**

```json
{
  "userId": "123e4567-e89b-12d3-a456-426614174000",
  "data": {}
}
```

#### Update Protected Data

Update protected user data.

```bash
curl -X POST http://127.0.0.1:3000/protected \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"key": "value"}'
```

**Response:**

```json
{
  "success": true,
  "message": "Data updated successfully"
}
```

#### Generate Plan

Generate a plan using OpenAI.

```bash
curl -X POST http://127.0.0.1:3000/protected/plan \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "goal": "Lose weight",
    "preferences": {
      "diet": "vegetarian",
      "exercise": "3 times per week"
    }
  }'
```

**Response:**

```json
{
  "plan": {
    "goal": "Lose weight",
    "weeklyPlan": [
      {
        "day": "Monday",
        "breakfast": "Oatmeal with berries",
        "lunch": "Quinoa salad",
        "dinner": "Grilled vegetables with tofu",
        "exercise": "30 min cardio"
      }
    ]
  }
}
```

### App Attestation

#### Get Nonce

Get a nonce for device attestation.

```bash
curl -X GET "http://127.0.0.1:3000/nonce?purpose=request"
```

**Response:**

```json
{
  "nonce": "a1b2c3d4e5f6g7h8i9j0",
  "expiresIn": 300
}
```

#### Register Device

Register a new device with app attestation.

```bash
curl -X POST http://127.0.0.1:3000/register \
  -H "Content-Type: application/json" \
  -d '{
    "keyId": "ABC123",
    "publicKeyPem": "-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----\n",
    "attestation": "base64_attestation_data"
  }'
```

**Response:**

```json
{
  "success": true,
  "deviceId": "device_123456"
}
```

## Testing with SAM Local

### Start the Local API

```bash
sam build
sam local start-api --env-vars env.json --docker-network host
```

### Invoke a Specific Function

To test a specific Lambda function directly:

```bash
# Test Users function (signup)
echo '{"email":"test@example.com","password":"password123","name":"Test User"}' | \
sam local invoke UsersFn -e - --env-vars env.json

# Test Sync function
echo '{"lastSyncTime":"2025-09-01T12:00:00Z","data":{}}' | \
sam local invoke SyncFn -e - --env-vars env.json

# Test Protected function (get)
echo '{}' | \
sam local invoke ProtectedFn -e - --env-vars env.json
```

### Testing with Authentication

For protected routes, you'll need to include the JWT token:

```bash
# First, get a token
TOKEN=$(curl -s -X POST http://127.0.0.1:3000/users/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}' | jq -r '.token')

# Use the token in subsequent requests
curl -X GET http://127.0.0.1:3000/protected \
  -H "Authorization: Bearer $TOKEN"
```

## Environment Variables

Update `env.json` with your local development environment variables. See `env.example.json` for reference.

## Troubleshooting

- If you get CORS errors, ensure `CORS_ORIGIN` is set correctly in your environment
- For DynamoDB connection issues, verify your local DynamoDB is running and accessible
- Check SAM CLI logs for detailed error messages
- Ensure all required environment variables are set in `env.json`
