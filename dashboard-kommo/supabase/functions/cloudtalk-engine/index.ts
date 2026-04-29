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
): Promise<{ ok: boolean; status: number; data: any; text: string; path: string }> {
  const url = `https://my.cloudtalk.io/api${path}`;

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
      path,
    };
  } catch (e) {
    return {
      ok: false,
      status: 0,
      data: null,
      text: `Erro de rede: ${e instanceof Error ? e.message : String(e)}`,
      path,
    };
  }
}

function extractCalls(data: any): any[] {
  const possibleArrays = [
    data,
    data?.data,
    data?.calls,
    data?.responseData,
    data?.responseData?.data,
    data?.responseData?.calls,
    data?.response?.data,
    data?.response?.calls,
    data?._embedded?.calls,
    data?.result,
    data?.result?.data,
    data?.result?.calls,
  ];

  for (const item of possibleArrays) {
    if (Array.isArray(item)) return item;
  }

  return [];
}

function getCdr(call: any) {
  return call?.Cdr ?? call?.cdr ?? call;
}

function getCallDate(call: any): number {
  const cdr = getCdr(call);

  const candidates = [
    cdr?.started_at,
    cdr?.start_time,
    cdr?.created_at,
    cdr?.date,
    cdr?.timestamp,
    cdr?.call_started_at,
    cdr?.startedAt,
    cdr?.createdAt,
    cdr?.created,
    cdr?.started,
    cdr?.calldate,
    cdr?.call_date,
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
  const cdr = getCdr(call);

  const raw = String(
    cdr?.direction ||
      cdr?.call_direction ||
      cdr?.type ||
      cdr?.call_type ||
      cdr?.callType ||
      cdr?.direction_type ||
      cdr?.directionType ||
      cdr?.callDirection ||
      cdr?.call_direction_type ||
      ""
  )
    .toLowerCase()
    .trim();

  if (
    raw.includes("incoming") ||
    raw.includes("inbound") ||
    raw === "incoming" ||
    raw === "inbound" ||
    raw === "in" ||
    raw === "1"
  ) {
    return "inbound";
  }

  if (
    raw.includes("outgoing") ||
    raw.includes("outbound") ||
    raw === "outgoing" ||
    raw === "outbound" ||
    raw === "out" ||
    raw === "2"
  ) {
    return "outbound";
  }

  return "unknown";
}

function getUserName(call: any): string {
  const cdr = getCdr(call);

  const candidates = [
    call?.User?.name,
    call?.User?.full_name,
    call?.User?.email,
    call?.user?.name,
    call?.user?.full_name,
    call?.user?.email,

    call?.Agent?.name,
    call?.Agent?.full_name,
    call?.Agent?.email,
    call?.agent?.name,
    call?.agent?.full_name,
    call?.agent?.email,

    cdr?.user_name,
    cdr?.user_full_name,
    cdr?.user_email,
    cdr?.agent_name,
    cdr?.agent_full_name,
    cdr?.agent_email,
    cdr?.operator_name,
    cdr?.employee_name,
  ];

  for (const candidate of candidates) {
    if (
      candidate &&
      typeof candidate !== "object" &&
      String(candidate).trim()
    ) {
      return String(candidate).trim();
    }
  }

  if (cdr?.user_id) {
    return `Usuário #${cdr.user_id}`;
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
  const maxPages = 100;

  const dateFromIso = new Date(dateFrom * 1000).toISOString().slice(0, 10);
  const dateToIso = new Date(dateTo * 1000).toISOString().slice(0, 10);

  let firstResponseDebug: any = null;
  let endpointUsed = "";

  for (let page = 1; page <= maxPages; page++) {
    const paths = [
      `/calls/index.json?page=${page}&per_page=100&date_from=${dateFromIso}&date_to=${dateToIso}`,
      `/calls/index.json?page=${page}&limit=100&date_from=${dateFromIso}&date_to=${dateToIso}`,
      `/calls/index.json?page=${page}&per_page=100&from=${dateFromIso}&to=${dateToIso}`,
      `/calls/index.json?page=${page}&limit=100&from=${dateFromIso}&to=${dateToIso}`,
      `/calls/index.json?page=${page}&per_page=100&from=${dateFrom}&to=${dateTo}`,
      `/calls/index.json?page=${page}&limit=100&from=${dateFrom}&to=${dateTo}`,
      `/calls/index.json?page=${page}`,
    ];

    let pageCalls: any[] = [];
    let lastError = "";

    for (const path of paths) {
      const res = await cloudTalkFetch(accessKeyId, accessKeySecret, path);

      if (!firstResponseDebug) {
        firstResponseDebug = {
          path: res.path,
          status: res.status,
          topLevelKeys: res.data ? Object.keys(res.data) : [],
          responseDataKeys: res.data?.responseData
            ? Object.keys(res.data.responseData)
            : [],
          sampleRaw: JSON.stringify(res.data).slice(0, 2500),
        };
      }

      if (!res.ok || !res.data) {
        lastError = `CloudTalk erro (${res.status}): ${res.text.substring(
          0,
          300
        )}`;
        continue;
      }

      pageCalls = extractCalls(res.data);
      endpointUsed = path;

      if (pageCalls.length > 0) break;
    }

    if (pageCalls.length === 0) {
      if (page === 1 && lastError) {
        throw new Error(lastError);
      }

      break;
    }

    allCalls.push(...pageCalls);

    if (pageCalls.length < 50) break;
  }

  const filteredCalls = allCalls.filter((call) => {
    const callDate = getCallDate(call);

    if (!callDate) return true;

    return callDate >= dateFrom && callDate <= dateTo;
  });

  return {
    calls: filteredCalls,
    firstResponseDebug,
    endpointUsed,
  };
}

function buildCallsByUser(calls: any[]) {
  const byUser: Record<
    string,
    {
      user: string;
      inbound: number;
      outbound: number;
      unknown: number;
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
        unknown: 0,
        total: 0,
      };
    }

    if (direction === "inbound") {
      byUser[user].inbound += 1;
    } else if (direction === "outbound") {
      byUser[user].outbound += 1;
    } else {
      byUser[user].unknown += 1;
    }

    byUser[user].total += 1;
  }

  return Object.values(byUser).sort((a, b) => b.total - a.total);
}

