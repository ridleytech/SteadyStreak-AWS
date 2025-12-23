// uses @aws-sdk/client-dynamodb and @aws-sdk/lib-dynamodb
import express from "express";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import jwt from "jsonwebtoken"; // validate "Bearer <token>"

const app = express();
app.use(express.json({ limit: "10mb" }));

const TableName = "SteadyStreakUsers";
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

app.post("/sync", async (req, res) => {
  try {
    const auth = req.get("authorization") || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
    if (!token) return res.status(401).json({ error: "Missing token" });

    const session = jwt.verify(token, process.env.JWT_SECRET); // { userId, email, provider }
    const payload = req.body; // ExportPayload

    // Save in same row (PK = userId). snapshot stores entire JSON.
    await ddb.send(
      new PutCommand({
        TableName,
        Item: {
          userId: session.userId,
          email: session.email ?? null,
          provider: session.provider ?? "password",
          updatedAt: new Date().toISOString(),
          snapshot: payload, // full JSON payload as a map
        },
      })
    );

    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});
