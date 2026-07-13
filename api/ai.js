module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({
      ok: false,
      error: "POST only"
    });
  }

  try {
    const { prompt, system } = req.body || {};

    if (!prompt || typeof prompt !== "string") {
      return res.status(400).json({
        ok: false,
        error: "Prompt tələb olunur"
      });
    }

    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        ok: false,
        error: "GEMINI_API_KEY tapılmadı"
      });
    }

    const body = {
      contents: [
        {
          role: "user",
          parts: [
            {
              text: system
                ? `${system}\n\nİstifadəçinin sualı:\n${prompt}`
                : prompt
            }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 2048
      }
    };

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("[AI GEMINI ERROR]", data);

      return res.status(response.status).json({
        ok: false,
        error:
          data?.error?.message ||
          `Gemini API xətası: ${response.status}`
      });
    }

    const text =
      data?.candidates?.[0]?.content?.parts
        ?.map(part => part.text || "")
        .join("")
        .trim() || "";

    if (!text) {
      return res.status(502).json({
        ok: false,
        error: "Gemini boş cavab qaytardı"
      });
    }

    return res.status(200).json({
      ok: true,
      text
    });

  } catch (error) {
    console.error("[AI SERVER ERROR]", error);

    return res.status(500).json({
      ok: false,
      error: error.message || "AI server xətası"
    });
  }
};
