import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import Groq from "groq-sdk";
import { tavily } from "@tavily/core";
import { GoogleGenerativeAI } from "@google/generative-ai";

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

const genAI = new GoogleGenerativeAI(
  process.env.GEMINI_API_KEY
);

const geminiModel = genAI.getGenerativeModel({
  model: "gemini-2.5-flash",
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

    const { messages, userLocation } = req.body;

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

        const isMathQuery =
  /^[0-9+\-*/().\s=]+$/.test(
    latestQuestion.trim()
  );

if (isMathQuery) {
  try {

    const result = Function(
      `"use strict"; return (${latestQuestion.replace("=", "")})`
    )();

    return res.json({
      reply: `${result}`,
    });

  } catch {

    return res.json({
      reply: "Invalid calculation",
    });
  }
}

    // ---- SMALL TALK SHORT-CIRCUIT ----
    // Greetings/small talk don't need any search at all — saves API
    // calls and avoids irrelevant context being injected.
    const smallTalkPattern = /^(hi|hii+|hello+|hey+|yo|good morning|good evening|good afternoon|thanks|thank you|ok|okay|bye|good night)\s*[!.?]*$/i;
    if (smallTalkPattern.test(latestQuestion.trim())) {
      const smallTalkResponse = await groq.chat.completions.create({
        messages: [
          { role: "system", content: "You are a friendly assistant. Reply briefly and naturally to small talk." },
          ...messages.slice(-4).map((msg) => ({ role: msg.role, content: msg.content })),
        ],
        model: "llama-3.3-70b-versatile",
        temperature: 0.5,
        max_tokens: 100,
      });
      return res.json({ reply: smallTalkResponse.choices[0].message.content });
    }
    // ---- END SMALL TALK SHORT-CIRCUIT ----

    // ---- WEATHER SHORT-CIRCUIT ----

    const weatherPatterns = [
      "weather",
      "temperature",
      "forecast",
      "rain",
      "humidity",
      "wind",
      "climate",
      "mausam",
      "mosam",
      "baarish",
      "barish",
      "garmi",
      "sardi",
    ];

    const lowerLatest = latestQuestion.toLowerCase();
    const currentHasWeatherKeyword = weatherPatterns.some((pattern) =>
      lowerLatest.includes(pattern)
    );

    // Detect a weather FOLLOW-UP: previous user/assistant turn was about
    // weather, and the current message is short (likely just a city
    // name, e.g. "noida") with no other topic keyword in it.
    const lastFewMessages = messages
      .slice(-4)
      .map((m) => m.content?.toLowerCase() || "")
      .join(" ");
    const previousWasWeather = weatherPatterns.some((pattern) =>
      lastFewMessages.includes(pattern)
    );

    const otherTopicKeywords = ["director", "employee", "address", "location", "contact", "phone", "email", "industry", "business", "services", "code", "function", "company"];
    // words that are NOT city names but are short, so must be excluded
    // or "today date", "thank you", "ok bye" etc get mistaken for a city follow-up
    const nonCityWords = ["date", "time", "day", "today", "now", "yesterday", "tomorrow", "yes", "no", "ok", "okay", "thanks", "thank", "please", "bye", "hi", "hello", "who", "what", "when", "where", "why", "how", "is", "are", "current", "aaj", "kal", "kya", "hai", "hogi", "hoga", "me", "mein"];
    const wordsInQuestion = latestQuestion.trim().toLowerCase().split(/\s+/);
    const containsNonCityWord = wordsInQuestion.some((w) => nonCityWords.includes(w));
    const looksLikeBareCityFollowup =
      previousWasWeather &&
      !currentHasWeatherKeyword &&
      wordsInQuestion.length <= 3 &&
      !containsNonCityWord &&
      !otherTopicKeywords.some((k) => lowerLatest.includes(k));

    const isWeatherQuery = currentHasWeatherKeyword || looksLikeBareCityFollowup;

    if (isWeatherQuery) {
      try {
        // "near me" / "mere paas" => always use device/IP location, never
        // try to extract a city name out of the sentence.
        const nearMePattern = /near me|mere\s+(paas|yaha|nazdeek)/i;
        const isNearMeQuery = nearMePattern.test(latestQuestion);

        // "kal"/"tomorrow" => show tomorrow's forecast instead of current
        // weather. If "aaj"/"today" is also present, treat as today.
        const isTomorrowQuery =
          /\b(tomorrow|kal)\b/i.test(latestQuestion) &&
          !/\b(today|aaj)\b/i.test(latestQuestion);

        // 1. figure out city: explicit phrasing (English or Hinglish) >
        // bare city follow-up (current message itself IS the city) > IP fallback
        let cityName = null;

        if (!isNearMeQuery) {
          const cityPatterns = [
            // "weather/temperature/forecast in/at/of/for Noida"
            /(?:weather|temperature|forecast|climate|humidity|wind)\s+(?:in|at|of|for)\s+([a-zA-Z\s]+?)(?:\s+(?:today|tomorrow|now|please)\b|[?.!]|$)/i,
            // "mausam Patna" / "mausam Patna me"
            /(?:mausam|mosam)\s+([a-zA-Z]+(?:\s+[a-zA-Z]+)?)\b/i,
            // "Noida me kitni garmi hai" / "Bangalore me baarish hogi"
            /\b([a-zA-Z]+(?:\s+[a-zA-Z]+)?)\s+me(?:in)?\s+(?:kitni|kya|aaj|kal)?\s*(?:garmi|baarish|barish|sardi|mausam|mosam)/i,
            // "rain/weather in Mumbai tomorrow"
            /(?:rain|weather|temperature)\s+(?:in|at)\s+([a-zA-Z\s]+?)\s+(?:today|tomorrow)\b/i,
          ];

          for (const pattern of cityPatterns) {
            const match = latestQuestion.match(pattern);
            if (match && match[1]) {
              cityName = match[1].trim();
              break;
            }
          }
        }

        if (!cityName && looksLikeBareCityFollowup) {
          cityName = latestQuestion.trim();
        }

        // strip stray time/filler words that sometimes leak into the match
        if (cityName) {
          cityName = cityName
            .replace(/\b(today|tomorrow|now|please|aaj|kal|kya|hai|hogi|hoga)\b/gi, "")
            .trim();
          if (!cityName) cityName = null;
        }

        let lat, lon, placeName;

        if (cityName) {
          console.log("Detected City:", cityName);

          const geoRes = await fetch(
            `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cityName)}&count=1`
          );

          const geoData = await geoRes.json();

          console.log("Geo Data:", geoData);

          if (geoData.results?.[0]) {
            lat = geoData.results[0].latitude;
            lon = geoData.results[0].longitude;
            placeName = geoData.results[0].name;
          }
        }

        if (lat === undefined && userLocation?.lat && userLocation?.lon) {
          lat = userLocation.lat;
          lon = userLocation.lon;
          placeName = "your location";
        }

        if (lat === undefined) {
          // Simple, no-permission-needed fallback: detect location from
          // the request's IP address using ip-api.com (free, no key).
          try {
            let clientIp =
              req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
              req.socket.remoteAddress ||
              "";
            // strip IPv6 prefix if present
            clientIp = clientIp.replace("::ffff:", "");

            // ip-api.com auto-detects the caller's IP if you call it
            // without an IP (works great in production behind a real
            // public IP; on localhost it just returns server's own IP).
            const ipUrl = clientIp
              ? `http://ip-api.com/json/${clientIp}`
              : `http://ip-api.com/json/`;

            const ipRes = await fetch(ipUrl);
            const ipData = await ipRes.json();

            if (ipData.status === "success") {
              lat = ipData.lat;
              lon = ipData.lon;
              placeName = ipData.city || "your location";
            }
          } catch (ipErr) {
            console.log("IP Geolocation Error:", ipErr);
          }
        }

        if (lat !== undefined && lon !== undefined) {
          const weatherRes = await fetch(
            `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code,wind_speed_10m,relative_humidity_2m&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto`
          );
          const weatherData = await weatherRes.json();

          let reply;

          if (isTomorrowQuery) {
            reply = `🌤️ Weather for ${placeName} (Tomorrow)

📈 High: ${weatherData.daily?.temperature_2m_max?.[1]}°C
📉 Low: ${weatherData.daily?.temperature_2m_min?.[1]}°C
🌧️ Rain Chance: ${weatherData.daily?.precipitation_probability_max?.[1] ?? "N/A"}%`;
          } else {
            reply = `🌤️ Weather for ${placeName}

🌡️ Current Temperature: ${weatherData.current?.temperature_2m}°C
💧 Humidity: ${weatherData.current?.relative_humidity_2m}%
💨 Wind Speed: ${weatherData.current?.wind_speed_10m} km/h
📈 High: ${weatherData.daily?.temperature_2m_max?.[0]}°C
📉 Low: ${weatherData.daily?.temperature_2m_min?.[0]}°C`;
          }

          return res.json({ reply });
        } else {
          return res.json({
            reply:
              "Mujhe aapka location detect nahi ho paaya. Please city ka naam bata dein (e.g. 'weather in Noida').",
          });
        }
      } catch (weatherErr) {
        console.error("Weather API Error:", weatherErr);

        return res.json({
          reply: "Weather service is temporarily unavailable. Please try again later.",
        });
      }
    }
    // ---- END WEATHER SHORT-CIRCUIT ----

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
        searchQuery = `${companyName} MCA directors Zaubacorp`;
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

    const needsSearch =
  /director|address|location|current|latest|news|price|population|who is|contact|email|phone|employee/i.test(
    latestQuestion
  );
  
    let searchContext = "";

    
 
    try {

      const domainTokens = guessDomainTokens(companyName);

      // FIX: don't hard-restrict to a guessed (often wrong) domain.
      // Also: only run the company-directory-restricted search when a
      // company is actually involved — running it for general
      // questions ("capital of france", "who is the PM") just wastes
      // an API call and can pollute context with irrelevant results.
      const searchPromises = [
        tvly.search(searchQuery, {
          searchDepth: "advanced",
          maxResults: 10,
        }),
      ];

      if (companyName) {
        searchPromises.push(
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
          })
        );
      }

      const [broadResults, directoryResults] = await Promise.all(searchPromises);

      const allResults = [
        ...(broadResults.results || []),
        ...(directoryResults?.results || []),
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
        .slice(0, 3)
        .map(
          (r, index) => `
          SOURCE ${index + 1}
          TITLE: ${r.title}
          URL: ${r.url}
          CONTENT: ${(r.content || "").substring(0, 700)}
`
        )
        .join("\n\n");

    } 
    
    catch (searchError) {

      console.log(
        "Tavily Error:",
        searchError
      );
    }

    let aiReply = "";

    try {
    
      const response =
        await groq.chat.completions.create({

          messages: [

            {
              role: "system",
              content: `
              You are Lumina AI, an intelligent assistant.
CURRENT DATE:
${new Date().toLocaleDateString("en-IN", {
  weekday: "long",
  year: "numeric",
  month: "long",
  day: "numeric"
})}
Never call Founder, CEO, CTO, COO or Employee a Director unless SEARCH RESULTS explicitly identify them as Director.
RULES:

- Maintain conversation context.
- Understand follow-up questions.
- Answer naturally like ChatGPT.
- Be concise unless user asks for details.
- Never invent facts.
- Use SEARCH RESULTS only when they contain relevant information.
- If SEARCH RESULTS are empty, answer using your own knowledge.
- For coding, always continue in the same programming language already being discussed.
- For calculations, always calculate accurately.
- For weather/location questions, prefer the dedicated weather/location logic if available.

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

      aiReply =
        response.choices[0].message.content;

      console.log("Using GROQ");

    } catch (err) {

      console.log(
        "Groq failed, switching to Gemini"
      );

      const finalPrompt = `
SEARCH RESULTS:
${searchContext}

CONVERSATION:
${messages
          .slice(-6)
          .map(
            (m) =>
              `${m.role}: ${m.content}`
          )
          .join("\n")}

USER:
${latestQuestion}
`;

      const result =
        await geminiModel.generateContent(
          finalPrompt
        );

      aiReply =
        result.response.text();

      console.log("Using GEMINI");
    }

    res.json({
      reply: aiReply,
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





  app.get("/version", (req, res) => {
  res.json({
    version: "v2.0.5",
    deployedAt: new Date().toISOString()
  });
});