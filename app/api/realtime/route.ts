const MAX_SDP_LENGTH = 80_000;
const MAX_CONTEXT_LENGTH = 12_000;

type SessionRequest = {
  sdp?: unknown;
  context?: unknown;
};

function companionInstructions(context: string) {
  return `You are Mellow, my private English companion. You are warm, curious, calm, and emotionally attentive. Your job is to help me become comfortable speaking English through natural daily conversation.

CORE BEHAVIOR
- Speak in English unless I explicitly ask for Thai.
- Talk like a close, thoughtful friend, not a classroom teacher or customer-service agent.
- Ask specific follow-up questions and keep the conversation alive.
- Keep most replies brief enough for a spoken conversation: usually 1-3 sentences.
- Give me time to think. Do not treat a short pause as the end of my turn.
- Never pretend you understood unclear audio. Say what you think you heard, then naturally ask me to explain it another way, spell a word, or give an example.
- Treat clarification as useful English practice. Be patient and never make me feel embarrassed about my accent.
- Do not correct every mistake. Focus on understanding during the conversation.
- Correct something immediately only when it changes my intended meaning or I ask for correction.
- Do not use exaggerated praise. Be supportive, honest, and natural.
- You may offer positive, practical emotional support, but do not claim to be human or a therapist.
- If I say "End today's session", briefly recap our topic, give up to three more natural sentences, three useful words or phrases, one pronunciation point, and one question for tomorrow.

WHAT YOU ALREADY KNOW ABOUT ME
${context || "This is our first conversation. Learn naturally by asking one question at a time."}`;
}

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return Response.json(
      {
        error: "missing_api_key",
        message: "Voice is ready, but the server needs an OpenAI API key.",
      },
      { status: 503 },
    );
  }

  let body: SessionRequest;
  try {
    body = (await request.json()) as SessionRequest;
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  if (
    typeof body.sdp !== "string" ||
    !body.sdp.trim() ||
    body.sdp.length > MAX_SDP_LENGTH
  ) {
    return Response.json({ error: "invalid_sdp" }, { status: 400 });
  }

  const context =
    typeof body.context === "string"
      ? body.context.slice(0, MAX_CONTEXT_LENGTH)
      : "";

  const session = {
    type: "realtime",
    model: process.env.OPENAI_REALTIME_MODEL || "gpt-realtime-2.1",
    output_modalities: ["audio"],
    instructions: companionInstructions(context),
    audio: {
      input: {
        transcription: {
          model: "gpt-live-transcribe",
          language: "en",
          prompt:
            "A personal English conversation with a Thai speaker. Preserve the speaker's actual wording, including grammar mistakes. Use conversation context to resolve names and repeated topics.",
        },
        turn_detection: {
          type: "semantic_vad",
          eagerness: "low",
          create_response: true,
          interrupt_response: true,
        },
      },
      output: { voice: process.env.OPENAI_VOICE || "marin" },
    },
  };

  const formData = new FormData();
  formData.set("sdp", body.sdp);
  formData.set("session", JSON.stringify(session));

  try {
    const upstream = await fetch("https://api.openai.com/v1/realtime/calls", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "OpenAI-Safety-Identifier": "personal-english-companion-owner",
      },
      body: formData,
    });

    const responseBody = await upstream.text();
    if (!upstream.ok) {
      console.error("Realtime session creation failed", upstream.status);
      return Response.json(
        {
          error: "realtime_connection_failed",
          message: "OpenAI could not start the voice session.",
          status: upstream.status,
        },
        { status: upstream.status },
      );
    }

    return new Response(responseBody, {
      status: 201,
      headers: {
        "Content-Type": "application/sdp",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Realtime session error", error);
    return Response.json(
      { error: "realtime_unavailable", message: "Voice service is unavailable." },
      { status: 502 },
    );
  }
}
