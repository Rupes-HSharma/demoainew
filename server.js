
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import Groq from "groq-sdk";

dotenv.config();

const app = express();

app.use(cors());

app.use(
  express.json({
    limit: "50mb",
  })
);


// GROQ CLIENT
const groq = new Groq({
  apiKey:
    process.env.GROQ_API_KEY,
});


// TEST API
app.get("/", (req, res) => {

  res.send(
    "Groq AI Running"
  );
});


// CHAT API
 app.post("/chat", async (req, res) => {
  try {

    console.log(
      "BODY:",
      JSON.stringify(req.body, null, 2)
    );

    const { messages } = req.body;

    if (
      !messages ||
      !Array.isArray(messages) ||
      messages.length === 0
    ) {
      return res.status(400).json({
        error: "Messages required",
      });
    }

    const response =
      await groq.chat.completions.create({

        messages: messages.map(
          (msg) => ({
            role: msg.role,
            content: msg.content,
          })
        ),

        model:
          "llama-3.3-70b-versatile",

        temperature: 0.7,

        max_tokens: 4096,
      });

    res.json({
      reply:
        response.choices[0]
          .message.content,
    });

  } catch (error) {

    console.log(
      "ERROR:",
      error
    );

    res.status(500).json({
      error:
        error.message ||
        "Server Error",
    });
  }
});


// IMAGE GENERATOR
app.post(
  "/generate-image",
  async (req, res) => {

    try {

      const { prompt } =
        req.body;

      res.json({

        image:
          `https://placehold.co/600x400?text=${encodeURIComponent(
            prompt
          )}`,
      });

    } catch (error) {

      console.log(error);

      res.status(500).json({

        error:
          error.message,
      });
    }
  }
);


// VOICE API
app.post(
  "/voice",
  async (req, res) => {

    try {

      res.json({

        text:
          "Voice feature working",
      });

    } catch (error) {

      console.log(error);

      res.status(500).json({

        error:
          error.message,
      });
    }
  }
);


// START SERVER
const PORT =
  process.env.PORT || 5000;

app.listen(
  PORT,
  () => {
    console.log(
      `Server Running On ${PORT}`
    );
  }
);

