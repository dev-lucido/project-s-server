// import express from "express";
// import cors from "cors";
// import dotenv from "dotenv";
// import fs from "fs";
// import multer from "multer";
// import { GoogleGenerativeAI } from "@google/generative-ai";
// import { GoogleAIFileManager } from "@google/generative-ai/server";

// dotenv.config();

// const app = express();
// app.use(cors());
// app.use(express.json());

// // Ensure storage folder exists
// if (!fs.existsSync("storage/")) {
//   fs.mkdirSync("storage/");
// }
// // Ensure files.json exists
// if (!fs.existsSync("./files.json")) {
//   fs.writeFileSync("./files.json", JSON.stringify({ EduBot: [], LexBot: [] }));
// }

// const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GENERATIVE_AI_API_KEY);
// const fileManager = new GoogleAIFileManager(
//   process.env.GOOGLE_GENERATIVE_AI_API_KEY,
// );

// // Setup Multer
// const upload = multer({ dest: "storage/" });

// // --- HELPER: SYNC FILES TO GOOGLE ---
// async function getActiveFileUris(botName) {
//   const data = JSON.parse(fs.readFileSync("./files.json", "utf-8"));
//   const files = data[botName] || [];
//   const activeFiles = [];

//   for (let file of files) {
//     const isExpired = Date.now() > (file.expiresAt || 0);

//     if (!file.lastUri || isExpired) {
//       console.log(`🔄 Syncing ${file.name} to Google AI...`);
//       try {
//         const uploadResult = await fileManager.uploadFile(file.path, {
//           mimeType: "application/pdf",
//           displayName: file.name,
//         });

//         file.lastUri = uploadResult.file.uri;
//         file.expiresAt = Date.now() + 40 * 60 * 60 * 1000; // 40 hours
//       } catch (error) {
//         console.error(`Error uploading ${file.name}:`, error);
//         continue;
//       }
//     }
//     activeFiles.push({ uri: file.lastUri, mime: "application/pdf" });
//   }

//   fs.writeFileSync("./files.json", JSON.stringify(data, null, 2));
//   return activeFiles;
// }

// // --- ADMIN ROUTES ---

// app.post("/admin/upload", upload.single("pdf"), (req, res) => {
//   const { botName } = req.body;
//   if (!req.file || !botName)
//     return res.status(400).send("Missing file or botName");

//   const registry = JSON.parse(fs.readFileSync("./files.json", "utf-8"));
//   const newFile = {
//     name: req.file.originalname,
//     path: req.file.path,
//     lastUri: null,
//     expiresAt: 0,
//   };

//   registry[botName].push(newFile);
//   fs.writeFileSync("./files.json", JSON.stringify(registry, null, 2));
//   res.json({ message: `File added to ${botName} permanently.` });
// });

// app.post("/admin/delete", (req, res) => {
//   const { botName, fileName } = req.body;
//   try {
//     const registry = JSON.parse(fs.readFileSync("./files.json", "utf-8"));
//     const fileIndex = registry[botName].findIndex((f) => f.name === fileName);

//     if (fileIndex !== -1) {
//       const fileInfo = registry[botName][fileIndex];
//       if (fs.existsSync(fileInfo.path)) fs.unlinkSync(fileInfo.path);

//       registry[botName].splice(fileIndex, 1);
//       fs.writeFileSync("./files.json", JSON.stringify(registry, null, 2));
//       return res.json({ message: "Deleted successfully." });
//     }
//     res.status(404).send("File not found.");
//   } catch (err) {
//     res.status(500).send("Delete failed.");
//   }
// });

// app.get("/admin/files", (req, res) => {
//   const registry = JSON.parse(fs.readFileSync("./files.json", "utf-8"));
//   const enhanced = {};
//   for (const bot in registry) {
//     enhanced[bot] = registry[bot].map((f) => ({
//       ...f,
//       status: !f.lastUri
//         ? "New"
//         : Date.now() > f.expiresAt
//           ? "Expired"
//           : "Active",
//     }));
//   }
//   res.json(enhanced);
// });

// // --- CHAT ROUTE ---

// app.post("/v1/chat/completions", async (req, res) => {
//   res.setHeader("Content-Type", "text/event-stream");
//   res.setHeader("Cache-Control", "no-cache");
//   res.setHeader("Connection", "keep-alive");

