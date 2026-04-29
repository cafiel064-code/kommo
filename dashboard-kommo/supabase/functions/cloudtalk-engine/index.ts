import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface RequestBody {
  action: "calls_by_user";
  access_key_id: string;
  access_key_secret: string;
  date_from?: number;
  date_to?: number;
}

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function basicAuth(id: string, secret: string) {
  return `Basic ${btoa(`${id}:${secret}`)}`;
}

async function cloudTalkFetch(
  accessKeyId: string,
  accessKeySecret: string,
  path: string
): Promise<{ ok: boolean; status: number; data: any; text: string }> {
  const url = `https://api.cloudtalk.io/v1${path}`;

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: basicAuth(accessKeyId, accessKeySecret),
        Accept: "application/json",
      },
    });

    const text = await res.text();

    let data = null;

    try {
      data = JSON.parse(text);
    } catch {
      // resposta não veio JSON
    }

    return {
      ok: res.ok,
      status: res.status,
      data,
      text,
    };
  } catch (e) {
    return {
      ok: false,
      status: 0,
      data: null,
      text: `Erro de rede: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

function extractCalls(data: any): any[] {
  if (Array.isArray(data)) return data;

  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.calls)) return data.calls;
  if (Array.isArray(data?.response?.data)) return data.response.data;
  if (Array.isArray(data?._embedded?.calls)) return data._embedded.calls;

  return [];
}

function getCallDate(call: any): number {
  const candidates = [
    call?.started_at,
    call?.start_time,
    call?.created_at,
    call?.date,
    call?.timestamp,
    call?.call_started_at,
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;

    if (typeof candidate === "number") {
      return candidate > 9999999999 ? Math.floor(candidate / 1000) : candidate;
    }

    const parsed = Date.parse(String(candidate));
    if (!Number.isNaN(parsed)) {
      return Math.floor(parsed / 1000);
    }
  }

  return 0;
}

function normalizeDirection(call: any): "inbound" | "outbound" | "unknown" {
  const raw = String(
    call?.direction ||
      call?.call_direction ||
      call?.type ||
      call?.call_type ||
      ""
  ).toLowerCase();

  if (raw.includes("inbound") || raw.includes("incoming")) return "inbound";
  if (raw.includes("outbound") || raw.includes("outgoing")) return "outbound";

  return "unknown";
}

function getUserName(call: any): string {
  const candidates = [
    call?.user?.name,
    call?.agent?.name,
    call?.operator?.name,
    call?.answered_by?.name,
    call?.created_by?.name,
    call?.user_name,
    call?.agent_name,
    call?.operator_name,
    call?.assigned_agent_name,
    call?.owner?.name,
  ];

  for (const candidate of candidates) {
    if (candidate && String(candidate).trim()) {
      return String(candidate).trim();
    }
  }

  if (Array.isArray(call?.users) && call.users.length > 0) {
    const user = call.users[0];

    if (user?.name) return String(user.name).trim();
    if (user?.email) return String(user.email).trim();
  }

  return "Usuário não identificado";
}

async function fetchCalls(
  accessKeyId: string,
  accessKeySecret: string,
  dateFrom: number,
  dateTo: number
) {
  const allCalls: any[] = [];
  const limit = 100;
  const maxPages = 100;

  const fromIso = new Date(dateFrom * 1000).toISOString();
  const toIso = new Date(dateTo * 1000).toISOString();

  for (let page = 1; page <= maxPages; page++) {
    const paths = [
      `/calls?limit=${limit}&page=${page}&date_from=${encodeURIComponent(
        fromIso
      )}&date_to=${encodeURIComponent(toIso)}`,
      `/calls?limit=${limit}&page=${page}&from=${dateFrom}&to=${dateTo}`,
      `/calls?limit=${limit}&page=${page}`,
    ];

    let pageCalls: any[] = [];
    let lastError = "";

    for (const path of paths) {
      const res = await cloudTalkFetch(accessKeyId, accessKeySecret, path);

      if (!res.ok || !res.data) {
        lastError = `CloudTalk erro (${res.status}): ${res.text.substring(
          0,
          300
        )}`;
        continue;
      }

      pageCalls = extractCalls(res.data);
      break;
    }

    if (pageCalls.length === 0) {
      if (page === 1 && lastError) {
        throw new Error(lastError);
      }

      break;
    }

    allCalls.push(...pageCalls);

    if (pageCalls.length < limit) break;
  }

  return allCalls.filter((call) => {
    const callDate = getCallDate(call);

    if (!callDate) return true;

    return callDate >= dateFrom && callDate <= dateTo;
  });
}

function buildCallsByUser(calls: any[]) {
  const byUser: Record<
    string,
    {
      user: string;
      inbound: number;
      outbound: number;
      total: number;
    }
  > = {};

  for (const call of calls) {
    const user = getUserName(call);
    const direction = normalizeDirection(call);

    if (!byUser[user]) {
      byUser[user] = {
        user,
        inbound: 0,
        outbound: 0,
        total: 0,
      };
    }

    if (direction === "inbound") {
      byUser[user].inbound += 1;
    }

    if (direction === "outbound") {
      byUser[user].outbound += 1;
    }

    byUser[user].total += 1;
  }

  return Object.values(byUser).sort((a, b) => b.total - a.total);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body: RequestBody = await req.json();

    const { action, access_key_id, access_key_secret } = body;

    if (!access_key_id || !access_key_secret) {
      return jsonResponse(
        {
          success: false,
          error: "access_key_id e access_key_secret são obrigatórios",
        },
        400
      );
    }

    if (action === "calls_by_user") {
      const now = Math.floor(Date.now() / 1000);

      const dateFrom = body.date_from ?? now - 7 * 24 * 60 * 60;
      const dateTo = body.date_to ?? now;

      const calls = await fetchCalls(
        access_key_id,
        access_key_secret,
        dateFrom,
        dateTo
      );

      const callsByUser = buildCallsByUser(calls);

      const totals = callsByUser.reduce(
        (acc, item) => {
          acc.inbound += item.inbound;
          acc.outbound += item.outbound;
          acc.total += item.total;

          return acc;
        },
        {
          inbound: 0,
          outbound: 0,
          total: 0,
        }
      );

      return jsonResponse({
        success: true,
        calls,
        callsByUser,
        totals,
        totalFetched: calls.length,
        debug: `${calls.length} chamadas encontradas. ${callsByUser.length} usuários encontrados.`,
      });
    }

    return jsonResponse(
      {
        success: false,
        error: `Ação desconhecida: ${action}`,
      },
      400
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro interno";

    console.error("cloudtalk-engine error:", message);

    return jsonResponse(
      {
        success: false,
        error: message,
      },
      500
    );
  }
});