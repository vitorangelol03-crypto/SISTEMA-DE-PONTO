import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Empresa padrão (Caratinga) — usada apenas como referência semântica.
// effectiveCompanyId é SEMPRE derivado de emp.company_id (canônico).
const DEFAULT_COMPANY_ID = "6583bb2a-e334-41a7-b69c-7d98f3b46dfc";

function getBrazilDateString(): string {
  const now = new Date();
  const offset = -3 * 60;
  const local = new Date(
    now.getTime() + (now.getTimezoneOffset() + offset) * 60_000,
  );
  return local.toISOString().slice(0, 10);
}

function getWeekBounds(): { weekStart: string; weekEnd: string } {
  const now = new Date();
  const brazilOffset = -3 * 60;
  const local = new Date(now.getTime() + brazilOffset * 60 * 1000);
  const day = local.getUTCDay();
  const diffToMon = day === 0 ? -6 : 1 - day;
  const monday = new Date(local);
  monday.setUTCDate(local.getUTCDate() + diffToMon);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  const fmt = (d: Date) => d.toISOString().split("T")[0];
  return { weekStart: fmt(monday), weekEnd: fmt(sunday) };
}

function calcDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6_371_000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

function calcHours(
  entry: Date,
  exit: Date,
): { hoursWorked: number; nightHours: number } {
  const diffMs = exit.getTime() - entry.getTime();
  const hoursWorked = diffMs / (1000 * 60 * 60);
  let nightMinutes = 0;
  const step = 60 * 1000;
  for (let t = entry.getTime(); t < exit.getTime(); t += step) {
    const utcHour = new Date(t).getUTCHours();
    const hBRT = (utcHour - 3 + 24) % 24;
    if (hBRT >= 22 || hBRT < 5) nightMinutes++;
  }
  const nightHours = nightMinutes / 60;
  return {
    hoursWorked: Math.round(hoursWorked * 100) / 100,
    nightHours: Math.round(nightHours * 100) / 100,
  };
}