//   try {
//     const { messages = [], systemPrompt } = req.body;
//     const botName = systemPrompt.includes("EduBot") ? "EduBot" : "LexBot";
//     const botFiles = await getActiveFileUris(botName);

//     // 1. Fix: Filter history and ensure it starts with a USER message
//     const filteredMessages = messages.filter(
//       (m) => m.role === "user" || m.role === "assistant",
//     );
//     const firstUserIndex = filteredMessages.findIndex((m) => m.role === "user");

//     // We slice from the first user message, excluding the very last message (which is the current prompt)
//     const historySlice =
//       firstUserIndex !== -1 ? filteredMessages.slice(firstUserIndex, -1) : [];

//     const chatHistory = historySlice.map((m) => ({
//       role: m.role === "user" ? "user" : "model",
//       parts: [{ text: m.content }],
//     }));

//     const model = genAI.getGenerativeModel(
//       {
//         model: "gemini-2.5-flash",
//         // model: "gemini-1.5-flash-latest",
//         // model: "gemini-1.5-flash-002",

//         systemInstruction: systemPrompt,
//       },
//       { apiVersion: "v1beta" },
//     );

//     const chat = model.startChat({ history: chatHistory });
//     const userMessage = messages[messages.length - 1].content;

//     // 2. Build Multi-Part Payload (Files + Text)
//     const payload = [
//       ...botFiles.map((f) => ({
//         fileData: { mimeType: f.mime, fileUri: f.uri },
//       })),
//       { text: userMessage },
//     ];

//     const result = await chat.sendMessageStream(payload);

//     for await (const chunk of result.stream) {
//       const text = chunk.text();
//       if (!text) continue;
//       res.write(
//         `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`,
//       );
//     }

//     res.write("data: [DONE]\n\n");
//     res.end();
//   } catch (err) {
//     console.error("Chat Error:", err);
//     res.end();
//   }
// });

// // Health check
// app.get("/health", (_, res) => res.json({ status: "ok" }));

// const PORT = process.env.PORT || 3000;
// app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));

import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import multer from "multer";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { GoogleAIFileManager } from "@google/generative-ai/server";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

if (!fs.existsSync("storage/")) fs.mkdirSync("storage/");
if (!fs.existsSync("./files.json")) {
  fs.writeFileSync("./files.json", JSON.stringify({ EduBot: [], LexBot: [] }));
}

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GENERATIVE_AI_API_KEY);
const fileManager = new GoogleAIFileManager(
  process.env.GOOGLE_GENERATIVE_AI_API_KEY,
);

const upload = multer({ dest: "storage/" });

// ─── MIME type helper ─────────────────────────────────────────────────────────

const SUPPORTED_MIME_TYPES = {
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".heic": "image/heic",
  ".heif": "image/heif",
};

function getMimeType(filename) {
  const ext = path.extname(filename).toLowerCase();
  return SUPPORTED_MIME_TYPES[ext] ?? null;
}

// ─── Sync files to Google AI ──────────────────────────────────────────────────

async function getActiveFileUris(botName) {
  const data = JSON.parse(fs.readFileSync("./files.json", "utf-8"));
  const files = data[botName] || [];
  const activeFiles = [];

  for (const file of files) {
    const isExpired = Date.now() > (file.expiresAt || 0);

    if (!file.lastUri || isExpired) {
      console.log(`🔄 Syncing ${file.name} to Google AI...`);
      try {
        const uploadResult = await fileManager.uploadFile(file.path, {
          mimeType: file.mimeType,
          displayName: file.name,
        });
        file.lastUri = uploadResult.file.uri;
        file.expiresAt = Date.now() + 40 * 60 * 60 * 1000; // 40 hours
      } catch (error) {
        console.error(`Error uploading ${file.name}:`, error);
        continue;
      }
    }
    activeFiles.push({ uri: file.lastUri, mime: file.mimeType });
  }

  fs.writeFileSync("./files.json", JSON.stringify(data, null, 2));
  return activeFiles;
}

// ─── Admin routes ─────────────────────────────────────────────────────────────

