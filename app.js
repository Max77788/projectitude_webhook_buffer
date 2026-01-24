// server.js
import express from "express";
const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));

import dotenv from "dotenv";
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

const FWD_URL = process.env.FWD_URL || "https://example.com/endpoint";
const NEW_LEAD_URL = "https://projectitudekabeer.app.n8n.cloud/webhook/on-new-lead-came-in";

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

  // Attempt to parse message if it's JSON
  let parsedMessage = null;
  if (typeof rawMessage === "string") {
    try {
      parsedMessage = JSON.parse(rawMessage);
      console.log("Parsed message JSON:", parsedMessage);
    } catch (e) {
      console.log("Message is plain text (not JSON)");
    }
  }

  // Normalize message text
  const messageText =
    parsedMessage?.button_reply?.title ||
    rawMessage ||
    "";

  console.log("Normalized message text:", messageText);

  // AI Agent flag (safe access)
  const useAIAgent =
    customerTraits?.["Use AI Agent"]?.toLowerCase?.() === "yes";

  console.log("Use AI Agent flag:", useAIAgent);

  // Forwarding logic
  const shouldForward =
    event_type !== "message_received" || useAIAgent;

  console.log("Should forward to FWD_URL?", shouldForward);

  /* New lead condition
  const is_send_on_new_lead_url =
    typeof messageText === "string" &&
    messageText.toLowerCase().trim() === "hello! can i get more info on this?";
    */

  const is_send_on_new_lead_url = event_type === "workflow_response_update" && data?.workflow_id === "1a3654f6-313a-4245-9ced-f33df3644c8a";

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

  if (shouldForward) {
    console.log("Sending payload to FWD_URL:", FWD_URL);
    try {
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