// v6 (sub-fase 8.4 / TECH_DEBT 6.12): logger best-effort para writes silenciosos.
// Cada um dos 4 writes auxiliares (geo_fraud_attempts + bonus_blocks) capturava
// erros silenciosamente. Agora persistimos em error_logs (que ganhou company_id
// na sub-fase 7.4), permitindo auditoria multi-empresa de falhas. O log é
// best-effort: não interrompe o fluxo (o write original era auxiliar pra
// diagnóstico/auditoria, não pra operação de marcação de ponto).
async function logEdgeError(
  // deno-lint-ignore no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  params: {
    message: string;
    company_id: string | null;
    employee_id: string | null;
    db_error_message: string;
    db_error_code?: string;
    context: Record<string, unknown>;
  },
): Promise<void> {
  try {
    await supabase.from("error_logs").insert([
      {
        user_id: params.employee_id,
        company_id: params.company_id,
        error_type: "database_error",
        severity: "high",
        message: params.message,
        component: "edge:clock-in-validated",
        module: "edge-function",
        error_context: {
          db_error_message: params.db_error_message,
          db_error_code: params.db_error_code,
          edge_function_version: 7,
          ...params.context,
        },
        user_agent: "supabase-edge-runtime/deno",
        occurrence_count: 1,
      },
    ]);
  } catch {
    // Logger é best-effort. Se INSERT em error_logs falhar (ex: tabela
    // indisponível ou RLS futura), não propaga — mantém o fluxo original.
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  try {
    const {
      employee_id,
      cpf,
      clock_type,
      latitude,
      longitude,
      accuracy,
      company_id: bodyCompanyId,
      marking_position: markingPositionRaw,
    } = await req.json();

    if (!employee_id || !cpf || !clock_type) {
      return new Response(
        JSON.stringify({ error: "employee_id, cpf e clock_type obrigatórios" }),
        { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    if (clock_type !== "entry" && clock_type !== "exit") {
      return new Response(
        JSON.stringify({ error: "clock_type deve ser 'entry' ou 'exit'" }),
        { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    // marking_position é opcional. Cliente antigo não envia → comportamento legacy.
    let markingPosition: 1 | 2 | 3 | 4 | null = null;
    if (markingPositionRaw != null) {
      if (![1, 2, 3, 4].includes(markingPositionRaw)) {
        return new Response(
          JSON.stringify({ error: "marking_position deve ser 1, 2, 3 ou 4" }),
          { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
        );
      }
      markingPosition = markingPositionRaw as 1 | 2 | 3 | 4;
    }

    // Coerência clock_type ↔ marking_position:
    //   position 1 ⇒ entry; positions 2/3/4 ⇒ exit (semanticamente "saída/volta")
    if (markingPosition != null) {
      const expectedType = markingPosition === 1 ? "entry" : "exit";
      if (clock_type !== expectedType) {
        return new Response(
          JSON.stringify({
            error: `marking_position=${markingPosition} requer clock_type='${expectedType}'`,
          }),
          { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
        );
      }
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Verify employee exists, CPF matches, capture canonical company_id
    const { data: emp, error: empErr } = await supabase
      .from("employees")
      .select("id, cpf, company_id")
      .eq("id", employee_id)
      .single();

    if (empErr || !emp) {
      return new Response(
        JSON.stringify({ error: "Funcionário não encontrado" }),
        { status: 404, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    if (emp.cpf !== cpf.replace(/\D/g, "")) {
      return new Response(
        JSON.stringify({ error: "CPF não confere" }),
        { status: 403, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    // Tampering check: se body.company_id presente, deve bater com emp.company_id.
    // Cliente antigo (sem company_id) preserva comportamento — usa emp.company_id.
    if (bodyCompanyId && bodyCompanyId !== emp.company_id) {
      return new Response(
        JSON.stringify({ error: "Funcionário não pertence à empresa selecionada" }),
        { status: 403, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    // Fonte canônica: SEMPRE emp.company_id. Fallback defensivo se DB inconsistente.
    const effectiveCompanyId: string = emp.company_id ?? DEFAULT_COMPANY_ID;

    // Resolve geo config: companies.default_geo_* (base) + geolocation_config (override por empresa)
    const { data: company } = await supabase
      .from("companies")
      .select("default_geo_lat, default_geo_lng, default_geo_radius")
      .eq("id", effectiveCompanyId)
      .maybeSingle();

    if (
      !company ||
      company.default_geo_lat == null ||
      company.default_geo_lng == null
    ) {
      // Fail-safe: nunca bater ponto com coords erradas.
      return new Response(
        JSON.stringify({ error: "Configuração de geolocalização da empresa não encontrada" }),
        { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    const geoConfig = {
      latitude: Number(company.default_geo_lat),
      longitude: Number(company.default_geo_lng),
      allowed_radius_meters: Number(company.default_geo_radius ?? 200),
      block_outside: true as boolean,
    };

    const { data: override } = await supabase
      .from("geolocation_config")
      .select("latitude, longitude, allowed_radius_meters, block_outside")
      .eq("company_id", effectiveCompanyId)
      .maybeSingle();

    if (override) {
      if (override.latitude != null) geoConfig.latitude = Number(override.latitude);
      if (override.longitude != null) geoConfig.longitude = Number(override.longitude);
      if (override.allowed_radius_meters != null) {
        geoConfig.allowed_radius_meters = Number(override.allowed_radius_meters);
      }
      if (override.block_outside != null) geoConfig.block_outside = !!override.block_outside;
    }

    const today = getBrazilDateString();
    const now = new Date().toISOString();
    const hasCoords =
      latitude != null && longitude != null && isFinite(latitude) && isFinite(longitude);

    // É a PRIMEIRA marcação do dia? Decide bloqueio de bônus + criação inicial do attendance.
    // - Cliente legacy: clock_type === 'entry' (sem marking_position)
    // - Cliente novo: marking_position === 1
    const isFirstEntry = markingPosition == null
      ? clock_type === "entry"
      : markingPosition === 1;

    let distance = 0;
    let geoValid = true;

    if (!hasCoords) {
      geoValid = false;

      // v6 (sub-fase 8.4): captura erro do INSERT em geo_fraud_attempts.
      // Caso "localização não fornecida". Antes era silencioso (TECH_DEBT 6.12).
      const { error: gfErr1 } = await supabase.from("geo_fraud_attempts").insert([
        {
          employee_id,
          company_id: effectiveCompanyId,
          date: today,
          latitude: null,
          longitude: null,
          distance_meters: null,
          clock_type,
        },
      ]);
      if (gfErr1) {
        await logEdgeError(supabase, {
          message: "geo_fraud_attempts INSERT failed (no coords case)",
          company_id: effectiveCompanyId,
          employee_id,
          db_error_message: gfErr1.message,
          db_error_code: gfErr1.code,
          context: { case: "no_coords", clock_type, today },
        });
      }

      if (isFirstEntry) {
        const { weekStart, weekEnd } = getWeekBounds();
        // v6 (sub-fase 8.4): captura erro do UPSERT em bonus_blocks.
        const { error: bbErr1 } = await supabase.from("bonus_blocks").upsert(
          [
            {
              employee_id,
              company_id: effectiveCompanyId,
              week_start: weekStart,
              week_end: weekEnd,
              reason: "Localização não fornecida",
            },
          ],
          { onConflict: "employee_id,week_start" },
        );
        if (bbErr1) {
          await logEdgeError(supabase, {
            message: "bonus_blocks UPSERT failed (no coords case)",
            company_id: effectiveCompanyId,
            employee_id,
            db_error_message: bbErr1.message,
            db_error_code: bbErr1.code,
            context: { case: "no_coords", clock_type, week_start: weekStart, week_end: weekEnd },
          });
        }

        return new Response(
          JSON.stringify({
            success: false,
            fraud: true,
            distance_meters: null,
            message: "Localização não fornecida",
          }),
          { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
        );
      }
      // Marcações 2/3/4 sem coords: registra fraude mas deixa passar (geoValid=false).
    }

    if (hasCoords) {
      distance = calcDistance(
        latitude,
        longitude,
        geoConfig.latitude,
        geoConfig.longitude,
      );

      if (geoConfig.block_outside && distance > geoConfig.allowed_radius_meters) {
        geoValid = false;

        // v6 (sub-fase 8.4): captura erro do INSERT em geo_fraud_attempts.
        // Caso "fora da área permitida". Antes era silencioso (TECH_DEBT 6.12).
        const { error: gfErr2 } = await supabase.from("geo_fraud_attempts").insert([
          {
            employee_id,
            company_id: effectiveCompanyId,
            date: today,
            latitude,
            longitude,
            distance_meters: distance,
            clock_type,
          },
        ]);
        if (gfErr2) {
          await logEdgeError(supabase, {
            message: "geo_fraud_attempts INSERT failed (outside radius case)",
            company_id: effectiveCompanyId,
            employee_id,
            db_error_message: gfErr2.message,
            db_error_code: gfErr2.code,
            context: { case: "outside_radius", clock_type, today, distance, latitude, longitude },
          });
        }

        if (isFirstEntry) {
          const { weekStart, weekEnd } = getWeekBounds();
          // v6 (sub-fase 8.4): captura erro do UPSERT em bonus_blocks.
          const { error: bbErr2 } = await supabase.from("bonus_blocks").upsert(
            [
              {
                employee_id,
                company_id: effectiveCompanyId,
                week_start: weekStart,
                week_end: weekEnd,
                reason: `Fora da área permitida (${distance}m)`,
              },
            ],
            { onConflict: "employee_id,week_start" },
          );
          if (bbErr2) {
            await logEdgeError(supabase, {
              message: "bonus_blocks UPSERT failed (outside radius case)",
              company_id: effectiveCompanyId,
              employee_id,
              db_error_message: bbErr2.message,
              db_error_code: bbErr2.code,
              context: { case: "outside_radius", distance, week_start: weekStart, week_end: weekEnd },
            });
          }

          // Cria/atualiza attendance mesmo com geo invalid (entrada bloqueada para bônus).
          const blockedRecord: Record<string, unknown> = {
            employee_id,
            company_id: effectiveCompanyId,
            date: today,
            status: "present",
            entry_time: now,
            entry_latitude: latitude,
            entry_longitude: longitude,
            entry_accuracy: accuracy,
            geo_valid: false,
            geo_distance_meters: distance,
            approval_status: "pending",
            clock_source: "employee_self",
          };
          // Cliente novo (marking_position=1) também escreve no campo posicional.
          if (markingPosition === 1) blockedRecord.entry_1_time = now;

          await supabase.from("attendance").upsert(
            [blockedRecord],
            { onConflict: "employee_id,date" },
          );

          return new Response(
            JSON.stringify({
              success: false,
              fraud: true,
              distance_meters: distance,
              message: `Fora da área permitida (${distance}m)`,
            }),
            { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
          );
        }
        // Marcações 2/3/4 fora da área: deixa passar com geoValid=false.
      }
    }

    // Geo válida (ou marcação ≠ primeira entrada com geo aceito) — grava o ponto.

    // ── Cliente NOVO com marking_position 2/3/4: update incremental ──────────
    if (markingPosition != null && markingPosition >= 2) {
      const { data: existing, error: existErr } = await supabase
        .from("attendance")
        .select("*")
        .eq("employee_id", employee_id)
        .eq("date", today)
        .maybeSingle();

      if (existErr || !existing || !existing.entry_1_time) {
        return new Response(
          JSON.stringify({ error: "Nenhuma entrada (posição 1) registrada hoje" }),
          { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
        );
      }

      const updateRecord: Record<string, unknown> = {
        company_id: effectiveCompanyId,
      };
      if (markingPosition === 2) updateRecord.exit_1_time = now;
      if (markingPosition === 3) updateRecord.entry_2_time = now;
      if (markingPosition === 4) updateRecord.exit_2_time = now;

      // Posição 4 = saída final → também grava campos legacy + cálculo agregado.
      if (markingPosition === 4) {
        const entry = new Date(existing.entry_1_time);
        const exitTime = new Date();
        const { hoursWorked, nightHours } = calcHours(entry, exitTime);
        const dailyRate = Number(existing.daily_rate) || 0;
        let nightAdditional = 0;
        if (nightHours > 0 && hoursWorked > 0 && dailyRate > 0) {
          const hourlyRate = dailyRate / hoursWorked;
          nightAdditional = Math.round(nightHours * hourlyRate * 0.2 * 100) / 100;
        }
        updateRecord.exit_time_full = exitTime.toISOString();
        updateRecord.hours_worked = hoursWorked;
        updateRecord.night_hours = nightHours;
        updateRecord.night_additional = nightAdditional;
      }

      if (hasCoords) {
        // Coords da última marcação ficam no slot exit_*. Em positions 2/3 também sobrescrevem
        // pra refletir a última localização gravada (consistente com o fluxo legacy).
        updateRecord.exit_latitude = latitude;
        updateRecord.exit_longitude = longitude;
        updateRecord.exit_accuracy = accuracy;
      }
      updateRecord.geo_valid = geoValid;
      updateRecord.geo_distance_meters = distance;

      const { data: att, error: updErr } = await supabase
        .from("attendance")
        .update(updateRecord)
        .eq("employee_id", employee_id)
        .eq("date", today)
        .select()
        .single();

      if (updErr) {
        return new Response(
          JSON.stringify({ error: updErr.message }),
          { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          fraud: false,
          geo_warning: !geoValid,
          distance_meters: distance,
          attendance: att,
        }),
        { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    // ── Fluxo legacy / position 1: cria attendance com entry ─────────────────
    if (clock_type === "entry") {
      const record: Record<string, unknown> = {
        employee_id,
        company_id: effectiveCompanyId,
        date: today,
        status: "present",
        entry_time: now,
        clock_source: "employee_self",
        approval_status: "pending",
      };
      // Cliente novo na posição 1 também escreve no campo posicional.
      if (markingPosition === 1) record.entry_1_time = now;

      if (hasCoords) {
        record.entry_latitude = latitude;
        record.entry_longitude = longitude;
        record.entry_accuracy = accuracy;
        record.geo_valid = geoValid;
        record.geo_distance_meters = distance;
      }

      const { data: att, error: attErr } = await supabase
        .from("attendance")
        .upsert([record], { onConflict: "employee_id,date" })
        .select()
        .single();

      if (attErr) {
        return new Response(
          JSON.stringify({ error: attErr.message }),
          { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          fraud: false,
          distance_meters: distance,
          attendance: att,
        }),
        { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    // ── Fluxo legacy: clock_type === 'exit' sem marking_position ────────────
    const { data: existing, error: existErr } = await supabase
      .from("attendance")
      .select("*")
      .eq("employee_id", employee_id)
      .eq("date", today)
      .maybeSingle();

    if (existErr || !existing || !existing.entry_time) {
      return new Response(
        JSON.stringify({ error: "Nenhuma entrada registrada hoje" }),
        { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    const entry = new Date(existing.entry_time);
    const exitTime = new Date();
    const { hoursWorked, nightHours } = calcHours(entry, exitTime);

    const dailyRate = Number(existing.daily_rate) || 0;
    let nightAdditional = 0;
    if (nightHours > 0 && hoursWorked > 0 && dailyRate > 0) {
      const hourlyRate = dailyRate / hoursWorked;
      nightAdditional = Math.round(nightHours * hourlyRate * 0.2 * 100) / 100;
    }

    const updateRecord: Record<string, unknown> = {
      company_id: effectiveCompanyId,
      exit_time_full: exitTime.toISOString(),
      hours_worked: hoursWorked,
      night_hours: nightHours,
      night_additional: nightAdditional,
    };

    if (hasCoords) {
      updateRecord.exit_latitude = latitude;
      updateRecord.exit_longitude = longitude;
      updateRecord.exit_accuracy = accuracy;
    }
    updateRecord.geo_valid = geoValid;
    updateRecord.geo_distance_meters = distance;

    const { data: att, error: updErr } = await supabase
      .from("attendance")
      .update(updateRecord)
      .eq("employee_id", employee_id)
      .eq("date", today)
      .select()
      .single();

    if (updErr) {
      return new Response(
        JSON.stringify({ error: updErr.message }),
        { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        fraud: false,
        geo_warning: !geoValid,
        distance_meters: distance,
        attendance: att,
      }),
      { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message ?? "Erro interno" }),
      { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  }
});