function getCallSampleDebug(calls: any[]) {
  return calls.slice(0, 3).map((call) => {
    const cdr = getCdr(call);

    return {
      keys: Object.keys(call),
      cdrKeys: cdr ? Object.keys(cdr) : [],
      userDetected: getUserName(call),
      directionDetected: normalizeDirection(call),
      dateDetected: getCallDate(call),
      raw: JSON.stringify(call).slice(0, 1500),
    };
  });
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

      const fetchResult = await fetchCalls(
        access_key_id,
        access_key_secret,
        dateFrom,
        dateTo
      );

      const calls = fetchResult.calls;
      const callsByUser = buildCallsByUser(calls);

      const totals = callsByUser.reduce(
        (acc, item) => {
          acc.inbound += item.inbound;
          acc.outbound += item.outbound;
          acc.unknown += item.unknown;
          acc.total += item.total;

          return acc;
        },
        {
          inbound: 0,
          outbound: 0,
          unknown: 0,
          total: 0,
        }
      );

      return jsonResponse({
        success: true,
        calls,
        callsByUser,
        totals,
        totalFetched: calls.length,
        endpointUsed: fetchResult.endpointUsed,
        firstResponseDebug: fetchResult.firstResponseDebug,
        callSampleDebug: getCallSampleDebug(calls),
        debug:
          `${calls.length} chamadas encontradas. ` +
          `${callsByUser.length} usuários encontrados. ` +
          `Inbound: ${totals.inbound}. ` +
          `Outbound: ${totals.outbound}. ` +
          `Unknown: ${totals.unknown}.`,
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