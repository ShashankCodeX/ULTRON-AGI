import { spawn } from "node:child_process";
import { NextRequest, NextResponse } from "next/server";

function runMarkLBridge(payload: Record<string, string | undefined>) {
  return new Promise<string>((resolve, reject) => {
    const pythonPath = process.env.MARK_L_PYTHON;
    const bridgePath = process.env.MARK_L_BRIDGE;
    const markLRoot = process.env.MARK_L_ROOT;
    if (!pythonPath || !bridgePath || !markLRoot) {
      reject(new Error("Mark-L bridge is not configured"));
      return;
    }
    const bridge = spawn(pythonPath, [bridgePath], { cwd: markLRoot });
    let output = "";
    let errorOutput = "";

    bridge.stdout.on("data", (chunk: Buffer) => {
      output += chunk.toString();
    });
    bridge.stderr.on("data", (chunk: Buffer) => {
      errorOutput += chunk.toString();
    });
    bridge.on("error", reject);
    bridge.on("close", (exitCode) => {
      if (exitCode !== 0) {
        reject(new Error(errorOutput.trim() || `Mark-L bridge exited with ${exitCode}`));
        return;
      }
      try {
        const result = JSON.parse(output.trim()) as { answer?: string; error?: string };
        if (result.error || !result.answer) {
          reject(new Error(result.error || "Mark-L bridge returned no answer"));
          return;
        }
        resolve(result.answer);
      } catch {
        reject(new Error("Invalid response from Mark-L bridge"));
      }
    });
    bridge.stdin.end(JSON.stringify(payload));
  });
}

export async function POST(req: NextRequest) {
  try {
    const { prompt, audio, mimeType } = await req.json();

    if (
      (!prompt || typeof prompt !== "string" || !prompt.trim()) &&
      (!audio || typeof audio !== "string")
    ) {
      return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
    }

    try {
      const answer = await runMarkLBridge({ prompt, audio, mimeType });
      return NextResponse.json({ answer, source: "mark-l" });
    } catch {
      // Keep the web assistant usable if the optional Python bridge is unavailable.
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "GEMINI_API_KEY is not configured" },
        { status: 500 },
      );
    }

    const parts = audio
      ? [
            {
              text: "Listen to the voice command, then answer it in one or two short sentences. Do not mention transcription.",
            },
          {
            inlineData: {
              mimeType: mimeType || "audio/webm",
              data: audio,
            },
          },
        ]
      : [{ text: prompt.trim() }];

    const apiUrl = new URL(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent",
    );
    apiUrl.searchParams.set("key", apiKey);

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts,
          },
        ],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 128,
        },
      }),
    });

    const payload = await response.json();

    if (!response.ok) {
      return NextResponse.json(
        {
          error: payload?.error?.message || "Gemini request failed",
        },
        { status: response.status || 500 },
      );
    }

    const answer =
      payload?.candidates?.[0]?.content?.parts
        ?.map((part: { text?: string }) => part.text || "")
        .join("") || "I could not generate an answer.";

    return NextResponse.json({ answer });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
