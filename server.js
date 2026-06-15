
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import Groq from "groq-sdk";
import { tavily } from "@tavily/core";


dotenv.config();

const app = express();

app.use(cors());

app.use(
  express.json({
    limit: "50mb",
  })
);

console.log("GROQ KEY EXISTS:", !!process.env.GROQ_API_KEY);
// GROQ CLIENT
const groq = new Groq({
  apiKey:
    process.env.GROQ_API_KEY,
});

const tvly = tavily({
  apiKey: process.env.TAVILY_API_KEY,
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

    const latestQuestion =
      messages[messages.length - 1]
        ?.content || "";

        let searchQuery = latestQuestion;
        let companyName = "TrioTree Technologies";

        if (
  latestQuestion.toLowerCase().includes("director")
) {
  searchQuery =
    `${companyName} directors MCA Zaubacorp company directors`;
}

else if (
  latestQuestion.toLowerCase().includes("address") ||
  latestQuestion.toLowerCase().includes("location")
) {
  searchQuery =
    `${companyName} registered office address MCA`;
}

else if (
  latestQuestion.toLowerCase().includes("employee")
) {
  searchQuery =
    `${companyName} employee count linkedin tracxn`;
}

// follow-up company questions
 
if (
  messages.length > 1 &&
  (
    latestQuestion.toLowerCase().includes("location") ||
    latestQuestion.toLowerCase().includes("current location") ||
    latestQuestion.toLowerCase().includes("company location") ||
    latestQuestion.toLowerCase().includes("address") ||
    latestQuestion.toLowerCase().includes("current address") ||
    latestQuestion.toLowerCase().includes("director") ||
    latestQuestion.toLowerCase().includes("contact") ||
    latestQuestion.toLowerCase().includes("phone") ||
    latestQuestion.toLowerCase().includes("email")||
    latestQuestion.toLowerCase().includes("type") ||
    latestQuestion.toLowerCase().includes("industry") ||
    latestQuestion.toLowerCase().includes("business") ||
    latestQuestion.toLowerCase().includes("work") ||
    latestQuestion.toLowerCase().includes("services")
  )
) {
  const previousContext = messages
    .slice(-6)
    .map((m) => m.content)
    .join(" ");

  // detect company name from conversation
  const companyName =
    previousContext.match(
      /triotree technologies?/i
    )?.[0] || "";
    if (
  latestQuestion.toLowerCase().includes("type")
) {
  searchQuery =
    `${companyName} industry business healthcare IT services company profile`;
}

  if (latestQuestion.toLowerCase().includes("director")) {
    searchQuery =
      `${companyName} directors MCA Zaubacorp`;
  } else if (
    latestQuestion.toLowerCase().includes("employee")
  ) {
    searchQuery =
      `${companyName} employee count linkedin tracxn`;
  } else if (
    latestQuestion.toLowerCase().includes("address") ||
    latestQuestion.toLowerCase().includes("location")
  ) {
    searchQuery =
      `${companyName} registered office address company headquarters`;
  } else {
    searchQuery =
      previousContext + " " + latestQuestion;
  }
}

    let searchContext = "";

    try {

 const searchResults = await tvly.search(
  searchQuery,
  {
    searchDepth: "advanced",
    maxResults: 10,

    includeDomains: [
      "zaubacorp.com",
      "thecompanycheck.com",
      "tracxn.com",
      "crunchbase.com",
      "linkedin.com"
    ]
  }
);

console.log("SEARCH QUERY:", searchQuery);

console.log(
  JSON.stringify(
    searchResults.results,
    null,
    2
  )
);

console.log("QUESTION:", latestQuestion);

let companyName = "";

const previousContext = messages
  .slice(-6)
  .map((m) => m.content)
  .join(" ");

if (
  previousContext
    .toLowerCase()
    .includes("triotree")
) {
  companyName =
    "TrioTree Technologies";
}

searchResults.results?.forEach((r, i) => {
  console.log(`\n===== RESULT ${i + 1} =====`);
  console.log("TITLE:", r.title);
  console.log("URL:", r.url);
  console.log("CONTENT:", r.content);
});

console.log(
  JSON.stringify(
    searchResults.results,
    null,
    2
  )
);
console.log("====================================");
  searchContext =
  searchResults.results
    ?.slice(0, 5)
    .map(
      (r, i) => `
SOURCE ${i + 1}

TITLE:
${r.title}

URL:
${r.url}

CONTENT:
${r.content}
`
    )
    .join("\n\n");

    } catch (searchError) {

      console.log(
        "Tavily Error:",
        searchError
      );
    }

    const response =
      await groq.chat.completions.create({

       messages: [

  {
  role: "system",
  content: `
You are an intelligent AI assistant.

GENERAL RULES:
- Maintain conversation context from previous messages.
- Understand follow-up questions based on earlier discussion.
- Never lose the topic unless the user changes it.
- Be concise but accurate.

CODING RULES:
- Continue in the same technology currently being discussed.
- If the conversation is about React, provide React code.
- If the conversation is about Node.js, provide Node.js code.
- Do not switch to HTML, Java, Python, or another language unless requested.
- Prefer complete working examples over partial snippets.

For company information:

- Prefer official company websites.
- Prefer MCA, ZaubaCorp, Tracxn, Crunchbase.
- If multiple addresses are found, list all addresses.
- Do not choose one address unless all sources agree.
- If directors are found, list every director found.

DIRECTOR RULES:

- Only list people explicitly identified as Directors.
- Do NOT treat:
  - CEO
  - Founder
  - COO
  - VP
  - President
  - CGO
  - Managers
as Directors unless the source explicitly says they are Directors.

- For Indian companies, prefer MCA and ZaubaCorp director records over leadership pages.

EMPLOYEE COUNT RULES:

- Prefer LinkedIn and Tracxn employee counts.
- If multiple counts exist, show all counts.
- Mention the source beside each count.
- Do not average or guess employee counts.

ADDRESS RULES:

- Distinguish between:
  - Registered Office
  - Corporate Office
  - Headquarters

- If multiple addresses exist:
  show all addresses with labels.

Example:

Registered Office:
...

Corporate Office:
...

Headquarters:
...

COMPANY & FACTUAL INFORMATION:
- Use SEARCH RESULTS as the primary source of truth.
- When users ask follow-up questions such as:
  - company location
  - company address
  - where is it located
  - director
  - contact details
  - founder
  - CEO
  - location
- address
- current address
- current location
- phone number
- email

  use the company discussed in previous messages.

- Never answer with generic definitions when a specific company is being discussed.

SOURCE HANDLING:
- If information exists in SEARCH RESULTS, use it.
- If multiple sources disagree, mention all available information and state that sources conflict.
- Never invent facts.
- If information is unavailable in SEARCH RESULTS, clearly say so.

RESPONSE STYLE:
- Provide direct answers first.
- Use bullet points for lists.
- For company questions, show names, addresses, directors, and contact information clearly.
- For coding questions, provide code first, then explanation.

If the user asks:

- what type of company
- company type
- industry
- what does this company do
- business category
- services
- Short Company Overview
- Employee Count (if available)
Do not answer in 2-3 lines.

Then identify the company's industry,
business domain and services from search results.

Do not classify a company based on a single
LinkedIn post or article.

Prefer:
- Official website
- LinkedIn company profile
- Tracxn
- Crunchbase
- TheCompanyCheck
- MCA

and a company was discussed earlier,

assume the question refers to the same company.

Never interpret words like "current" as a company name unless the conversation is specifically about a company named Current.

SEARCH RESULTS:
${searchContext}
`,
},

 ...messages.slice(-6).map((msg) => ({
  role: msg.role,
  content: msg.content,
})),

],

       model: "llama-3.3-70b-versatile",

        temperature: 0.2,

        max_tokens: 2048,
      });

    res.json({
      reply:
        response.choices[0]
          .message.content,
    });

 } catch (error) {

  console.log("ERROR:", error);

  if (
    error?.status === 429 ||
    error?.message?.includes("Rate limit")
  ) {

    return res.json({
      reply:
        "AI service is busy right now. Please try again in 1-2 minutes.",
    });
  }

  return res.status(500).json({
    reply:
      error?.message ||
      "Server error. Please try again.",
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

