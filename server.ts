import "dotenv/config";
import http, { IncomingMessage, ServerResponse } from "http";
import { parse } from "url";
import next from "next";
import { WebSocketServer, WebSocket } from "ws";

const port = Number(process.env.PORT || 5000);
const dev = process.env.NODE_ENV === "development" || (process.env as any).NODE_ENV === 'dev';

const app = next({ dev });
const handle = app.getRequestHandler();
const token = process.env.CALL_API_TOKEN as string;
const apiUrl = process.env.CALL_API_URL as string;
const idSocialContext = process.env.ID_SOCIAL_CONTEXT as string;
const webHookUrl = process.env.WEBHOOK_URL as string;
const webHookSecretHeader = process.env.WEBHOOK_SECRET_HEADER as string;
const webHookSecret = process.env.WEBHOOK_SECRET as string;

if(!token) {
    throwInvalidEnv('CALL_API_URL');
}

if(!apiUrl) {
    throwInvalidEnv('CALL_API_TOKEN');
}

if(!idSocialContext) {
    throwInvalidEnv('ID_SOCIAL_CONTEXT');
}

if(!webHookUrl) {
    throwInvalidEnv('WEBHOOK_URL');
}

if(!webHookSecretHeader) {
    throwInvalidEnv('WEBHOOK_SECRET_HEADER');
}

if(!webHookSecret) {
    throwInvalidEnv('WEBHOOK_SECRET');
}

function throwInvalidEnv(field: string): never {
throw new Error(`Colmeia Calling API: ${field} not provided.`);
}

type SignalMessage =
    | { type: "log"; data: any }
    | { type: "offer"; sdp: RTCSessionDescriptionInit }
    | { type: "answer"; sdp: RTCSessionDescriptionInit }
    | { type: "ice"; candidate: RTCIceCandidateInit };



app.prepare().then(() => {
    const server = http.createServer((req, res) => {
        if (req.method === "POST" && req.url === webHookUrl) {
            return handleWebhook(req, res);
        }

        const parsedUrl = parse(req.url ?? "", true);
        handle(req, res, parsedUrl);
    });

    let currentWs!: WebSocket;
    let idCall: string;
    let idConversation: string;

    function sendWsMessage(data: SignalMessage): void {
        const str: string = JSON.stringify(data);
        console.log('[WS] send message')
        return currentWs.send(str);
    }

    
    async function handleWebhook(
        req: IncomingMessage,
        res: ServerResponse
    ): Promise<void> {
        try {
            const secret = req.headers[webHookSecretHeader];

            /**
             * Validação simples, mas você pode implementar
             * uma validação com tokens JWT.
             */
            if(secret !== webHookSecret) {
                throw new Error('Invalid secret');
            }

            const body = await parseJsonBody(req);

            // debug direto
            console.log("[WEBHOOK]", body);
            
            idCall = body.idCall;
            idConversation = body.idConversation;

            if(body.event === 'connect') {
                sendWsMessage({
                    type: 'offer',
                    sdp: body.rtcSession,
                });
            } else {
                sendWsMessage({
                    type: 'log',
                    data: body,
                })
            }

            res.writeHead(200, { "Content-Type": "text/plain" });
            res.end("ok");
        } catch {
            res.writeHead(400, { "Content-Type": "text/plain" });
            res.end("invalid body");
        }
    }

    const wss = new WebSocketServer({
        server,
        path: "/ws/signaling"
    });

    wss.on("connection", (ws: WebSocket) => {
        console.log("[WS] connected");
        currentWs = ws;

        ws.on("message", async (data) => {
            let msg: SignalMessage;

            try {
                msg = JSON.parse(data.toString());
            } catch {
                console.error("[WS] invalid message");
                return;
            }

            switch (msg.type) {
                case "answer": 
                    console.log('[WS] answer received', msg.sdp);

                    sendCallCommand({
                        event: "accept",
                        idCall,
                        idConversation,
                        rtcSession: msg.sdp,
                    }).catch((error) => {
                        console.error(error);

                        sendWsMessage({
                            type: 'log',
                            data: {
                                error,
                            },
                        });

                    });
                break;
                case "offer": {
                    console.log("[WS] offer received");
                    // Planned
                    break;
                }

                case "ice":
                    console.log("[WS] ICE candidate");
                    break;

                default:
                    console.warn("[WS] unknown type");
            }
        });

        ws.on("close", () => {
            console.log("[WS] disconnected");
        });
    });

    server.listen(port, () => {
        console.log(`> Ready on http://localhost:${port}`);
        console.log(`> WS on ws://localhost:${port}/ws/signaling`);
    });
});

async function sendCallCommand(body: any):  Promise<Response> {
    console.log(`[WS] send command`, body);
    const response = await fetch(apiUrl, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "idSocialNetwork": idSocialContext,
            "Authorization": token,
        },
        body: JSON.stringify(body)
    });

    console.log('[WS] send command result', response.ok, response.status)
    return response;
}

function parseJsonBody(req: IncomingMessage): Promise<any> {
    return new Promise((resolve, reject) => {
        let raw = "";

        req.on("data", (chunk) => {
            raw += chunk;
        });

        req.on("end", () => {
            try {
                resolve(JSON.parse(raw));
            } catch(e) {
                reject(e);
            }
        });

        req.on("error", reject);
    });
}