app.post("/admin/upload", upload.single("file"), (req, res) => {
  const { botName } = req.body;
  if (!req.file || !botName)
    return res.status(400).send("Missing file or botName");

  const mimeType = getMimeType(req.file.originalname);
  if (!mimeType) {
    fs.unlinkSync(req.file.path);
    return res.status(400).send("Unsupported file type.");
  }

  const registry = JSON.parse(fs.readFileSync("./files.json", "utf-8"));
  registry[botName].push({
    name: req.file.originalname,
    path: req.file.path,
    mimeType,
    lastUri: null,
    expiresAt: 0,
  });
  fs.writeFileSync("./files.json", JSON.stringify(registry, null, 2));
  res.json({ message: `File added to ${botName} permanently.` });
});

app.post("/admin/delete", (req, res) => {
  const { botName, fileName } = req.body;
  try {
    const registry = JSON.parse(fs.readFileSync("./files.json", "utf-8"));
    const idx = registry[botName].findIndex((f) => f.name === fileName);
    if (idx === -1) return res.status(404).send("File not found.");

    const fileInfo = registry[botName][idx];
    if (fs.existsSync(fileInfo.path)) fs.unlinkSync(fileInfo.path);
    registry[botName].splice(idx, 1);
    fs.writeFileSync("./files.json", JSON.stringify(registry, null, 2));
    res.json({ message: "Deleted successfully." });
  } catch {
    res.status(500).send("Delete failed.");
  }
});

app.get("/admin/files", (_, res) => {
  const registry = JSON.parse(fs.readFileSync("./files.json", "utf-8"));
  const enhanced = {};
  for (const bot in registry) {
    enhanced[bot] = registry[bot].map((f) => ({
      ...f,
      status: !f.lastUri
        ? "New"
        : Date.now() > f.expiresAt
          ? "Expired"
          : "Active",
    }));
  }
  res.json(enhanced);
});

// ─── Chat route ───────────────────────────────────────────────────────────────

app.post("/v1/chat/completions", async (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  try {
    const { messages = [], systemPrompt } = req.body;
    // const botName  = systemPrompt.includes("EduBot") ? "EduBot" : "LexBot";
    let botName = "EduBot";
    if (systemPrompt.includes("LexBot")) botName = "LexBot";
    if (systemPrompt.includes("CareerBot")) botName = "CareerBot";
    const botFiles = await getActiveFileUris(botName);

    const filteredMessages = messages.filter(
      (m) => m.role === "user" || m.role === "assistant",
    );
    const firstUserIndex = filteredMessages.findIndex((m) => m.role === "user");
    const historySlice =
      firstUserIndex !== -1 ? filteredMessages.slice(firstUserIndex, -1) : [];

    const chatHistory = historySlice.map((m) => ({
      role: m.role === "user" ? "user" : "model",
      parts: [{ text: m.content }],
    }));

    const model = genAI.getGenerativeModel(
      {
        model: "gemini-2.5-flash",
        systemInstruction: systemPrompt, // Add generationConfig to allow longer responses
        generationConfig: {
          maxOutputTokens: 2048, // Increase this if the report is very long
          temperature: 0.7, // Helps with the "vivid/cinematic" descriptions
        },
      },
      { apiVersion: "v1beta" },
    );

    const chat = model.startChat({ history: chatHistory });
    const userMessage = messages[messages.length - 1].content;

    const payload = [
      ...botFiles.map((f) => ({
        fileData: { mimeType: f.mime, fileUri: f.uri },
      })),
      { text: userMessage },
    ];

    const result = await chat.sendMessageStream(payload);

    for await (const chunk of result.stream) {
      // Check if the stream was flagged or blocked
      if (
        chunk.candidates?.[0]?.finishReason === "SAFETY" ||
        chunk.candidates?.[0]?.finishReason === "OTHER"
      ) {
        console.warn(
          "Stream stopped early due to:",
          chunk.candidates[0].finishReason,
        );
        break;
      }

      const text = chunk.text();
      if (!text) continue;
      res.write(
        `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`,
      );
    }

    res.write("data: [DONE]\n\n");
    res.end();
  } catch (err) {
    console.error("Chat Error:", err);
    res.end();
  }
});

app.get("/health", (_, res) => res.json({ status: "ok" }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
