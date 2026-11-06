"use client";

import {
  ArrowDown,
  Archive,
  BookOpen,
  Check,
  ChevronRight,
  Clock3,
  Cloud,
  Download,
  Headphones,
  Heart,
  History,
  Home,
  Mic,
  MicOff,
  Plus,
  RefreshCw,
  Settings,
  Sparkles,
  Trash2,
  UserRound,
  Volume2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Tab = "today" | "history" | "memory" | "settings";
type VoiceState = "idle" | "connecting" | "listening" | "thinking" | "speaking" | "summarizing";
type SyncStatus = "connecting" | "syncing" | "synced" | "offline" | "local";

type Profile = {
  name: string;
  job: string;
  goal: string;
  interests: string;
  personality: string;
  correctionStyle: "safe" | "gentle" | "coach";
};

type MemoryNote = {
  id: string;
  text: string;
  createdAt: string;
};

type TranscriptLine = {
  id: string;
  role: "me" | "mellow";
  text: string;
  final: boolean;
};

type SessionSummary = {
  title: string;
  summary: string;
  naturalSentences: string[];
  usefulPhrases: string[];
  pronunciation: string;
  tomorrowQuestion: string;
  memoryNote: string;
};

type PracticeSession = {
  id: string;
  startedAt: string;
  durationSeconds: number;
  transcript: TranscriptLine[];
  summary?: SessionSummary;
};

type StoredState = {
  profile: Profile;
  memories: MemoryNote[];
  sessions: PracticeSession[];
};

type RealtimeEvent = {
  type?: string;
  delta?: string;
  transcript?: string;
  item_id?: string;
  response_id?: string;
  error?: { message?: string };
};

const STORAGE_KEY = "mellow-personal-v1";

const DEFAULT_PROFILE: Profile = {
  name: "",
  job: "",
  goal: "Speak English confidently and prepare for future job opportunities.",
  interests: "",
  personality: "I prefer calm, honest conversations and a little time to think before I answer.",
  correctionStyle: "gentle",
};

const EMPTY_STATE: StoredState = {
  profile: DEFAULT_PROFILE,
  memories: [],
  sessions: [],
};

function normalizeStoredState(value: unknown): StoredState {
  const candidate = value && typeof value === "object" ? (value as Partial<StoredState>) : {};
  return {
    profile: { ...DEFAULT_PROFILE, ...(candidate.profile ?? {}) },
    memories: Array.isArray(candidate.memories) ? candidate.memories : [],
    sessions: Array.isArray(candidate.sessions) ? candidate.sessions : [],
  };
}

function hasPersonalProfile(profile: Profile) {
  return Boolean(profile.name.trim() || profile.job.trim() || profile.interests.trim());
}

function mergeStoredStates(
  local: StoredState,
  cloud: StoredState,
  preferLocalProfile = false,
): StoredState {
  const sessions = new Map<string, PracticeSession>();
  for (const session of [...cloud.sessions, ...local.sessions]) {
    const current = sessions.get(session.id);
    if (!current || (!current.summary && session.summary)) sessions.set(session.id, session);
  }

  const memories = new Map<string, MemoryNote>();
  for (const memory of [...cloud.memories, ...local.memories]) {
    memories.set(memory.id, memory);
  }

  const useLocalProfile =
    preferLocalProfile ||
    (hasPersonalProfile(local.profile) && !hasPersonalProfile(cloud.profile));

  return {
    profile: useLocalProfile ? local.profile : cloud.profile,
    sessions: [...sessions.values()].sort(
      (a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt),
    ),
    memories: [...memories.values()].sort(
      (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
    ),
  };
}

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}:${rest.toString().padStart(2, "0")}`;
}

function formatShortDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(new Date(value));
}

function uid(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function getStreak(sessions: PracticeSession[]) {
  const days = new Set(
    sessions.map((session) => new Date(session.startedAt).toLocaleDateString("en-CA")),
  );
  let streak = 0;
  const cursor = new Date();
  const today = cursor.toLocaleDateString("en-CA");
  if (!days.has(today)) cursor.setDate(cursor.getDate() - 1);
  while (days.has(cursor.toLocaleDateString("en-CA"))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function buildContext(state: StoredState) {
  const { profile, memories, sessions } = state;
  const recent = sessions
    .slice(0, 3)
    .map((session) => session.summary?.summary)
    .filter(Boolean)
    .join("\n- ");
  return [
    `My name: ${profile.name || "Not shared yet"}`,
    `My work: ${profile.job || "Not shared yet"}`,
    `My English goal: ${profile.goal}`,
    `My interests: ${profile.interests || "Learn these naturally"}`,
    `My personality and preferences: ${profile.personality}`,
    `Correction style: ${profile.correctionStyle}`,
    memories.length ? `Things to remember:\n- ${memories.slice(0, 20).map((memory) => memory.text).join("\n- ")}` : "",
    recent ? `Recent conversation summaries:\n- ${recent}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

function NavButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button className={`nav-button ${active ? "active" : ""}`} onClick={onClick} aria-current={active ? "page" : undefined}>
      {icon}
      <span>{label}</span>
    </button>
  );
}

