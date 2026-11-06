# Mellow

Mellow is a private, single-person English voice companion. It remembers a local profile and session history, talks through OpenAI Realtime over WebRTC, and creates a short learning recap after each conversation.

## Run locally

1. Copy `.env.example` to `.env.local`.
2. Put an OpenAI Platform API key in `OPENAI_API_KEY`.
3. Run `npm run dev`.
4. Open `http://localhost:3000` and allow microphone access.

The API key is used only by server routes. Personal profile, memories, and conversation history are stored in the browser on this device and can be exported from Settings.

## Production

Set the same environment values in the hosting runtime. Keep the site private because it creates paid realtime sessions with the server-side key.
