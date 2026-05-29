import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";
import multer from "multer";
import fs from "fs";

dotenv.config();

console.log(process.env.OPENAI_API_KEY);

const app = express();

app.use(cors());
app.use(express.json());


// TEST ROUTE
app.get("/", (req, res) => {
  res.send("OpenAI Server Running");
});


// FILE UPLOAD
const upload = multer({
  dest: "uploads/",
});


// OPENAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});


// CHAT API
app.post("/chat", async (req, res) => {

  try {

    const { message } = req.body;

    const response =
      await openai.chat.completions.create({
        model: "gpt-4.1-mini",
        messages: [
          {
            role: "system",
            content:
              "You are a helpful AI assistant",
          },
          {
            role: "user",
            content: message,
          },
        ],
      });

    res.json({
      success: true,
      reply:
        response.choices[0].message.content,
    });

  } catch (error) {

    console.log(error);

    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});


// IMAGE GENERATOR
app.post("/generate-image", async (req, res) => {

  try {

    const { prompt } = req.body;

    const result =
      await openai.images.generate({
        model: "gpt-image-1",
        prompt,
        size: "1024x1024",
      });

    res.json({
      success: true,
      image: result.data[0].url,
    });

  } catch (error) {

    console.log(error);

    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});


// VOICE TO TEXT
app.post(
  "/voice",
  upload.single("audio"),
  async (req, res) => {

    try {

      const transcription =
        await openai.audio.transcriptions.create({
          file:
            fs.createReadStream(
              req.file.path
            ),
          model: "whisper-1",
        });

      res.json({
        success: true,
        text: transcription.text,
      });

    } catch (error) {

      console.log(error);

      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }
);


// START SERVER
app.listen(5000, () => {

  console.log(
    "Server Running On 5000"
  );
});