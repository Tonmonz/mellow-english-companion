type TranscriptLine = {
  role?: unknown;
  text?: unknown;
};

type SummaryRequest = {
  transcript?: unknown;
};

const summarySchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    title: { type: "string" },
    summary: { type: "string" },
    naturalSentences: {
      type: "array",
      items: { type: "string" },
      maxItems: 3,
    },
    usefulPhrases: {
      type: "array",
      items: { type: "string" },
      maxItems: 3,
    },
    pronunciation: { type: "string" },
    tomorrowQuestion: { type: "string" },
    memoryNote: { type: "string" },
  },
  required: [
    "title",
    "summary",
    "naturalSentences",
    "usefulPhrases",
    "pronunciation",
    "tomorrowQuestion",
    "memoryNote",
  ],
};

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "missing_api_key" }, { status: 503 });
  }

  let body: SummaryRequest;
  try {
    body = (await request.json()) as SummaryRequest;
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  if (!Array.isArray(body.transcript)) {
    return Response.json({ error: "invalid_transcript" }, { status: 400 });
  }

  const transcript = (body.transcript as TranscriptLine[])
    .filter(
      (line) =>
        (line.role === "me" || line.role === "mellow") &&
        typeof line.text === "string",
    )
    .slice(-80)
    .map((line) => `${line.role === "me" ? "Me" : "Mellow"}: ${line.text}`)
    .join("\n")
    .slice(0, 20_000);

  if (!transcript.trim()) {
    return Response.json({ error: "empty_transcript" }, { status: 400 });
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_TEXT_MODEL || "gpt-5.6-terra",
      instructions:
        "Analyze a personal English practice conversation. Be encouraging but honest. Do not invent errors that are not visible in the transcript. Keep every field concise. memoryNote must contain only a durable personal fact or preference worth remembering; use an empty string if there is none.",
      input: transcript,
      text: {
        format: {
          type: "json_schema",
          name: "english_session_summary",
          strict: true,
          schema: summarySchema,
        },
      },
    }),
  });

  if (!response.ok) {
    console.error("Summary request failed", response.status);
    return Response.json({ error: "summary_failed" }, { status: response.status });
  }

  const result = (await response.json()) as {
    output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
  };
  const outputText = result.output
    ?.flatMap((item) => item.content ?? [])
    .find((content) => content.type === "output_text")?.text;

  if (!outputText) {
    return Response.json({ error: "empty_summary" }, { status: 502 });
  }

  try {
    return Response.json(JSON.parse(outputText));
  } catch {
    return Response.json({ error: "invalid_summary" }, { status: 502 });
  }
}