export function CompanionApp() {
  const [tab, setTab] = useState<Tab>("today");
  const [data, setData] = useState<StoredState>(EMPTY_STATE);
  const [hydrated, setHydrated] = useState(false);
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [seconds, setSeconds] = useState(0);
  const [transcript, setTranscript] = useState<TranscriptLine[]>([]);
  const [selectedSession, setSelectedSession] = useState<PracticeSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showSetup, setShowSetup] = useState(false);
  const [newMemory, setNewMemory] = useState("");
  const [isTranscriptPinned, setIsTranscriptPinned] = useState(true);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("connecting");

  const peerRef = useRef<RTCPeerConnection | null>(null);
  const channelRef = useRef<RTCDataChannel | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const startedAtRef = useRef<string | null>(null);
  const transcriptRef = useRef<TranscriptLine[]>([]);
  const assistantDraftRef = useRef<{ id: string; text: string } | null>(null);
  const inputDraftsRef = useRef<Map<string, string>>(new Map());
  const transcriptScrollRef = useRef<HTMLDivElement | null>(null);
  const dataRef = useRef<StoredState>(EMPTY_STATE);
  const cloudRevisionRef = useRef(0);
  const syncReadyRef = useRef(false);
  const lastSyncedJsonRef = useRef("");

  const pushCloudState = useCallback(async (state: StoredState) => {
    setSyncStatus("syncing");
    try {
      const response = await fetch("/api/sync", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          data: state,
          baseRevision: cloudRevisionRef.current,
        }),
      });

      if (response.status === 401) {
        setSyncStatus("local");
        return false;
      }

      if (response.status === 409) {
        const conflict = (await response.json()) as {
          data?: unknown;
          revision?: number;
        };
        const cloud = normalizeStoredState(conflict.data);
        cloudRevisionRef.current = conflict.revision ?? 0;
        lastSyncedJsonRef.current = JSON.stringify(cloud);
        const merged = mergeStoredStates(dataRef.current, cloud, true);
        dataRef.current = merged;
        setData(merged);
        setSyncStatus("syncing");
        return false;
      }

      if (!response.ok) throw new Error("sync_failed");
      const result = (await response.json()) as { revision?: number };
      cloudRevisionRef.current = result.revision ?? cloudRevisionRef.current + 1;
      lastSyncedJsonRef.current = JSON.stringify(state);
      setSyncStatus("synced");
      return true;
    } catch {
      setSyncStatus("offline");
      return false;
    }
  }, []);

  const pullCloudState = useCallback(async () => {
    setSyncStatus("syncing");
    try {
      const response = await fetch("/api/sync", { cache: "no-store" });
      if (response.status === 401) {
        setSyncStatus("local");
        return;
      }
      if (!response.ok) throw new Error("sync_failed");
      const result = (await response.json()) as {
        data?: unknown;
        revision?: number;
      };
      const cloud = result.data ? normalizeStoredState(result.data) : null;
      cloudRevisionRef.current = result.revision ?? 0;

      if (!cloud) {
        lastSyncedJsonRef.current = JSON.stringify(EMPTY_STATE);
        if (JSON.stringify(dataRef.current) !== lastSyncedJsonRef.current) {
          await pushCloudState(dataRef.current);
        } else {
          setSyncStatus("synced");
        }
        return;
      }

      lastSyncedJsonRef.current = JSON.stringify(cloud);
      const merged = mergeStoredStates(dataRef.current, cloud);
      dataRef.current = merged;
      setData(merged);
      if (JSON.stringify(merged) !== lastSyncedJsonRef.current) {
        await pushCloudState(merged);
      } else {
        setSyncStatus("synced");
      }
    } catch {
      setSyncStatus("offline");
    }
  }, [pushCloudState]);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        let local = EMPTY_STATE;
        try {
          const saved = localStorage.getItem(STORAGE_KEY);
          if (saved) local = normalizeStoredState(JSON.parse(saved));
        } catch {
          setError("I couldn't read the saved memory on this device.");
        }

        if (cancelled) return;
        dataRef.current = local;
        setData(local);

        try {
          const response = await fetch("/api/sync", { cache: "no-store" });
          if (cancelled) return;
          if (response.status === 401) {
            setSyncStatus("local");
          } else if (response.ok) {
            const result = (await response.json()) as {
              data?: unknown;
              revision?: number;
            };
            cloudRevisionRef.current = result.revision ?? 0;
            if (result.data) {
              const cloud = normalizeStoredState(result.data);
              lastSyncedJsonRef.current = JSON.stringify(cloud);
              const merged = mergeStoredStates(local, cloud);
              dataRef.current = merged;
              setData(merged);
            } else {
              lastSyncedJsonRef.current = JSON.stringify(EMPTY_STATE);
            }
            setSyncStatus("synced");
          } else {
            setSyncStatus("offline");
          }
        } catch {
          setSyncStatus("offline");
        } finally {
          if (!cancelled) {
            syncReadyRef.current = true;
            setHydrated(true);
          }
        }
      })();
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    dataRef.current = data;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    if (!syncReadyRef.current) return;

    const serialized = JSON.stringify(data);
    if (serialized === lastSyncedJsonRef.current) return;
    setSyncStatus("syncing");
    const timer = window.setTimeout(() => {
      void pushCloudState(data);
    }, 900);
    return () => window.clearTimeout(timer);
  }, [data, hydrated, pushCloudState]);

  useEffect(() => {
    transcriptRef.current = transcript;
  }, [transcript]);

  useEffect(() => {
    const scroller = transcriptScrollRef.current;
    if (!scroller || !isTranscriptPinned) return;
    const frame = window.requestAnimationFrame(() => {
      scroller.scrollTo({ top: scroller.scrollHeight, behavior: "smooth" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [transcript, isTranscriptPinned]);

  useEffect(() => {
    if (voiceState === "idle" || voiceState === "summarizing") return;
    const timer = window.setInterval(() => setSeconds((current) => current + 1), 1000);
    return () => window.clearInterval(timer);
  }, [voiceState]);

  useEffect(() => {
    return () => {
      micStreamRef.current?.getTracks().forEach((track) => track.stop());
      peerRef.current?.close();
    };
  }, []);

  const streak = useMemo(() => getStreak(data.sessions), [data.sessions]);
  const totalMinutes = useMemo(
    () => Math.round(data.sessions.reduce((total, session) => total + session.durationSeconds, 0) / 60),
    [data.sessions],
  );

  const updateTranscript = useCallback((lines: TranscriptLine[]) => {
    transcriptRef.current = lines;
    setTranscript(lines);
  }, []);

  const addFinalLine = useCallback(
    (role: TranscriptLine["role"], text: string, id = uid(role)) => {
      const clean = text.trim();
      if (!clean) return;
      const existing = transcriptRef.current.find((line) => line.id === id);
      const next = existing
        ? transcriptRef.current.map((line) =>
            line.id === id ? { ...line, text: clean, final: true } : line,
          )
        : [...transcriptRef.current, { id, role, text: clean, final: true }];
      updateTranscript(next);
    },
    [updateTranscript],
  );

  const appendAssistantDelta = useCallback(
    (delta: string, eventId?: string) => {
      if (!delta) return;
      const id = eventId || assistantDraftRef.current?.id || uid("mellow");
      const current = assistantDraftRef.current?.id === id ? assistantDraftRef.current.text : "";
      const text = current + delta;
      assistantDraftRef.current = { id, text };
      const exists = transcriptRef.current.some((line) => line.id === id);
      const next = exists
        ? transcriptRef.current.map((line) => (line.id === id ? { ...line, text } : line))
        : [...transcriptRef.current, { id, role: "mellow" as const, text, final: false }];
      updateTranscript(next);
    },
    [updateTranscript],
  );

  const appendInputDelta = useCallback(
    (delta: string, eventId?: string) => {
      if (!delta) return;
      const id = eventId || "current-input";
      const text = (inputDraftsRef.current.get(id) ?? "") + delta;
      inputDraftsRef.current.set(id, text);
      const exists = transcriptRef.current.some((line) => line.id === id);
      const next = exists
        ? transcriptRef.current.map((line) =>
            line.id === id ? { ...line, text, final: false } : line,
          )
        : [...transcriptRef.current, { id, role: "me" as const, text, final: false }];
      updateTranscript(next);
    },
    [updateTranscript],
  );

  const handleRealtimeEvent = useCallback(
    (event: RealtimeEvent) => {
      switch (event.type) {
        case "input_audio_buffer.speech_started":
          setVoiceState("listening");
          break;
        case "input_audio_buffer.speech_stopped":
          setVoiceState("thinking");
          break;
        case "conversation.item.input_audio_transcription.delta":
        case "input_audio_transcription.delta":
          setVoiceState("listening");
          appendInputDelta(event.delta ?? "", event.item_id);
          break;
        case "conversation.item.input_audio_transcription.completed":
        case "input_audio_transcription.completed": {
          addFinalLine("me", event.transcript ?? "", event.item_id);
          if (event.item_id) inputDraftsRef.current.delete(event.item_id);
          break;
        }
        case "response.output_audio_transcript.delta":
        case "response.audio_transcript.delta":
          setVoiceState("speaking");
          appendAssistantDelta(event.delta ?? "", event.item_id ?? event.response_id);
          break;
        case "response.output_audio_transcript.done":
        case "response.audio_transcript.done": {
          const draft = assistantDraftRef.current;
          if (draft) addFinalLine("mellow", event.transcript || draft.text, draft.id);
          assistantDraftRef.current = null;
          break;
        }
        case "response.done":
          setVoiceState("listening");
          break;
        case "error":
          setError(event.error?.message || "The voice session hit a problem.");
          break;
      }
    },
    [addFinalLine, appendAssistantDelta, appendInputDelta],
  );

  const closeConnection = useCallback(() => {
    micStreamRef.current?.getTracks().forEach((track) => track.stop());
    micStreamRef.current = null;
    channelRef.current?.close();
    channelRef.current = null;
    peerRef.current?.close();
    peerRef.current = null;
    remoteAudioRef.current?.pause();
    remoteAudioRef.current = null;
  }, []);

  const startConversation = useCallback(async () => {
    setError(null);
    setTranscript([]);
    transcriptRef.current = [];
    assistantDraftRef.current = null;
    inputDraftsRef.current.clear();
    setIsTranscriptPinned(true);
    setSeconds(0);
    setVoiceState("connecting");

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("This browser doesn't support microphone conversations.");
      }

      const pc = new RTCPeerConnection();
      peerRef.current = pc;
      const audio = new Audio();
      audio.autoplay = true;
      remoteAudioRef.current = audio;
      pc.ontrack = (event) => {
        audio.srcObject = event.streams[0];
        void audio.play().catch(() => undefined);
      };

      const mic = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      micStreamRef.current = mic;
      mic.getTracks().forEach((track) => pc.addTrack(track, mic));

      const channel = pc.createDataChannel("oai-events");
      channelRef.current = channel;
      channel.onmessage = (message) => {
        try {
          handleRealtimeEvent(JSON.parse(message.data) as RealtimeEvent);
        } catch {
          // Ignore non-JSON transport messages.
        }
      };
      channel.onopen = () => {
        startedAtRef.current = new Date().toISOString();
        setVoiceState("listening");
        channel.send(
          JSON.stringify({
            type: "response.create",
            response: {
              output_modalities: ["audio"],
              instructions: data.sessions.length
                ? "Greet me warmly, naturally reconnect with something from our recent context, and ask one easy question to begin today's English conversation."
                : "Greet me warmly, introduce yourself as Mellow in one short sentence, and ask one easy question about my day. Do not explain the app.",
            },
          }),
        );
      };
      channel.onerror = () => setError("The live conversation connection was interrupted.");

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      const response = await fetch("/api/realtime", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sdp: offer.sdp,
          context: buildContext(data),
        }),
      });

      if (!response.ok) {
        const detail = (await response.json().catch(() => ({}))) as {
          error?: string;
          message?: string;
        };
        if (detail.error === "missing_api_key") setShowSetup(true);
        throw new Error(detail.message || "I couldn't start the voice conversation.");
      }

      const answerSdp = await response.text();
      await pc.setRemoteDescription({ type: "answer", sdp: answerSdp });
    } catch (caught) {
      closeConnection();
      setVoiceState("idle");
      setError(caught instanceof Error ? caught.message : "I couldn't start the conversation.");
    }
  }, [closeConnection, data, handleRealtimeEvent]);

  const summarizeSession = useCallback(
    async (session: PracticeSession) => {
      try {
        const response = await fetch("/api/summary", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ transcript: session.transcript }),
        });
        if (!response.ok) return;
        const summary = (await response.json()) as SessionSummary;
        setData((current) => {
          const hasMemory =
            summary.memoryNote &&
            current.memories.some(
              (memory) => memory.text.toLowerCase() === summary.memoryNote.toLowerCase(),
            );
          return {
            ...current,
            sessions: current.sessions.map((item) =>
              item.id === session.id ? { ...item, summary } : item,
            ),
            memories:
              summary.memoryNote && !hasMemory
                ? [
                    {
                      id: uid("memory"),
                      text: summary.memoryNote,
                      createdAt: new Date().toISOString(),
                    },
                    ...current.memories,
                  ]
                : current.memories,
          };
        });
        setSelectedSession({ ...session, summary });
      } finally {
        setVoiceState("idle");
      }
    },
    [],
  );

  const stopConversation = useCallback(async () => {
    const startedAt = startedAtRef.current ?? new Date().toISOString();
    const finalTranscript = transcriptRef.current
      .map((line) => ({ ...line, final: true, text: line.text.trim() }))
      .filter((line) => line.text);
    closeConnection();
    startedAtRef.current = null;

    if (!finalTranscript.length) {
      setVoiceState("idle");
      return;
    }

    const session: PracticeSession = {
      id: uid("session"),
      startedAt,
      durationSeconds: Math.max(seconds, 1),
      transcript: finalTranscript,
    };
    setData((current) => ({ ...current, sessions: [session, ...current.sessions] }));
    setSelectedSession(session);
    setVoiceState("summarizing");
    await summarizeSession(session);
  }, [closeConnection, seconds, summarizeSession]);

  const addMemory = () => {
    const text = newMemory.trim();
    if (!text) return;
    setData((current) => ({
      ...current,
      memories: [{ id: uid("memory"), text, createdAt: new Date().toISOString() }, ...current.memories],
    }));
    setNewMemory("");
  };

  const exportData = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `mellow-backup-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const clearAll = async () => {
    if (!window.confirm("Delete all memories, conversations, and cloud data from every device?")) return;
    setSyncStatus("syncing");
    try {
      const response = await fetch("/api/sync", { method: "DELETE" });
      if (!response.ok && response.status !== 401) throw new Error("delete_failed");
      syncReadyRef.current = false;
      cloudRevisionRef.current = 0;
      lastSyncedJsonRef.current = JSON.stringify(EMPTY_STATE);
      dataRef.current = EMPTY_STATE;
      setData(EMPTY_STATE);
      setSelectedSession(null);
      localStorage.removeItem(STORAGE_KEY);
      syncReadyRef.current = true;
      setSyncStatus(response.status === 401 ? "local" : "synced");
    } catch {
      setSyncStatus("offline");
      setError("I couldn't delete the cloud copy. Nothing was removed—try again when you're online.");
    }
  };

  const isLive = voiceState !== "idle" && voiceState !== "summarizing";
  const latestSession = data.sessions[0];
  const syncLabel = {
    connecting: "Connecting private sync…",
    syncing: "Syncing…",
    synced: "Synced to your account",
    offline: "Offline — saved on this device",
    local: "Saved on this device",
  }[syncStatus];

  return (
    <main className="app-shell">
      <aside className="side-rail" aria-label="Main navigation">
        <button className="brand" onClick={() => setTab("today")} aria-label="Mellow home">
          <span className="brand-mark"><Sparkles size={20} /></span>
          <span className="brand-name">mellow</span>
        </button>
        <nav>
          <NavButton active={tab === "today"} icon={<Home size={19} />} label="Today" onClick={() => setTab("today")} />
          <NavButton active={tab === "history"} icon={<History size={19} />} label="History" onClick={() => setTab("history")} />
          <NavButton active={tab === "memory"} icon={<Heart size={19} />} label="Memory" onClick={() => setTab("memory")} />
        </nav>
        <div className="rail-bottom">
          <NavButton active={tab === "settings"} icon={<Settings size={19} />} label="Settings" onClick={() => setTab("settings")} />
          <div className={`private-chip sync-${syncStatus}`}><span /> {syncLabel}</div>
        </div>
      </aside>

      <section className="content-shell">
        {tab === "today" && (
          <div className="today-view page-enter">
            <header className="topbar">
              <div>
                <p className="eyebrow">YOUR DAILY SAFE SPACE</p>
                <h1>{data.profile.name ? `Good evening, ${data.profile.name}.` : "Good evening."}</h1>
              </div>
              <div className="streak-pill"><Sparkles size={15} /> {streak} day streak</div>
            </header>

            <section className={`voice-stage ${isLive ? "is-live" : ""}`}>
              <div className="ambient ambient-one" />
              <div className="ambient ambient-two" />
              <div className="voice-copy">
                <span className="mood-chip">
                  {voiceState === "idle" && <><span className="status-dot" /> Mellow is ready</>}
                  {voiceState === "connecting" && <>Opening our space…</>}
                  {voiceState === "listening" && <>I’m listening</>}
                  {voiceState === "thinking" && <>Thinking with you</>}
                  {voiceState === "speaking" && <>Mellow is speaking</>}
                  {voiceState === "summarizing" && <>Saving today’s little wins…</>}
                </span>
                <h2>{isLive ? "Take your time. I’m here." : "What’s on your mind today?"}</h2>
                <p>
                  {isLive
                    ? "Speak naturally—even when the words don’t come out perfectly."
                    : latestSession?.summary?.tomorrowQuestion || "Ten minutes of imperfect English is enough for today."}
                </p>
              </div>

              <div className="orb-wrap">
                <div className="orbit orbit-one" />
                <div className="orbit orbit-two" />
                <button
                  className={`voice-orb state-${voiceState}`}
                  onClick={isLive ? () => void stopConversation() : () => void startConversation()}
                  disabled={voiceState === "connecting" || voiceState === "summarizing"}
                  aria-label={isLive ? "End conversation" : "Start conversation"}
                >
                  <span className="wave-bars" aria-hidden="true">
                    {[1, 2, 3, 4, 5].map((bar) => <i key={bar} />)}
                  </span>
                  {isLive ? <MicOff className="orb-icon" size={28} /> : <Mic className="orb-icon" size={28} />}
                </button>
                <p className="orb-label">
                  {isLive ? `${formatDuration(seconds)} · tap to finish` : "Tap to start talking"}
                </p>
              </div>

            </section>

            {(isLive || transcript.length > 0) && (
              <section className="live-transcript" aria-label="Live conversation transcript">
                <div className="transcript-toolbar">
                  <div>
                    <span className="live-indicator" aria-hidden="true" />
                    <div>
                      <h3>Live transcript</h3>
                      <p>This is what Mellow hears — your original words are not grammar-corrected.</p>
                    </div>
                  </div>
                  <span className="transcript-count">{transcript.length} {transcript.length === 1 ? "turn" : "turns"}</span>
                </div>

                <div
                  className="transcript-scroll"
                  ref={transcriptScrollRef}
                  role="region"
                  aria-label="Scrollable live transcript"
                  onScroll={(event) => {
                    const node = event.currentTarget;
                    const distanceFromBottom = node.scrollHeight - node.scrollTop - node.clientHeight;
                    setIsTranscriptPinned(distanceFromBottom < 36);
                  }}
                >
                  {transcript.length === 0 ? (
                    <div className="transcript-empty">
                      <Mic size={18} />
                      <p>Start speaking. Your words will appear here while you talk.</p>
                    </div>
                  ) : (
                    transcript.map((line) => (
                      <article
                        key={line.id}
                        className={`transcript-line ${line.role === "me" ? "is-me" : "is-mellow"} ${line.final ? "" : "is-draft"}`}
                      >
                        <span>{line.role === "me" ? "You" : "Mellow"}</span>
                        <p>
                          {line.text}
                          {!line.final && <i className="typing-cursor" aria-label="Transcribing live" />}
                        </p>
                      </article>
                    ))
                  )}
                </div>

                {!isTranscriptPinned && (
                  <button
                    className="jump-latest"
                    onClick={() => {
                      setIsTranscriptPinned(true);
                      transcriptScrollRef.current?.scrollTo({
                        top: transcriptScrollRef.current.scrollHeight,
                        behavior: "smooth",
                      });
                    }}
                  >
                    <ArrowDown size={14} /> Latest sentence
                  </button>
                )}
              </section>
            )}

            {error && (
              <div className="notice error-notice">
                <span><X size={17} /></span>
                <p>{error}</p>
                {showSetup && <button onClick={() => setShowSetup(true)}>Finish setup</button>}
              </div>
            )}

            <section className="today-grid">
              <article className="soft-card intention-card">
                <div className="card-icon peach"><Heart size={19} /></div>
                <div>
                  <p className="card-kicker">TODAY’S INTENTION</p>
                  <h3>Be understood, not perfect.</h3>
                  <p>If a word gets lost, try another way. That is real communication.</p>
                </div>
              </article>
              <article className="soft-card progress-card">
                <div className="progress-ring" style={{ "--progress": `${Math.min((seconds / 600) * 360, 360)}deg` } as React.CSSProperties}>
                  <span>{Math.min(Math.floor(seconds / 60), 10)}<small>/10</small></span>
                </div>
                <div>
                  <p className="card-kicker">TODAY’S PRACTICE</p>
                  <h3>{seconds ? `${formatDuration(seconds)} together` : "A gentle 10 minutes"}</h3>
                  <p>{totalMinutes ? `${totalMinutes} minutes spoken so far.` : "Your first conversation starts here."}</p>
                </div>
              </article>
            </section>

            {latestSession && (
              <button className="last-session-card" onClick={() => setSelectedSession(latestSession)}>
                <div className="session-date"><BookOpen size={18} /></div>
                <div>
                  <p>LAST CONVERSATION · {formatShortDate(latestSession.startedAt).toUpperCase()}</p>
                  <h3>{latestSession.summary?.title || "Your daily English check-in"}</h3>
                  <span>{latestSession.summary?.summary || `${latestSession.transcript.length} moments from your conversation are saved.`}</span>
                </div>
                <ChevronRight size={20} />
              </button>
            )}
          </div>
        )}

        {tab === "history" && (
          <div className="inner-page page-enter">
            <header className="section-header">
              <div><p className="eyebrow">YOUR ENGLISH JOURNEY</p><h1>Every conversation counts.</h1></div>
              <div className="metric-pair"><strong>{data.sessions.length}</strong><span>sessions</span><strong>{totalMinutes}</strong><span>minutes</span></div>
            </header>
            {data.sessions.length === 0 ? (
              <div className="empty-state"><div className="empty-icon"><Archive size={26} /></div><h2>Your story starts today.</h2><p>Finish a voice conversation and its recap will live here.</p><button onClick={() => setTab("today")}>Start talking</button></div>
            ) : (
              <div className="session-list">
                {data.sessions.map((session) => (
                  <button key={session.id} className="session-row" onClick={() => setSelectedSession(session)}>
                    <div className="session-day"><strong>{new Date(session.startedAt).getDate()}</strong><span>{new Date(session.startedAt).toLocaleString("en", { month: "short" })}</span></div>
                    <div><h3>{session.summary?.title || "Daily conversation"}</h3><p>{session.summary?.summary || "Your transcript is saved and ready to revisit."}</p><span className="duration"><Clock3 size={14} /> {formatDuration(session.durationSeconds)}</span></div>
                    <ChevronRight size={20} />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === "memory" && (
          <div className="inner-page page-enter">
            <header className="section-header"><div><p className="eyebrow">WHAT MELLOW KNOWS</p><h1>A friendship that remembers.</h1><p>These notes help tomorrow’s conversation feel like a continuation, not a restart.</p></div></header>
            <div className="memory-composer"><Heart size={20} /><input value={newMemory} onChange={(event) => setNewMemory(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") addMemory(); }} placeholder="Something you want Mellow to remember…" /><button onClick={addMemory} disabled={!newMemory.trim()}><Plus size={18} /> Remember</button></div>
            <div className="memory-grid">
              <article className="identity-card"><div className="profile-badge"><UserRound size={25} /></div><div><p>ABOUT YOU</p><h2>{data.profile.name || "Still getting to know you"}</h2><span>{data.profile.job || data.profile.goal}</span></div><button onClick={() => setTab("settings")}>Edit</button></article>
              {data.memories.map((memory) => (
                <article className="memory-card" key={memory.id}><div className="memory-spark"><Sparkles size={16} /></div><p>{memory.text}</p><span>{formatShortDate(memory.createdAt)}</span><button aria-label="Forget this memory" onClick={() => setData((current) => ({ ...current, memories: current.memories.filter((item) => item.id !== memory.id) }))}><X size={16} /></button></article>
              ))}
            </div>
            {!data.memories.length && <div className="empty-inline"><p>Mellow will add meaningful details here after your conversations. You can also add anything manually.</p></div>}
          </div>
        )}

        {tab === "settings" && (
          <div className="inner-page settings-page page-enter">
            <header className="section-header"><div><p className="eyebrow">MAKE IT YOURS</p><h1>How Mellow should know you.</h1></div></header>
            <section className="settings-card">
              <div className="settings-title"><div className="card-icon lavender"><UserRound size={19} /></div><div><h2>About me</h2><p>Saved privately to your Mellow account and available on your devices.</p></div></div>
              <div className="form-grid">
                <label><span>What should Mellow call you?</span><input value={data.profile.name} onChange={(event) => setData((current) => ({ ...current, profile: { ...current.profile, name: event.target.value } }))} placeholder="Your name" /></label>
                <label><span>What do you do?</span><input value={data.profile.job} onChange={(event) => setData((current) => ({ ...current, profile: { ...current.profile, job: event.target.value } }))} placeholder="Your work or current focus" /></label>
                <label className="full"><span>Your English goal</span><textarea value={data.profile.goal} onChange={(event) => setData((current) => ({ ...current, profile: { ...current.profile, goal: event.target.value } }))} rows={3} /></label>
                <label className="full"><span>Things you enjoy talking about</span><textarea value={data.profile.interests} onChange={(event) => setData((current) => ({ ...current, profile: { ...current.profile, interests: event.target.value } }))} placeholder="Games, work, movies, ideas, your day…" rows={3} /></label>
                <label className="full"><span>Your personality and conversation preferences</span><textarea value={data.profile.personality} onChange={(event) => setData((current) => ({ ...current, profile: { ...current.profile, personality: event.target.value } }))} rows={3} /></label>
              </div>
            </section>
            <section className="settings-card">
              <div className="settings-title"><div className="card-icon mint"><Volume2 size={19} /></div><div><h2>Correction style</h2><p>You can always ask for more or less feedback while talking.</p></div></div>
              <div className="choice-grid">
                {([
                  ["safe", "Safe space", "Never interrupt. Save feedback for the end."],
                  ["gentle", "Gentle", "Correct only when meaning becomes unclear."],
                  ["coach", "Coach", "Offer more active help while I speak."],
                ] as const).map(([value, title, description]) => (
                  <button key={value} className={data.profile.correctionStyle === value ? "selected" : ""} onClick={() => setData((current) => ({ ...current, profile: { ...current.profile, correctionStyle: value } }))}>
                    <span className="radio">{data.profile.correctionStyle === value && <Check size={14} />}</span><strong>{title}</strong><small>{description}</small>
                  </button>
                ))}
              </div>
            </section>
            <section className="settings-card sync-card">
              <div className="settings-title"><div className="card-icon mint"><Cloud size={19} /></div><div><h2>Private cloud sync</h2><p>Memory, History, profile, and learning recaps stay together on mobile and computer.</p></div></div>
              <div className="sync-row">
                <div className={`sync-state sync-${syncStatus}`}><span /> <strong>{syncLabel}</strong></div>
                <button onClick={() => void pullCloudState()} disabled={syncStatus === "syncing" || syncStatus === "connecting"}>
                  <RefreshCw size={16} /> Sync now
                </button>
              </div>
            </section>
            <section className="settings-card data-card">
              <div className="settings-title"><div className="card-icon peach"><Archive size={19} /></div><div><h2>Your data</h2><p>Back up everything or remove it from the cloud and every synced device.</p></div></div>
              <div className="data-actions"><button onClick={exportData}><Download size={17} /> Export backup</button><button className="danger" onClick={() => void clearAll()}><Trash2 size={17} /> Delete everywhere</button></div>
            </section>
          </div>
        )}
      </section>

      <nav className="mobile-nav" aria-label="Mobile navigation">
        <NavButton active={tab === "today"} icon={<Home size={20} />} label="Today" onClick={() => setTab("today")} />
        <NavButton active={tab === "history"} icon={<History size={20} />} label="History" onClick={() => setTab("history")} />
        <NavButton active={tab === "memory"} icon={<Heart size={20} />} label="Memory" onClick={() => setTab("memory")} />
        <NavButton active={tab === "settings"} icon={<Settings size={20} />} label="Settings" onClick={() => setTab("settings")} />
      </nav>

      {selectedSession && (
        <div className="modal-backdrop">
          <article className="session-modal" role="dialog" aria-modal="true" aria-label="Conversation recap">
            <button className="modal-close" onClick={() => setSelectedSession(null)} aria-label="Close recap"><X size={20} /></button>
            <div className="recap-hero"><span><BookOpen size={18} /> {formatShortDate(selectedSession.startedAt)} · {formatDuration(selectedSession.durationSeconds)}</span><h2>{selectedSession.summary?.title || "Conversation saved"}</h2><p>{selectedSession.summary?.summary || "Your transcript is safely stored. The learning recap will appear when the AI connection is available."}</p></div>
            {selectedSession.summary && (
              <div className="recap-grid">
                <section><p className="card-kicker">SAY IT MORE NATURALLY</p>{selectedSession.summary.naturalSentences.map((sentence) => <div className="phrase-line" key={sentence}><Check size={15} /> {sentence}</div>)}</section>
                <section><p className="card-kicker">KEEP THESE PHRASES</p><div className="tag-list">{selectedSession.summary.usefulPhrases.map((phrase) => <span key={phrase}>{phrase}</span>)}</div></section>
                <section><p className="card-kicker">ONE SOUND TO PRACTISE</p><p>{selectedSession.summary.pronunciation}</p></section>
                <section><p className="card-kicker">FOR TOMORROW</p><p>{selectedSession.summary.tomorrowQuestion}</p></section>
              </div>
            )}
            <details className="transcript-details"><summary>Read transcript <ChevronRight size={16} /></summary><div>{selectedSession.transcript.map((line) => <p key={line.id}><strong>{line.role === "me" ? "You" : "Mellow"}</strong>{line.text}</p>)}</div></details>
          </article>
        </div>
      )}

      {showSetup && (
        <div className="modal-backdrop">
          <article className="setup-modal" role="dialog" aria-modal="true" aria-label="Finish voice setup">
            <button className="modal-close" onClick={() => setShowSetup(false)} aria-label="Close setup"><X size={20} /></button>
            <div className="setup-icon"><Headphones size={27} /></div>
            <p className="eyebrow">ONE LAST CONNECTION</p>
            <h2>Mellow is built. Voice needs an OpenAI API key.</h2>
            <p>Your Plus subscription cannot power realtime audio inside this separate app. The key stays on the server and is never stored in your browser.</p>
            <ol>
              <li><span>1</span><div>Create a project key at <a href="https://platform.openai.com/api-keys" target="_blank" rel="noreferrer">platform.openai.com/api-keys</a>.</div></li>
              <li><span>2</span><div>Put it in <code>.env.local</code> as <code>OPENAI_API_KEY</code>.</div></li>
              <li><span>3</span><div>Restart the app, then tap the microphone.</div></li>
            </ol>
            <button className="primary-setup" onClick={() => setShowSetup(false)}>Got it</button>
          </article>
        </div>
      )}
    </main>
  );
}
