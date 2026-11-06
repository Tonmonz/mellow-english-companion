# Mellow

Mellow is a private, single-person English voice companion. It remembers a local profile and session history, talks through OpenAI Realtime over WebRTC, and creates a short learning recap after each conversation.

## Run locally

1. Copy `.env.example` to `.env.local`.
2. Put an OpenAI Platform API key in `OPENAI_API_KEY`.
3. Run `npm run dev`.
4. Open `http://localhost:3000` and allow microphone access.

The API key is used only by server routes. Personal profile, memories, and conversation history are stored in the browser on this device and can be exported from Settings.

Mellow lets you switch between the lower-cost `gpt-realtime-2.1-mini` model and the higher-quality `gpt-realtime-2.1` model in Settings. You can also choose any supported built-in Realtime voice beside the microphone before starting a conversation. Theme, model, and voice preferences are saved in the browser.

## API credit

OpenAI does not currently expose the prepaid credit balance through a supported endpoint available to a normal project API key, so Mellow links directly to the live OpenAI Billing page instead of showing a stale or estimated balance. Adding credit there takes effect for the existing API key; no app rebuild or redeploy is required. A redeploy is only needed when changing the key or deployment configuration.

## Production

Set the same environment values in the hosting runtime. Keep the site private because it creates paid realtime sessions with the server-side key.
