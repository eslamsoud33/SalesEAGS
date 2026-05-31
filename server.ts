import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;

  app.use(express.json());

  // API route for Gemini chat
  app.post("/api/gemini/chat", async (req, res) => {
    try {
      const { systemInstruction, history, message } = req.body;
      
      const ai = new GoogleGenAI({
        apiKey: process.env.GEMINI_API_KEY,
        httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
      });

      const chat = ai.chats.create({
        model: "gemini-2.5-flash",
        config: {
          systemInstruction: systemInstruction || "You are a helpful assistant.",
        },
      });

      // Prepare history. In @google/genai we can't seed the chat history directly into create() with this exact format if it doesn't match the required type exactly (many users just send message by message or use `history` config).
      // Wait, let's look at the gemini-api skill: `chat.sendMessage` only accepts the `message` parameter. If we need history we have to initialize `history` inside `config.history` or something? Wait, let's use `ai.models.generateContent` with multiple parts, or just use it simply.
      // Wait! I can just use `generateContent` with a formatted prompt containing the history to be safe and simple, or `generateContent` with `systemInstruction` and `contents` as array.
      // Easiest is to format history into the prompt or manually build the `contents` array for `generateContent`.

      let contents: any[] = [];
      if (history && Array.isArray(history)) {
        contents = history.map(item => ({
          role: item.role,
          parts: [{ text: item.text }]
        }));
      }
      contents.push({ role: "user", parts: [{ text: message }] });

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents,
        config: {
          systemInstruction: systemInstruction || "You are a helpful assistant.",
        }
      });
      
      res.json({ text: response.text });
    } catch (error: any) {
      console.error("Gemini API error:", error);
      res.status(500).json({ error: error.message || "Something went wrong" });
    }
  });

  // API route for Gemini market research with Google Search Grounding
  app.post("/api/gemini/market-research", async (req, res) => {
    try {
      const { query } = req.body;
      if (!query || typeof query !== "string") {
        return res.status(400).json({ error: "Query is required" });
      }

      const ai = new GoogleGenAI({
        apiKey: process.env.GEMINI_API_KEY,
        httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
      });

      const systemInstruction = `أنت خبير اقتصادي ومختص في وبورصة وحركة أسواق السلع، والزيوت النباتية والصناعية (مثل زيت الخليط، زيت الأولين، زيت الصويا، زيت النخيل، الدوار وغيرها).
أجب عن سؤال المستخدم بدقة وموثوقية بالاعتماد على نتائج محرك بحث جوجل المتاحة لديك، موضحاً الحركة العالمية والمحلية والأسعار الحالية وتفاصيل عمليات التصنيع أو التكرير المطلوبة.
اكتب بالتفصيل وبأسلوب منظم ومهني جداً باللغة العربية.`;

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: query,
        config: {
          systemInstruction,
          tools: [{ googleSearch: {} }]
        }
      });

      // Extract grounding metadata to show reference URLs
      const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
      const sources = groundingChunks
        .filter((chunk: any) => chunk.web && chunk.web.uri)
        .map((chunk: any) => ({
          title: chunk.web.title || "مصدر خارجي",
          uri: chunk.web.uri
        }));

      res.json({
        text: response.text,
        sources
      });
    } catch (error: any) {
      console.error("Gemini Market Research error:", error);
      res.status(500).json({ error: error.message || "Something went wrong" });
    }
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
