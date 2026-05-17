# API Pública v1 — Sistema de Ponto

> **Sub-fase 17.6 (2026-05-16) — MVP READ-ONLY.**
> Endpoint pra integrações externas (ERPs, dashboards de BI, etc.) acessarem
> dados Sistema de Ponto via REST com API key.

---

## Base URL

```
https://flcncdidxmmornkgkfbb.supabase.co/functions/v1/public-api-v1
```

---

## Autenticação

Toda request precisa de **2 headers**:

| Header | Valor | Por quê |
|---|---|---|
| `X-API-Key` | Sua API key (gerada pelo admin via SQL — UI follow-up) | Identifica a empresa e valida scope |
| `apikey` ou `Authorization: Bearer <ANON_KEY>` | Anon key do Supabase | Edge fn verify_jwt=true requer |

**Anon key:** `VITE_SUPABASE_ANON_KEY` do `.env` (pode commitar — RLS bloqueia escrita).

---

## Endpoints

### `GET /` ou `GET /health`

Health check (sem auth).

**Response 200:**
```json
{"status":"ok","version":"v1","endpoints":["GET /employees"]}
```

### `GET /employees`

Lista todos employees da empresa dona da API key.

**Scope requerido:** `read:employees`

**Request:**
```bash
curl -sS -X GET "https://flcncdidxmmornkgkfbb.supabase.co/functions/v1/public-api-v1/employees" \
  -H "X-API-Key: sp_test_key_caratinga_2026" \
  -H "apikey: <ANON_KEY>"
```

**Response 200:**
```json
{
  "employees": [
    {
      "id": "uuid",
      "name": "Funcionário Nome",
      "cpf": "12345678900",
      "employment_type": "Carteira Assinada" | "Diarista" | "PJ" | null,
      "address": "Rua X, 123" | null,
      "city": "Caratinga" | null,
      "state": "MG" | null,
      "created_at": "2026-01-01T00:00:00Z"
    }
  ],
  "count": 47
}
```

---

## Códigos de erro

| Code | HTTP | Significado |
|---|---|---|
| `UNAUTHORIZED` | 401 | Missing/invalid X-API-Key |
| `FORBIDDEN` | 403 | Key sem scope necessário |
| `NOT_FOUND` | 404 | Endpoint desconhecido |
| `INTERNAL` | 500 | Erro DB ou interno |

---

## Gerar nova API key (manual via SQL)

UI de admin pra gerar keys fica como follow-up. Por agora, gerar via SQL:

```sql
-- 1. Gerar key plain (use algo random — ex: openssl rand -hex 32)
-- 2. Hash via pgcrypto e inserir:

INSERT INTO public.api_keys (key_hash, key_prefix, label, company_id, scopes, created_by, expires_at)
VALUES (
  crypt('sk_minhakey_aqui_random_2026', gen_salt('bf', 10)),  -- ← plain key (mostre UMA vez ao cliente)
  'sk_minha',                                                  -- ← primeiros 8 chars pra display
  'Integração ERP Bling',                                      -- ← descrição humana
  '6583bb2a-e334-41a7-b69c-7d98f3b46dfc',                     -- ← Caratinga ID
  ARRAY['read:employees']::TEXT[],                             -- ← scopes
  '9999',                                                      -- ← admin que criou
  NOW() + INTERVAL '1 year'                                    -- ← expires (opcional, NULL = nunca)
);
```

**Revogar key:**
```sql
UPDATE public.api_keys SET revoked_at = NOW() WHERE label = 'Integração ERP Bling';
```

**Listar keys ativas:**
```sql
SELECT id, key_prefix, label, company_id, scopes, expires_at, last_used_at, call_count
FROM public.api_keys
WHERE revoked_at IS NULL
ORDER BY created_at DESC;
```

---

## Auditoria

Cada chamada autenticada incrementa `call_count` e atualiza `last_used_at`.
Ver via SQL acima.

Tentativas com key inválida não são logadas (privacidade — não confirma se
key existe).

---

## Limitações MVP

- **Read-only**: sem POST/PUT/DELETE. Write scope (`write:attendance`,
  `write:employees`) fica como follow-up se houver demanda.
- **Sem rate limiting**: cliente pode hammerar. Supabase Edge Functions tem
  rate limit global do projeto (~500/s) — proteção mínima.
- **Sem pagination**: `/employees` retorna todos sem cursor. OK pra <1000
  funcionários. Pra escala maior, adicionar `?limit=50&offset=0`.
- **Scopes limitados**: só `read:employees` agora.
- **Sem versionamento de campos**: response shape pode mudar — clientes devem
  ignorar campos desconhecidos.

---

## Roadmap (follow-ups)

- `GET /attendance?from=&to=` — histórico de pontos
- `GET /payments?period_id=` — pagamentos por período
- `POST /clock-in` (write scope) — marcar ponto via integração
- UI admin pra gerar/revogar keys
- Rate limiting por key
- Webhook subscriptions (notificações de eventos)

---

**Versão atual:** `public-api-v1` (Supabase Edge Function v1)
**Status:** ACTIVE
**Última atualização:** 2026-05-16
