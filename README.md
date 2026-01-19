# Calling Browser Integration Sample
Exemplo mínimo de integração com a API de Calling, focado em:

 - contrato do webhook
 - recebimento de eventos de chamada
 - fluxo `connect` com SDP offer
 - aceite de chamadas via browser (WebRTC)

Este projeto existe como referência técnica de integração, não como produto final.

---

### O que este projeto demonstra

 - como expor um webhook HTTP para eventos da API de Calling
 - como validar e processar eventos `bot_req_call` e `connect`
 - como repassar eventos em tempo real para o browser
 - como aceitar uma chamada a partir de um SDP offer

Detalhes completos de implementação estão em `IMPLEMENTATION.md`.

---

### Arquitetura (alto nível)
```ini
[API Calling]
      |
      v
[Webhook HTTP / WebSocket]
      |
      v
[Browser (WebRTC)]
```

---

### Requisitos
 - Node.js LTS
 - npm
 - Navegador com suporte a WebRTC
<br><br>
---

### Configuração
Crie um `.env` baseado em `.env-sample`:

```ini
NODE_ENV=development
PORT=5000
ID_SOCIAL_CONTEXT=''
CALL_API_TOKEN=''
CALL_API_URL='https://dev-api.colmeia.cx/v1/rest/calling/command'
WEBHOOK_SECRET_HEADER='x-cbis-secret'
WEBHOOK_SECRET='foobaz'
WEBHOOK_URL='/webhook/call-event'
```
> Porta padrão do app: 5000

---

### Execução

```ini
next build && NODE_ENV=production node -r ts-node/register server.ts
```

> O projeto utiliza server custom. <br>Não usar `next start`.

---

### Documentação
- Guia completo de integração: `IMPLEMENTATION.md`
- Contrato do webhook, payloads e exemplos de curl
- Fluxo de chamada e boas práticas
<br><br>
---

### Observações
- WebSocket usado apenas como meio de entrega
- UI mínima, sem foco em design
<br><br>
---

### Finalidade

Este repositório é voltado a integradores que precisam entender rapidamente como consumir a API de Calling e receber eventos de chamadas de voz.