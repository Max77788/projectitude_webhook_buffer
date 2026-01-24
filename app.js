// server.js
import express from "express";
import { MongoClient } from "mongodb";
const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));

import dotenv from "dotenv";
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

const FWD_URL = process.env.FWD_URL || "https://example.com/endpoint";
const NEW_LEAD_URL = "https://projectitudekabeer.app.n8n.cloud/webhook/on-new-lead-came-in";

// 🔥 MONGO: connection setup
const MONGO_URI = process.env.MONGO_URI; // set this to your Mongo connection string
const MONGO_DB = "n8n-ai-agent-storage";
const MONGO_COLLECTION = "message_stashing";

let mongoClient;

async function initMongo() {
  if (!MONGO_URI) {
    console.error("⚠️ MONGO_URI not set in environment");
    return;
  }
  mongoClient = new MongoClient(MONGO_URI, { useUnifiedTopology: true });
  await mongoClient.connect();
  console.log("✅ Connected to MongoDB");
}

initMongo().catch((err) => {
  console.error("Mongo connection error:", err);
});

app.use(express.json());

app.post("/webhook", async (req, res) => {
  console.log("\n================= NEW WEBHOOK =================");
  console.log("Timestamp:", new Date().toISOString());

  const data = req.body;

  console.log("Raw body received:");
  console.dir(data, { depth: null });

  const event_type = data?.type;
  console.log("Event type:", event_type);

  const customerTraits = data?.data?.customer?.traits;
  console.log("Customer traits:", customerTraits);

  const rawMessage = data?.data?.message?.message;
  console.log("Raw message field:", rawMessage);
  console.log("Raw message type:", typeof rawMessage);

  let parsedMessage = null;
  if (typeof rawMessage === "string") {
    try {
      parsedMessage = JSON.parse(rawMessage);
      console.log("Parsed message JSON:", parsedMessage);
    } catch (e) {
      console.log("Message is plain text (not JSON)");
    }
  }

  const messageText =
    parsedMessage?.button_reply?.title ||
    rawMessage ||
    "";

  console.log("Normalized message text:", messageText);

  // 🔥 MONGO: lookup phone number
  let dbIsUseAIAgent = null;
  try {
    if (!!mongoClient) {
      const collection = mongoClient
        .db(MONGO_DB)
        .collection(MONGO_COLLECTION);

      const phoneNumber =
        data?.customer?.channel_phone_number ||
        data?.data?.customer?.channel_phone_number;

      console.log("Looking up phone number:", phoneNumber);

      if (phoneNumber) {
        const doc = await collection.findOne({
          phone_number: phoneNumber,
        });

        console.log("Mongo lookup result:", doc);

        if (doc && typeof doc.is_use_ai_agent !== "undefined") {
          dbIsUseAIAgent = doc?.is_use_ai_agent ?? false;
        }
      }
    }
  } catch (err) {
    console.error("Mongo lookup error:", err);
  }

  console.log("DB is_use_ai_agent:", dbIsUseAIAgent);

  const useAIAgentFromTrait =
    customerTraits?.["Use AI Agent"]?.toLowerCase?.() !== "no";

  // Decide AI use — database takes precedence if set
  const useAIAgent = useAIAgentFromTrait !== "no" && dbIsUseAIAgent;

  console.log("Final Use AI Agent flag:", useAIAgent);

  const shouldForward =
    event_type !== "message_received" || useAIAgent;

  console.log("Should forward to FWD_URL?", shouldForward);

  const is_send_on_new_lead_url =
    event_type === "workflow_response_update" &&
    data?.workflow_id ===
      "1a3654f6-313a-4245-9ced-f33df3644c8a";

  console.log("Trigger NEW_LEAD_URL?", is_send_on_new_lead_url);

  let first_forward_status = null;
  if (is_send_on_new_lead_url) {
    console.log("Sending payload to NEW_LEAD_URL:", NEW_LEAD_URL);
    try {
      const r = await fetch(NEW_LEAD_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(data),
      });
      first_forward_status = r.status;
      console.log("NEW_LEAD_URL response status:", r.status);
    } catch (err) {
      console.error("NEW_LEAD_URL forward error:", err);
      first_forward_status = "error";
    }
  }

  let forwardStatus = null;
  if (shouldForward && !is_send_on_new_lead_url) {
    console.log("Sending payload to FWD_URL:", FWD_URL);
    try {

      await new Promise(resolve => setTimeout(resolve, 3000));
      
      const r = await fetch(FWD_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(data),
      });
      forwardStatus = r.status;
      console.log("FWD_URL response status:", r.status);
    } catch (err) {
      console.error("FWD_URL forward error:", err);
      forwardStatus = "error";
    }
  } else {
    console.log("Skipping forward to FWD_URL");
  }

  console.log("Final response payload:");
  console.log({
    ok: true,
    forwarded: shouldForward,
    forwardStatus,
    first_forward_status,
  });

  console.log("=============== END WEBHOOK =================\n");

  res.json({
    ok: true,
    forwarded: shouldForward,
    forwardStatus,
    first_forward_status,
  });
});

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
