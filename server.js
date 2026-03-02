import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { GoogleGenerativeAI } from "@google/generative-ai";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GENERATIVE_AI_API_KEY);

// Preflight
app.options("/v1/chat/completions", (_, res) => res.sendStatus(204));

app.post("/v1/chat/completions", async (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  try {
    const { messages = [], language = "en", systemPrompt } = req.body;

    // Use client-provided system prompt, or fall back to a default
    const resolvedSystemPrompt = systemPrompt?.trim()
      ? systemPrompt
      : `You are EduBot, a helpful educational assistant. Respond in a clear, supportive, and student-friendly way.`;

    // Keep ONLY user/assistant messages
    const filtered = messages.filter(
      (m) => m.role === "user" || m.role === "assistant",
    );

    // Ensure first message is USER
    const safeHistory = filtered.slice(
      filtered.findIndex((m) => m.role === "user"),
    );

    // Convert to Gemini format
    const chatHistory = safeHistory.map((m) => ({
      role: m.role === "user" ? "user" : "model",
      parts: [{ text: m.content }],
    }));

    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash-lite",
      systemInstruction: resolvedSystemPrompt,
    });

    const chat = model.startChat({
      history: chatHistory,
      generationConfig: {
        temperature: 0.5,
        maxOutputTokens: 600,
      },
    });

    const result = await chat.sendMessageStream("");

    for await (const chunk of result.stream) {
      const text = chunk.text();
      if (!text) continue;

      res.write(
        `data: ${JSON.stringify({
          choices: [{ delta: { content: text } }],
        })}\n\n`,
      );
    }

    res.write("data: [DONE]\n\n");
    res.end();
  } catch (err) {
    console.error(err);
    res.end();
  }
});

// Health check
app.get("/health", (_, res) => {
  res.json({
    status: "ok",
    message: "EduBot Gemini server running ✅",
    timestamp: new Date(),
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ EduBot server running on port ${PORT}`));