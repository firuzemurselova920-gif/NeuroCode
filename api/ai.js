module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization"
  );

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({
      ok: false,
      error: "Yalnız POST sorğusu qəbul edilir"
    });
  }

  try {
    const body =
      typeof req.body === "string"
        ? JSON.parse(req.body)
        : req.body || {};

    const prompt = String(body.prompt || "").trim();
    const system = String(body.system || "").trim();

    if (!prompt) {
      return res.status(400).json({
        ok: false,
        error: "Sual boş ola bilməz"
      });
    }

    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      console.error("[AI ERROR] GEMINI_API_KEY yoxdur");

      return res.status(500).json({
        ok: false,
        error: "AI xidməti konfiqurasiya edilməyib"
      });
    }

    const systemInstruction =
      system ||
      `
Sən NeuroCode platformasının AI Müəllimisən.

Sənin vəzifən:
- istifadəçinin sualını düzgün anlamaq;
- Azərbaycan dilində aydın cavab vermək;
- riyaziyyat, Azərbaycan dili, ingilis dili, tarix və digər təhsil mövzularında kömək etmək;
- cavabı istifadəçinin səviyyəsinə uyğun izah etmək;
- lazım olduqda mərhələli izah vermək;
- yanlış məlumat verməmək;
- istifadəçinin səhvini aşkar etdikdə düzgün həlli izah etmək.

Cavabların aydın, faydalı və tədris yönümlü olsun.
`;

    const requestBody = {
      system_instruction: {
        parts: [
          {
            text: systemInstruction
          }
        ]
      },

      contents: [
        {
          role: "user",
          parts: [
            {
              text: prompt
            }
          ]
        }
      ],

      generationConfig: {
        temperature: 0.4,
        maxOutputTokens: 2048
      }
    };

    const model =
      process.env.GEMINI_MODEL ||
      "gemini-2.0-flash";

    const url =
      "https://generativelanguage.googleapis.com/v1beta/models/" +
      encodeURIComponent(model) +
      ":generateContent?key=" +
      encodeURIComponent(apiKey);

    const response = await fetch(url, {
      method: "POST",

      headers: {
        "Content-Type": "application/json"
      },

      body: JSON.stringify(requestBody)
    });

    const rawText = await response.text();

    let data;

    try {
      data = JSON.parse(rawText);
    } catch (error) {
      console.error(
        "[AI JSON ERROR]",
        rawText.slice(0, 500)
      );

      return res.status(502).json({
        ok: false,
        error: "AI serverindən düzgün cavab alınmadı"
      });
    }

    if (!response.ok) {
      console.error(
        "[GEMINI ERROR]",
        response.status,
        JSON.stringify(data)
      );

      const geminiMessage =
        data?.error?.message ||
        "Gemini API xətası";

      return res.status(response.status).json({
        ok: false,
        error: geminiMessage
      });
    }

    const parts =
      data?.candidates?.[0]?.content?.parts || [];

    const answer = parts
      .map(part => part?.text || "")
      .join("\n")
      .trim();

    if (!answer) {
      console.error(
        "[AI EMPTY RESPONSE]",
        JSON.stringify(data)
      );

      return res.status(502).json({
        ok: false,
        error: "AI cavab yaratmadı. Yenidən cəhd edin."
      });
    }

    return res.status(200).json({
      ok: true,
      text: answer
    });

  } catch (error) {
    console.error(
      "[AI SERVER ERROR]",
      error
    );

    return res.status(500).json({
      ok: false,
      error:
        error?.message ||
        "AI Müəllim server xətası"
    });
  }
};
