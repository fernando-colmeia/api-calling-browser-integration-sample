"use client";

import { useEffect, useRef, useState } from "react";

type ParsedSDP = {
    codec?: string;
    samplingRate?: string;
    bitrate?: string;
    ice: { ip: string; type: string }[];
};

type WebSocketState = {
  ws: WebSocket,
  send: (data: SignalMessage) => void
}

type SignalMessage =
    | { type: "log"; data: any }
    | { type: "offer"; sdp: RTCSessionDescriptionInit }
    | { type: "hangup" }
    | { type: "answer"; sdp: RTCSessionDescriptionInit }
    | { type: "ice"; candidate: RTCIceCandidateInit };

    
export default function Page() {
    const pcRef = useRef<RTCPeerConnection | null>(null);
    const wsRef = useRef<WebSocketState | null>(null);
    const [rtcConfigRaw, setRtcConfigRaw] = useState<string>(
`{
    "iceServers": [
        { "urls": "stun:stun.l.google.com:19302" }
    ]
}`
    );
    const [lastAnswer, setLastAnswer] =
        useState<RTCSessionDescriptionInit | null>(null);

    const [incomingOffer, setIncomingOffer] =
        useState<RTCSessionDescriptionInit | null>(null);

    const [logs, setLogs] = useState<string[]>([]);
    const [parsed, setParsed] = useState<ParsedSDP | null>(null);

    function log(line: string) {
        setLogs((l) => [...l, `[${new Date().toLocaleTimeString()}] ${line}`]);
    }

    useEffect(() => {
        const ws = new WebSocket("ws://localhost:5000/ws/signaling");
        wsRef.current = {
          ws,
          send: (data: SignalMessage) => {
            log('Sending message: ' + data.type);
            ws.send(JSON.stringify(data));
          },
        };

        ws.onmessage = (ev) => {
            const msg: SignalMessage = JSON.parse(ev.data);

            if(msg.type === 'log') {
              log('Log ' + JSON.stringify(msg, null, 2));
            }

            if (msg.type === "offer") {
                log("Incoming call");
                setIncomingOffer(msg.sdp);
                setParsed(parseSDP(msg.sdp.sdp ?? ""));
            }
        };

        ws.onopen = () => log("WebSocket connected");
        ws.onclose = () => log("WebSocket closed");

        return () => ws.close();
    }, []);

    

    function hangup() {
        pcRef.current?.close();
        pcRef.current = null;
        
        wsRef.current?.send({
            type: "hangup",
        });

        log("Call ended");
    }

    async function acceptCall() {
        if (!incomingOffer) return;

        let rtcConfig: RTCConfiguration;

        try {
            rtcConfig = parseRtcConfig(rtcConfigRaw);
        } catch (err) {
            log((err as Error).message);
            return;
        }

        const pc = new RTCPeerConnection(rtcConfig);
        pcRef.current = pc;

        let stopAudio: (() => void) | undefined;

        pc.ontrack = (ev) => {
            stopAudio?.();
            stopAudio = playRtcAudioTrackInMemory(ev);
        };

        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((t) => pc.addTrack(t, stream));

        await pc.setRemoteDescription(incomingOffer);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        setLastAnswer(answer);

        wsRef.current?.send({
            type: "answer",
            sdp: answer
        });

        log("Call accepted");
        setIncomingOffer(null);
    }

    return (
        <main style={styles.container}>
            <h1>Voice Call Receiver</h1>

            <div style={styles.controls}>
                <button
                    onClick={acceptCall}
                    disabled={!incomingOffer}
                    style={{
                        ...styles.button,
                        background: incomingOffer ? "#4caf50" : "#999"
                    }}
                >
                    Accept
                </button>

                <button
                    onClick={hangup}
                    disabled={!lastAnswer}
                    style={{ ...styles.button, background: "#f44336" }}
                >
                    Hangup
                </button>
            </div>
            <section style={styles.card}>
                <h2>RTCPeerConnection config (JSON)</h2>
                <textarea
                    style={{
                        width: "100%",
                        height: 180,
                        fontFamily: "monospace",
                        fontSize: 12
                    }}
                    value={rtcConfigRaw}
                    onChange={(e) => setRtcConfigRaw(e.target.value)}
                />
            </section>
            {parsed && (
                <section style={styles.card}>
                    <h2>Session Info</h2>
                    <p><b>Codec:</b> {parsed.codec}</p>
                    <p><b>Sampling rate:</b> {parsed.samplingRate}</p>
                    <p><b>Bitrate:</b> {parsed.bitrate ?? "not signaled"}</p>
                </section>
            )}

            <section style={styles.card}>
                <h2>Logs</h2>
                <pre style={styles.logs}>
                    {logs.join("\n")}
                </pre>
            </section>
        </main>
    );
}

function parseRtcConfig(raw: string): RTCConfiguration {
    try {
        const parsed = JSON.parse(raw);
        return parsed as RTCConfiguration;
    } catch {
        throw new Error("Invalid RTCPeerConnection JSON config");
    }
};

/* ---------- SDP parsing ---------- */

function parseSDP(sdp: string): ParsedSDP {
    const lines = sdp.split("\n");
    const ice: ParsedSDP["ice"] = [];

    let codec: string | undefined;
    let samplingRate: string | undefined;
    let bitrate: string | undefined;

    for (const l of lines) {
        if (l.startsWith("a=rtpmap")) {
            // a=rtpmap:111 opus/48000/2
            const [, data] = l.split(":");
            const [, rest] = data.split(" ");
            const [c, rate] = rest.split("/");
            codec = c;
            samplingRate = rate;
        }

        if (l.startsWith("b=AS")) {
            bitrate = l.split(":")[1];
        }

        if (l.startsWith("a=candidate")) {
            const parts = l.split(" ");
            ice.push({
                ip: parts[4],
                type: parts[7]
            });
        }
    }

    return { codec, samplingRate, bitrate, ice };
}

/* ---------- styles ---------- */

const styles: Record<string, React.CSSProperties> = {
    container: {
        padding: 24,
        fontFamily: "Arial, sans-serif",
        maxWidth: 800,
        margin: "0 auto"
    },
    controls: {
        display: "flex",
        gap: 12,
        marginBottom: 20
    },
    button: {
        padding: "10px 16px",
        border: "none",
        color: "#fff",
        cursor: "pointer",
        fontSize: 14
    },
    card: {
        border: "1px solid #ddd",
        padding: 16,
        marginBottom: 20
    },
    logs: {
        fontSize: 12,
        background: "#f5f5f5",
        padding: 10,
        maxHeight: 200,
        overflowY: "auto"
    }
};

export function playRtcAudioTrackInMemory(
    ev: RTCTrackEvent
): () => void {
    if (ev.track.kind !== 'audio') {
        return () => {};
    }

    const audioContext = new AudioContext({
        latencyHint: 'interactive'
    });

    const stream = new MediaStream([ev.track]);
    const sourceNode = audioContext.createMediaStreamSource(stream);
    sourceNode.connect(audioContext.destination);

    if (audioContext.state === 'suspended') {
        audioContext.resume();
    }

    return () => {
        sourceNode.disconnect();
        ev.track.stop();
        audioContext.close();
    };
}
