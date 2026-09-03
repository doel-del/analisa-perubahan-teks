// ============================================================
// LLM PROVIDER — Unified interface untuk Gemini, Groq, DeepSeek
// ============================================================
// Single source of truth untuk API calls ke LLM providers.
// Memudahkan switching dan fallback antar-provider.
// ============================================================

export type LLMProvider = 'gemini' | 'groq' | 'deepseek';

export interface LLMConfig {
  provider: LLMProvider;
  apiKey: string;
  model: string;
  temperature: number;
  maxTokens?: number;
}

export interface LLMResponse {
  success: boolean;
  content: string;
  provider: LLMProvider;
  model: string;
  error?: string;
}

// ============================================================
// 1. GEMINI API
// ============================================================

async function callGeminiAPI(
  text: string,
  promptInstruction: string,
  systemInstruction: string,
  apiKey: string
): Promise<string> {
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY tidak ditemukan.');
  }

  const model = 'gemini-3.5-flash-lite';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const payload = {
    contents: [
      {
        parts: [
          {
            text: `${promptInstruction}\n\n--- TEKS UNTUK DIKOREKSI ---\n${text}`
          }
        ]
      }
    ],
    system_instruction: { parts: [{ text: systemInstruction }] },
    generationConfig: { temperature: 0.1 }
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Gemini Raw Error Response:', errorText);
    throw new Error(
      `Gemini API Error (Status ${response.status}): ${errorText.substring(0, 200)}`
    );
  }

  const data = await response.json();
  const candidate = data.candidates?.[0];
  if (
    !candidate ||
    !candidate.content ||
    !candidate.content.parts ||
    !candidate.content.parts[0].text
  ) {
    throw new Error('Gemini mengembalikan respons yang tidak valid atau kosong.');
  }
  return candidate.content.parts[0].text.trim();
}

// ============================================================
// 2. GROQ API (OpenAI-compatible)
// ============================================================

async function callGroqAPI(
  text: string,
  promptInstruction: string,
  systemInstruction: string,
  apiKey: string,
  model: string = 'llama-3.3-70b-versatile'
): Promise<string> {
  if (!apiKey) {
    throw new Error('GROQ_API_KEY tidak ditemukan.');
  }

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemInstruction },
        {
          role: 'user',
          content: `${promptInstruction}\n\n--- TEKS UNTUK DIKOREKSI ---\n${text}`
        }
      ],
      temperature: 0.1,
      max_tokens: 4096
    })
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(
      errorData.error?.message || `Groq API Error: ${response.status}`
    );
  }

  const data = await response.json();
  if (!data.choices?.[0]?.message?.content) {
    throw new Error('Groq mengembalikan respons yang tidak valid.');
  }
  return data.choices[0].message.content.trim();
}

// ============================================================
// 3. DEEPSEEK API (OpenAI-compatible)
// ============================================================

async function callDeepSeekAPI(
  text: string,
  promptInstruction: string,
  systemInstruction: string,
  apiKey: string,
  model: string = 'deepseek-chat'
): Promise<string> {
  if (!apiKey) {
    throw new Error('DEEPSEEK_API_KEY tidak ditemukan.');
  }

  const response = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemInstruction },
        {
          role: 'user',
          content: `${promptInstruction}\n\n--- TEKS UNTUK DIKOREKSI ---\n${text}`
        }
      ],
      temperature: 0.1,
      max_tokens: 4096
    })
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(
      errorData.error?.message || `DeepSeek API Error: ${response.status}`
    );
  }

  const data = await response.json();
  if (!data.choices?.[0]?.message?.content) {
    throw new Error('DeepSeek mengembalikan respons yang tidak valid.');
  }
  return data.choices[0].message.content.trim();
}

// ============================================================
// 4. MAIN UNIFIED CALL FUNCTION
// ============================================================

export async function callLLMAPI(
  text: string,
  promptInstruction: string,
  systemInstruction: string,
  provider: LLMProvider = 'groq'
): Promise<LLMResponse> {
  try {
    let content: string;
    let model: string;

    switch (provider) {
      case 'gemini':
        const geminiKey = process.env.GEMINI_API_KEY;
        if (!geminiKey) throw new Error('GEMINI_API_KEY tidak ditemukan');
        content = await callGeminiAPI(
          text,
          promptInstruction,
          systemInstruction,
          geminiKey
        );
        model = 'gemini-3.5-flash-lite';
        break;

      case 'groq':
        const groqKey = process.env.GROQ_API_KEY;
        if (!groqKey) throw new Error('GROQ_API_KEY tidak ditemukan');
        content = await callGroqAPI(
          text,
          promptInstruction,
          systemInstruction,
          groqKey,
          'llama-3.3-70b-versatile'
        );
        model = 'llama-3.3-70b-versatile';
        break;

      case 'deepseek':
        const deepseekKey = process.env.DEEPSEEK_API_KEY;
        if (!deepseekKey) throw new Error('DEEPSEEK_API_KEY tidak ditemukan');
        content = await callDeepSeekAPI(
          text,
          promptInstruction,
          systemInstruction,
          deepseekKey,
          'deepseek-chat'
        );
        model = 'deepseek-chat';
        break;

      default:
        throw new Error(`Provider tidak dikenal: ${provider}`);
    }

    return {
      success: true,
      content,
      provider,
      model
    };
  } catch (error: any) {
    console.error(`❌ LLM API Error (${provider}):`, error.message);
    return {
      success: false,
      content: '',
      provider,
      model: '',
      error: error.message
    };
  }
}

// ============================================================
// 5. FALLBACK CHAIN (Optional)
// ============================================================

export async function callLLMWithFallback(
  text: string,
  promptInstruction: string,
  systemInstruction: string,
  primaryProvider: LLMProvider = 'groq',
  fallbackProviders: LLMProvider[] = ['deepseek', 'gemini']
): Promise<LLMResponse> {
  const providers = [primaryProvider, ...fallbackProviders];

  for (const provider of providers) {
    console.log(
      `🔄 Mencoba ${provider}...`
    );
    const result = await callLLMAPI(
      text,
      promptInstruction,
      systemInstruction,
      provider
    );

    if (result.success) {
      console.log(`✅ Berhasil dengan ${provider}`);
      return result;
    }

    console.warn(`⚠️ ${provider} gagal: ${result.error}`);
  }

  return {
    success: false,
    content: '',
    provider: 'unknown',
    model: '',
    error: 'Semua LLM provider gagal'
  };
}

// ============================================================
// 6. GET ACTIVE PROVIDER (dari env atau default)
// ============================================================

export function getActiveProvider(): LLMProvider {
  const env = (process.env.LLM_PROVIDER || 'groq').toLowerCase();
  if (env === 'gemini' || env === 'groq' || env === 'deepseek') {
    return env as LLMProvider;
  }
  return 'groq'; // default
}
