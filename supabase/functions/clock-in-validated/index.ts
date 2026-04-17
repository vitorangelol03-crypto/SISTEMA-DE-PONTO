import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  try {
    const { employee_id, cpf, clock_type, latitude, longitude, accuracy } =
      await req.json();

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

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Verify employee exists and CPF matches
    const { data: emp, error: empErr } = await supabase
      .from("employees")
      .select("id, cpf")
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

    // Fetch geo config
    const { data: config } = await supabase
      .from("geolocation_config")
      .select("*")
      .limit(1)
      .maybeSingle();

    const today = getBrazilDateString();
    const now = new Date().toISOString();
    const hasCoords =
      latitude != null && longitude != null && isFinite(latitude) && isFinite(longitude);

    let distance = 0;
    let geoValid = true;
    let fraud = false;

    if (config) {
      if (!hasCoords) {
        // No coordinates = denied permission or spoofing
        fraud = true;
        geoValid = false;

        await supabase.from("geo_fraud_attempts").insert([
          {
            employee_id,
            date: today,
            latitude: null,
            longitude: null,
            distance_meters: null,
            clock_type,
          },
        ]);

        const { weekStart, weekEnd } = getWeekBounds();
        await supabase.from("bonus_blocks").upsert(
          [
            {
              employee_id,
              week_start: weekStart,
              week_end: weekEnd,
              reason: "Localização não fornecida",
            },
          ],
          { onConflict: "employee_id,week_start" },
        );

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

      distance = calcDistance(
        latitude,
        longitude,
        Number(config.latitude),
        Number(config.longitude),
      );

      if (config.block_outside && distance > (config.allowed_radius_meters ?? 200)) {
        fraud = true;
        geoValid = false;

        await supabase.from("geo_fraud_attempts").insert([
          {
            employee_id,
            date: today,
            latitude,
            longitude,
            distance_meters: distance,
            clock_type,
          },
        ]);

        const { weekStart, weekEnd } = getWeekBounds();
        await supabase.from("bonus_blocks").upsert(
          [
            {
              employee_id,
              week_start: weekStart,
              week_end: weekEnd,
              reason: `Fora da área permitida (${distance}m)`,
            },
          ],
          { onConflict: "employee_id,week_start" },
        );

        // Save flagged attendance anyway
        if (clock_type === "entry") {
          await supabase.from("attendance").upsert(
            [
              {
                employee_id,
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
              },
            ],
            { onConflict: "employee_id,date" },
          );
        }

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
    }

    // Valid location — proceed with clock in/out
    if (clock_type === "entry") {
      const record: Record<string, unknown> = {
        employee_id,
        date: today,
        status: "present",
        entry_time: now,
        clock_source: "employee_self",
        approval_status: "pending",
      };

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

    // clock_type === 'exit'
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
      exit_time_full: exitTime.toISOString(),
      hours_worked: hoursWorked,
      night_hours: nightHours,
      night_additional: nightAdditional,
    };

    if (hasCoords) {
      updateRecord.exit_latitude = latitude;
      updateRecord.exit_longitude = longitude;
      updateRecord.exit_accuracy = accuracy;
      updateRecord.geo_valid = geoValid;
      updateRecord.geo_distance_meters = distance;
    }

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
