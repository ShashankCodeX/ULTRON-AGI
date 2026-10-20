"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createOrbScene, type OrbSceneApi } from "@/lib/orbScene";
import { HandTracker, type TrackerStatus } from "@/lib/handTracker";

type CameraState = "off" | "starting" | "on" | "error";
type VoiceState = "idle" | "listening" | "thinking";

declare global {
  interface Window {
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    SpeechRecognition?: new () => SpeechRecognitionLike;
  }
}

interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  continuous?: boolean;
  start: () => void;
  stop: () => void;
  onstart: (() => void) | null;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
}

const MODE_LABEL: Record<TrackerStatus["mode"], string> = {
  idle: "STANDBY",
  spin: "SPIN",
  zoom: "ZOOM",
};

export default function UltronOrb() {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<OrbSceneApi | null>(null);
  const trackerRef = useRef<HandTracker | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const wakeRecognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordingTimerRef = useRef<number | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const voiceStateRef = useRef<VoiceState>("idle");

  const [camera, setCamera] = useState<CameraState>("off");
  const [status, setStatus] = useState<TrackerStatus>({ hands: 0, mode: "idle" });
  const [error, setError] = useState<string | null>(null);
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [voiceText, setVoiceText] = useState<string>("READY");
  const [voiceInput, setVoiceInput] = useState<string>("");

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const scene = createOrbScene(container);
    sceneRef.current = scene;
    return () => {
      trackerRef.current?.stop();
      trackerRef.current = null;
      scene.dispose();
      sceneRef.current = null;
    };
  }, []);

  const stopGestures = useCallback(() => {
    trackerRef.current?.stop();
    trackerRef.current = null;
    setCamera("off");
    setStatus({ hands: 0, mode: "idle" });
  }, []);

  const startGestures = useCallback(async () => {
    const video = videoRef.current;
    const overlay = overlayRef.current;
    if (!video || !overlay || trackerRef.current) return;

    setCamera("starting");
    setError(null);

    const tracker = new HandTracker(video, overlay, {
      onRotate: (dt, dp) => sceneRef.current?.rotateBy(dt, dp),
      onZoom: (factor) => sceneRef.current?.zoomBy(factor),
      onStatus: setStatus,
    });
    trackerRef.current = tracker;

    try {
      await tracker.start();
      setCamera("on");
    } catch (err) {
      trackerRef.current = null;
      tracker.stop();
      setCamera("error");
      setError(
        err instanceof DOMException && err.name === "NotAllowedError"
          ? "CAMERA ACCESS DENIED"
          : "TRACKING INIT FAILED",
      );
    }
  }, []);

  const toggleGestures = useCallback(() => {
    if (trackerRef.current) stopGestures();
    else void startGestures();
  }, [startGestures, stopGestures]);

  const speakAnswer = useCallback((answer: string) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const utterance = new SpeechSynthesisUtterance(answer);
    utterance.rate = 1;
    utterance.pitch = 1;
    utterance.volume = 1;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  }, []);

  const sendQuestion = useCallback(
    async (question: string) => {
      const prompt = question.trim();
      if (!prompt) return;

      if (/^(hi|hey|hello)\s+ultron[.! ]*$/i.test(prompt)) {
        const greeting = "Hello. I am Ultron. How may I assist you?";
        setVoiceText(greeting);
        speakAnswer(greeting);
        return;
      }

      setVoiceState("thinking");
      voiceStateRef.current = "thinking";
      setVoiceText("PROCESSING...");

      try {
        const response = await fetch("/api/ask", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt }),
        });

        const data = await response.json();
        if (!response.ok) {
          throw new Error(data?.error || "Voice assistant request failed");
        }

        const answer = data.answer || "I did not get a response.";
        setVoiceText(answer);
        speakAnswer(answer);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Voice link failed";
        setVoiceText(message);
      } finally {
        setVoiceState("idle");
        voiceStateRef.current = "idle";
      }
    },
    [speakAnswer],
  );

  const startAudioRecording = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      setVoiceText("MICROPHONE RECORDING UNAVAILABLE");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      audioChunksRef.current = [];
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        if (recordingTimerRef.current !== null) {
          window.clearTimeout(recordingTimerRef.current);
          recordingTimerRef.current = null;
        }
        stream.getTracks().forEach((track) => track.stop());
        recorderRef.current = null;
        const audio = new Blob(audioChunksRef.current, { type: recorder.mimeType });
        if (!audio.size) {
          setVoiceState("idle");
          voiceStateRef.current = "idle";
          setVoiceText("NO AUDIO CAPTURED");
          return;
        }

        const reader = new FileReader();
        reader.onloadend = () => {
          const base64 = String(reader.result).split(",")[1];
          void sendAudioQuestion(base64, recorder.mimeType);
        };
        reader.readAsDataURL(audio);
      };
      recorder.start();
      recordingTimerRef.current = window.setTimeout(() => {
        if (recorder.state === "recording") recorder.stop();
      }, 5000);
      setVoiceState("listening");
      voiceStateRef.current = "listening";
      setVoiceText("LISTENING... SPEAK NOW");
    } catch (err) {
      setVoiceState("idle");
      voiceStateRef.current = "idle";
      setVoiceText(err instanceof DOMException && err.name === "NotAllowedError" ? "MICROPHONE ACCESS DENIED" : "MICROPHONE FAILED");
    }
  }, [sendQuestion]);

  const sendAudioQuestion = useCallback(
    async (audio: string, mimeType: string) => {
      setVoiceState("thinking");
      voiceStateRef.current = "thinking";
      setVoiceText("PROCESSING AUDIO...");
      try {
        const response = await fetch("/api/ask", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ audio, mimeType }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data?.error || "Voice assistant request failed");
        const answer = data.answer || "I did not get a response.";
        setVoiceText(answer);
        speakAnswer(answer);
      } catch (err) {
        setVoiceText(err instanceof Error ? err.message : "VOICE LINK FAILED");
      } finally {
        setVoiceState("idle");
        voiceStateRef.current = "idle";
      }
    },
    [speakAnswer],
  );

  const startListening = useCallback(() => {
    const SpeechRecognitionCtor =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognitionCtor) {
      setVoiceText("VOICE UNAVAILABLE");
      return;
    }

    const recognition = new SpeechRecognitionCtor();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setVoiceState("listening");
      voiceStateRef.current = "listening";
      setVoiceText("LISTENING...");
    };

    recognition.onresult = (event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => {
      const transcript = event.results[0][0].transcript;
      setVoiceText(transcript);
      void sendQuestion(transcript);
    };

    recognition.onerror = (event: { error?: string }) => {
      setVoiceText(`VOICE ERROR: ${event.error || "UNKNOWN"}`);
      setVoiceState("idle");
      voiceStateRef.current = "idle";
    };

    recognition.onend = () => {
      if (voiceStateRef.current !== "thinking") {
        setVoiceState("idle");
        voiceStateRef.current = "idle";
      }
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch (err) {
      setVoiceState("idle");
      voiceStateRef.current = "idle";
      setVoiceText(err instanceof Error ? err.message : "VOICE START FAILED");
    }
  }, [sendQuestion]);

  const startWakeListener = useCallback(() => {
    const SpeechRecognitionCtor =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognitionCtor) {
      setVoiceText("SAY HI ULTRON OR CLICK VOICE");
      return;
    }

    const recognition = new SpeechRecognitionCtor();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.continuous = true;

    recognition.onstart = () => {
      setVoiceState("listening");
      voiceStateRef.current = "listening";
      setVoiceText("WAITING FOR HI ULTRON...");
    };

    recognition.onresult = (event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => {
      for (let index = 0; index < event.results.length; index += 1) {
        const transcript = event.results[index][0]?.transcript.toLowerCase() || "";
        if (transcript.includes("hi ultron") || transcript.includes("hey ultron")) {
          recognition.stop();
          wakeRecognitionRef.current = null;
          setVoiceState("thinking");
          voiceStateRef.current = "thinking";
          const greeting = "Hello. I am Ultron. How may I assist you?";
          setVoiceText(greeting);
          speakAnswer(greeting);
          setVoiceState("idle");
          voiceStateRef.current = "idle";
          return;
        }
      }
    };

    recognition.onerror = () => {
      wakeRecognitionRef.current = null;
      setVoiceState("idle");
      voiceStateRef.current = "idle";
      setVoiceText("WAKE WORD UNAVAILABLE - CLICK VOICE");
    };

    recognition.onend = () => {
      if (wakeRecognitionRef.current === recognition) {
        wakeRecognitionRef.current = null;
        setVoiceState("idle");
        voiceStateRef.current = "idle";
        setVoiceText("WAKE WORD PAUSED - CLICK VOICE");
      }
    };

    wakeRecognitionRef.current = recognition;
    try {
      recognition.start();
    } catch {
      wakeRecognitionRef.current = null;
      setVoiceState("idle");
      voiceStateRef.current = "idle";
      setVoiceText("WAKE WORD UNAVAILABLE - CLICK VOICE");
    }
  }, [speakAnswer]);

  const submitTextQuestion = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const question = voiceInput.trim();
      if (!question) return;
      setVoiceInput("");
      void sendQuestion(question);
    },
    [sendQuestion, voiceInput],
  );

  const toggleVoice = useCallback(() => {
    if (voiceStateRef.current === "listening" || voiceStateRef.current === "thinking") {
      recognitionRef.current?.stop();
      recorderRef.current?.stop();
      if (recordingTimerRef.current !== null) {
        window.clearTimeout(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }
      setVoiceState("idle");
      voiceStateRef.current = "idle";
      return;
    }

    void startAudioRecording();
  }, [startAudioRecording]);

  useEffect(() => {
    const timer = window.setTimeout(startWakeListener, 500);
    const onKey = (e: KeyboardEvent) => {
      switch (e.key) {
        case "+":
        case "=":
          sceneRef.current?.zoomIn();
          break;
        case "-":
        case "_":
          sceneRef.current?.zoomOut();
          break;
        case "r":
        case "R":
          sceneRef.current?.resetView();
          break;
        case "g":
        case "G":
          toggleGestures();
          break;
        case "v":
        case "V":
          toggleVoice();
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("keydown", onKey);
      wakeRecognitionRef.current?.stop();
      wakeRecognitionRef.current = null;
    };
  }, [startWakeListener, toggleGestures, toggleVoice]);

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
      wakeRecognitionRef.current?.stop();
      recorderRef.current?.stop();
      if (typeof window !== "undefined") {
        window.speechSynthesis?.cancel();
      }
    };
  }, []);

  const cameraOn = camera === "on";

  return (
    <>
      <div ref={containerRef} className="orb-root" />

      <div className="overlay-vignette" />
      <div className="overlay-grain" />
      <div className="overlay-scanlines" />

      <div className="hud hud-title">U.L.T.R.O.N.</div>

      <div className="hud hud-hint">
        <div>
          <span className="key">DRAG</span> spin&nbsp;&nbsp;
          <span className="key">SCROLL</span> zoom
        </div>
        {cameraOn ? (
          <div>
            <span className="key">PINCH + MOVE</span> spin&nbsp;&nbsp;
            <span className="key">PINCH BOTH HANDS ± SPREAD</span> zoom
          </div>
        ) : (
          <div>
            <span className="key">G</span> hand gestures&nbsp;&nbsp;
            <span className="key">R</span> reset&nbsp;&nbsp;
            <span className="key">+/−</span> zoom
          </div>
        )}
      </div>

      <div className="hud hud-voice">
        <button
          type="button"
          className="hud-btn"
          onClick={toggleVoice}
          aria-label="Toggle voice assistant"
        >
          {voiceState === "listening" ? "LISTENING" : voiceState === "thinking" ? "THINKING" : "VOICE"}
        </button>
        <form className="voice-form" onSubmit={submitTextQuestion}>
          <input
            value={voiceInput}
            onChange={(event) => setVoiceInput(event.target.value)}
            placeholder="TYPE COMMAND"
            aria-label="Type a command"
          />
          <button type="submit" className="hud-btn" aria-label="Send typed command">
            SEND
          </button>
        </form>
        <div className="voice-output">{voiceText}</div>
      </div>

      <div className="hud hud-controls">
        <div className={`camera-panel${cameraOn ? " visible" : ""}`}>
          {/* Mirrored preview so it behaves like a mirror */}
          <video ref={videoRef} muted playsInline className="camera-video" />
          <canvas ref={overlayRef} width={208} height={156} className="camera-overlay" />
          <div className="camera-status">
            {status.hands > 0
              ? `${status.hands} HAND${status.hands > 1 ? "S" : ""} · ${MODE_LABEL[status.mode]}`
              : "SHOW HANDS"}
          </div>
        </div>

        {error && <div className="hud-error">{error}</div>}

        <div className="hud-row">
          <button
            type="button"
            className="hud-btn"
            aria-pressed={cameraOn}
            onClick={toggleGestures}
            disabled={camera === "starting"}
          >
            {camera === "starting" ? "INITIALIZING…" : cameraOn ? "GESTURES ON" : "GESTURES OFF"}
          </button>
        </div>
        <div className="hud-row">
          <button type="button" className="hud-btn" onClick={() => sceneRef.current?.zoomIn()} aria-label="Zoom in">
            +
          </button>
          <button type="button" className="hud-btn" onClick={() => sceneRef.current?.zoomOut()} aria-label="Zoom out">
            −
          </button>
          <button type="button" className="hud-btn" onClick={() => sceneRef.current?.resetView()}>
            RESET
          </button>
        </div>
      </div>
    </>
  );
}
