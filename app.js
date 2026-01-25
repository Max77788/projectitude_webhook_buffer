import express from "express";
import { MongoClient } from "mongodb";
import dotenv from "dotenv";

dotenv.config();

const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));

const app = express();
app.use(express.json());

/* ===================== CONFIG ===================== */

console.log("🔧 Booting webhook server...");

const FWD_URL = process.env.FWD_URL || "https://example.com/endpoint";
const NEW_LEAD_URL =
  "https://projectitudekabeer.app.n8n.cloud/webhook/on-new-lead-came-in";

const MONGO_URI = process.env.MONGO_URI;
const MONGO_DB = "n8n-ai-agent-storage";
const MONGO_COLLECTION = "message_stashing";

console.log("🔧 Config loaded:");
console.log({
  hasMongoUri: !!MONGO_URI,
  FWD_URL,
  NEW_LEAD_URL,
});

/* ===================== MONGO (SERVERLESS SAFE) ===================== */

function getMongoClient() {
  if (!MONGO_URI) {
    console.warn("⚠️ MONGO_URI is not set");
    return null;
  }

  if (!global._mongoClientPromise) {
    console.log("🟡 Creating new MongoClient...");
    const client = new MongoClient(MONGO_URI);
    global._mongoClientPromise = client
      .connect()
      .then(() => {
        console.log("✅ MongoDB connected");
        return client;
      })
      .catch((err) => {
        console.error("❌ MongoDB connection failed:", err);
        global._mongoClientPromise = null;
        throw err;
      });
  } else {
    console.log("♻️ Reusing existing MongoClient");
  }

  return global._mongoClientPromise;
}

/* ===================== WEBHOOK ===================== */

app.post("/webhook", async (req, res) => {
  console.log("\n================= NEW WEBHOOK =================");
  console.log("🕒 Timestamp:", new Date().toISOString());

  const data = req.body;
  console.log("📦 Raw payload:");
  console.dir(data, { depth: null });

  const event_type = data?.type;
  console.log("📌 Event type:", event_type);

  const customerTraits = data?.data?.customer?.traits;
  console.log("👤 Customer traits:", customerTraits);

  /* ---------- Message normalization ---------- */

  const rawMessage = data?.data?.message?.message;
  console.log("💬 Raw message:", rawMessage);
  console.log("💬 Raw message type:", typeof rawMessage);

  let parsedMessage = null;
  if (typeof rawMessage === "string") {
    try {
      parsedMessage = JSON.parse(rawMessage);
      console.log("🧩 Parsed message JSON:", parsedMessage);
    } catch (err) {
      console.log("📝 Message is plain text (not JSON)");
    }
  }

  const messageText =
    parsedMessage?.button_reply?.title ||
    rawMessage ||
    "";

  console.log("🧠 Normalized message text:", messageText);

  /* ---------- Mongo lookup ---------- */

  let dbIsUseAIAgent = null;

  try {
    console.log("🔍 Attempting Mongo lookup...");
    const client = await getMongoClient();

    if (!client) {
      console.warn("⚠️ Mongo client unavailable");
    } else {
      const collection = client
        .db(MONGO_DB)
        .collection(MONGO_COLLECTION);

      const phoneNumber =
        data?.customer?.channel_phone_number ||
        data?.data?.customer?.channel_phone_number;

      console.log("📞 Phone number for lookup:", phoneNumber);

      if (phoneNumber) {
        const doc = await collection.findOne({
          phone_number: phoneNumber,
        });

        console.log("📄 Mongo document found:", doc);

        if (typeof doc?.is_use_ai_agent === "boolean") {
          dbIsUseAIAgent = doc.is_use_ai_agent;
        }
      } else {
        console.log("⚠️ No phone number found in payload");
      }
    }
  } catch (err) {
    console.error("❌ Mongo lookup error:", err);
  }

  console.log("🧮 DB is_use_ai_agent:", dbIsUseAIAgent);

  /* ---------- AI Agent decision ---------- */

  const traitAllowsAI =
    customerTraits?.["Use AI Agent"]?.toLowerCase?.() !== "no";

  console.log("🧬 Trait allows AI:", traitAllowsAI);

  const useAIAgent =
    typeof dbIsUseAIAgent === "boolean"
      ? dbIsUseAIAgent
      : traitAllowsAI;

  console.log("🤖 Final Use AI Agent:", useAIAgent);

  const shouldForward =
    event_type !== "message_received" || useAIAgent;

  console.log("📤 Should forward to FWD_URL:", shouldForward);

  /* ---------- New lead logic ---------- */

  const source_ids = ["826392220374062"];
  console.log("🔗 Source IDs:", source_ids);

  const is_send_on_new_lead_url =
    source_ids.includes(customerTraits?.source_id) &&
    dbIsUseAIAgent === false;

  console.log(
    "🚀 Trigger NEW_LEAD_URL:",
    is_send_on_new_lead_url
  );

  /* ---------- Forwarding ---------- */

  let first_forward_status = null;
  let forwardStatus = null;

  if (is_send_on_new_lead_url) {
    console.log("➡️ Sending payload to NEW_LEAD_URL");
    try {
      const r = await fetch(NEW_LEAD_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(data),
      });
      first_forward_status = r.status;
      console.log(
        "✅ NEW_LEAD_URL response status:",
        r.status
      );
    } catch (err) {
      console.error("❌ NEW_LEAD_URL error:", err);
      first_forward_status = "error";
    }
  }

  if (shouldForward && !is_send_on_new_lead_url) {
    console.log("⏳ Waiting 3 seconds before forwarding...");
    try {
      await new Promise((r) => setTimeout(r, 3000));

      console.log("➡️ Sending payload to FWD_URL:", FWD_URL);
      const r = await fetch(FWD_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(data),
      });
      forwardStatus = r.status;
      console.log(
        "✅ FWD_URL response status:",
        r.status
      );
    } catch (err) {
      console.error("❌ FWD_URL error:", err);
      forwardStatus = "error";
    }
  } else {
    console.log("⏭️ Skipping FWD_URL");
  }

  console.log("📦 Final response payload:");
  console.log({
    ok: true,
    forwarded: shouldForward,
    is_send_on_new_lead_url,
    forwardStatus,
    first_forward_status,
  });

  console.log("=============== END WEBHOOK =================\n");

  res.json({
    ok: true,
    forwarded: shouldForward,
    is_send_on_new_lead_url,
    forwardStatus,
    first_forward_status,
  });
});

/* ===================== EXPORT ===================== */

export default app;

// Local dev only
if (process.env.NODE_ENV !== "production") {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(
      `🚀 Server running locally on http://localhost:${PORT}`
    );
  });
}
