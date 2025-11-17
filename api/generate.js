// This is your new backend function: /api/generate.js

// Helper function for retries
const withRetry = async (fn, maxRetries = 3, delay = 1000) => {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, i)));
    }
  }
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // 1. Get the API Key from environment variables (NEVER put it in the code)
  const API_KEY = process.env.GOOGLE_API_KEY;
  if (!API_KEY) {
    return res.status(500).json({ error: 'API key not configured.' });
  }

  const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${API_KEY}`;
  const IMAGEN_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict?key=${API_KEY}`;

  const { geminiPayload } = req.body;

  try {
    // --- Step 1: Generate Name and Image Prompt using Gemini ---
    const geminiResponse = await withRetry(() =>
      fetch(GEMINI_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(geminiPayload),
      })
    );

    if (!geminiResponse.ok) {
       const err = await geminiResponse.json();
       throw new Error(`Gemini API Error: ${err.error.message}`);
    }

    const geminiResult = await geminiResponse.json();

    let generatedName = 'Il Creato Senza Nome';
    let generatedTranslation = 'The Unnamed Creation';
    let finalImagePrompt = 'A surreal hybrid creature, vibrant colors, baroque illustration, octane render.';

    try {
      const jsonText = geminiResult.candidates?.[0]?.content?.parts?.[0]?.text;
      const parsedJson = JSON.parse(jsonText);
      generatedName = parsedJson.italianName || generatedName;
      generatedTranslation = parsedJson.englishTranslation || generatedTranslation;
      finalImagePrompt = parsedJson.imagePrompt || finalImagePrompt;
    } catch (e) {
      console.warn("Failed to parse Gemini JSON, using fallback.");
    }

    // --- Step 2: Generate Image using Imagen ---
    const imagenPayload = {
      instances: {
        prompt: `Highly cinematic, detailed, and artistic illustration of: ${finalImagePrompt}. Baroque style, golden ratio, dramatic lighting.`,
      },
      parameters: { "sampleCount": 1 },
    };

    const imagenResponse = await withRetry(() =>
      fetch(IMAGEN_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(imagenPayload),
      })
    );

    if (!imagenResponse.ok) {
       const err = await imagenResponse.json();
       throw new Error(`Imagen API Error: ${err.error.message}`);
    }

    const imagenResult = await imagenResponse.json();
    const base64Data = imagenResult.predictions?.[0]?.bytesBase64Encoded;

    if (!base64Data) {
      throw new Error('Image generation failed to return data.');
    }

    // --- Step 3: Send the final result back to the React app ---
    res.status(200).json({
      name: generatedName,
      translation: generatedTranslation,
      imageUrl: `data:image/png;base64,${base64Data}`,
    });

  } catch (e) {
    console.error("Backend error:", e);
    res.status(500).json({ error: e.message || 'An internal server error occurred.' });
  }
}