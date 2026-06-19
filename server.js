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

// Helper: guess a probable official domain from a company name.
// We do NOT use this to restrict search (includeDomains), only to
// optionally boost relevance later. Real domain may differ (e.g.
// "TrioTree Technologies" -> triotree.com, not triotreetechnologies.com)
function guessDomainTokens(name) {
  if (!name) return [];
  const cleaned = name
    .toLowerCase()
    .replace(/(technologies|technology|pvt ltd|private limited|ltd|limited|inc|corp|systems|solutions)/g, "")
    .trim();
  const words = cleaned.split(/\s+/).filter(Boolean);
  // candidate tokens: full joined, and just the first word (most common pattern)
  const candidates = new Set();
  if (words.length) {
    candidates.add(words.join(""));      // e.g. "triotreetechnologies" -> still added as fallback
    candidates.add(words[0]);            // e.g. "triotree" -> most likely real domain root
  }
  return Array.from(candidates);
}

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

    // FIX: single source of truth for companyName across the whole request.
    // No more shadowing with a second `const companyName` inside the if-block.
    let companyName = "";

    const previousContext = messages
      .slice(-10)
      .map((m) => m.content)
      .join(" ");

    const companyMatch = previousContext.match(
      /([A-Za-z0-9&.\-\s]{2,80}(?:Technologies|Technology|Ltd|Limited|Private Limited|Pvt Ltd|Systems|Solutions|Inc|Corp))/i
    );

    if (companyMatch) {
      companyName = companyMatch[1].trim();
    }

    const lowerQ = latestQuestion.toLowerCase();

    // follow-up company questions
    if (
      messages.length > 1 &&
      (
        lowerQ.includes("location") ||
        lowerQ.includes("current location") ||
        lowerQ.includes("company location") ||
        lowerQ.includes("address") ||
        lowerQ.includes("current address") ||
        lowerQ.includes("director") ||
        lowerQ.includes("contact") ||
        lowerQ.includes("phone") ||
        lowerQ.includes("email") ||
        lowerQ.includes("type") ||
        lowerQ.includes("industry") ||
        lowerQ.includes("business") ||
        lowerQ.includes("work") ||
        lowerQ.includes("services")
      )
    ) {
      if (lowerQ.includes("director")) {
        searchQuery = `${companyName} directors MCA Zaubacorp`;
      } else if (lowerQ.includes("employee")) {
        searchQuery = `${companyName} employee count linkedin tracxn`;
      } else if (lowerQ.includes("address") || lowerQ.includes("location")) {
        // FIX: explicitly ask for "contact us" / "current office" so the
        // official site's contact page ranks higher than MCA filings.
        searchQuery = `${companyName} official website contact us current office address`;
      } else {
        searchQuery = `${companyName} ${latestQuestion}`;
      }
    }

    let searchContext = "";

    try {

      const domainTokens = guessDomainTokens(companyName);

      
      const [broadResults, directoryResults] = await Promise.all([
        tvly.search(searchQuery, {
          searchDepth: "advanced",
          maxResults: 10,
        }),
        tvly.search(searchQuery, {
          searchDepth: "advanced",
          maxResults: 10,
          includeDomains: [
            "zaubacorp.com",
            "thecompanycheck.com",
            "tracxn.com",
            "crunchbase.com",
            "linkedin.com",
          ],
        }),
      ]);

      const allResults = [
        ...(broadResults.results || []),
        ...(directoryResults.results || []),
      ];

      // de-dupe by URL
      const seen = new Set();
      const dedupedResults = allResults.filter((r) => {
        if (seen.has(r.url)) return false;
        seen.add(r.url);
        return true;
      });

      console.log("SEARCH QUERY:", searchQuery);
      console.log("DETECTED COMPANY:", companyName);
      console.log("DOMAIN TOKENS (info only):", domainTokens);

      dedupedResults.forEach((r, i) => {
        console.log(`\n===== RESULT ${i + 1} =====`);
        console.log("TITLE:", r.title);
        console.log("URL:", r.url);
      });

      console.log("====================================");

      // Keep results that actually mention the company name OR come from
      // a trusted directory/official-looking domain.
      const trustedHosts = [
        "zaubacorp",
        "thecompanycheck",
        "tracxn",
        "crunchbase",
        "linkedin",
      ];

      const relevantResults = dedupedResults.filter((r) => {
        const urlLower = r.url.toLowerCase();
        const mentionsCompany =
          !companyName ||
          r.title?.toLowerCase().includes(companyName.toLowerCase()) ||
          r.content?.toLowerCase().includes(companyName.toLowerCase());
        const fromTrustedDirectory = trustedHosts.some((h) => urlLower.includes(h));
        const looksOfficial =
          domainTokens.some((t) => t && urlLower.includes(t)) &&
          !urlLower.includes("linkedin.com/jobs"); // avoid job-board noise
        return mentionsCompany || fromTrustedDirectory || looksOfficial;
      });

      const finalResults =
        relevantResults.length > 0 ? relevantResults : dedupedResults;
 
      const isAddressQuery = lowerQ.includes("address") || lowerQ.includes("location");
      if (isAddressQuery) {
        finalResults.sort((a, b) => {
          const score = (r) => {
            const u = r.url.toLowerCase();
            let s = 0;
            if (domainTokens.some((t) => t && u.includes(t))) s += 2; // likely official site
            if (u.includes("contact")) s += 2;
            if (u.includes("zaubacorp") || u.includes("thecompanycheck")) s += 1;
            return s;
          };
          return score(b) - score(a);
        });
      }

      searchContext = finalResults
        .slice(0, 6)
        .map(
          (r, index) => `
          SOURCE ${index + 1}
          TITLE: ${r.title}
          URL: ${r.url}
          CONTENT: ${(r.content || "").substring(0, 2500)}
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

CURRENT ADDRESS RULE:

If the user asks current address / current location / office address / headquarters:

Priority order:
1. Official Website "Contact Us" page
2. LinkedIn Company Page
3. Registered Office (MCA / ZaubaCorp) — use ONLY if nothing else is available, and label it clearly as "Registered Office" (not "current office").

If multiple addresses exist, show all addresses with clear labels:

Registered Office:
...

Corporate Office:
...

Headquarters:
...

DIRECTOR RULES:
- Only list people explicitly identified as Directors.
- Do NOT treat CEO/Founder/COO/VP/President/CGO/Managers as Directors unless the source explicitly says so.
- For Indian companies, prefer MCA and ZaubaCorp director records over leadership pages.

EMPLOYEE COUNT RULES:
- Prefer LinkedIn and Tracxn employee counts.
- If multiple counts exist, show all counts with source.
- Do not average or guess.

CRITICAL FACT RULE:
- Only use information explicitly present inside SEARCH RESULTS.
- Never infer industry, services, employee count, or headquarters.
- If not explicitly present, say so plainly instead of guessing.

SOURCE HANDLING:
- If multiple sources disagree, mention all and state that sources conflict.
- Never invent facts.

RESPONSE STYLE:
- Direct answer first, then bullet points for lists.
- For company type/industry/services questions, give a proper paragraph (not 2-3 lines) based on search results.

Never interpret words like "current" as a company name unless the conversation is specifically about a company literally named "Current".

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