import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const FIELD_IDS = {
  VENDA: 1724504,
  COMPARECEU: 1724498,
  RESPONSAVEL: 1790641,
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

function getSupabase() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
}

interface RequestBody {
  action:
    | "test_connection"
    | "crm_data"
    | "fetch_leads"
    | "fetch_pipelines"
    | "list_custom_fields";
  subdomain: string;
  api_token: string;
  date_from?: number;
  date_to?: number;
}

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function kommoFetch(
  subdomain: string,
  token: string,
  path: string
): Promise<{ ok: boolean; status: number; data: any; text: string }> {
  const url = `https://${subdomain}.kommo.com/api/v4${path}`;

  try {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    });

    const text = await res.text();

    let data = null;
    try {
      data = JSON.parse(text);
    } catch {
      // resposta não veio em JSON
    }

    return { ok: res.ok, status: res.status, data, text };
  } catch (e) {
    return {
      ok: false,
      status: 0,
      data: null,
      text: `Erro de rede: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

function getFieldValueById(lead: any, fieldId: number): string | null {
  const field = lead.custom_fields_values?.find(
    (f: any) => Number(f.field_id) === Number(fieldId)
  );

  const value = field?.values?.[0]?.value;

  if (!value) return null;

  return String(value).trim();
}

async function fetchPipelines(subdomain: string, token: string): Promise<any[]> {
  const res = await kommoFetch(subdomain, token, "/leads/pipelines");

  if (!res.ok || !res.data) {
    throw new Error(
      `Kommo pipelines erro (${res.status}): ${
        res.data?.detail || res.text.substring(0, 200)
      }`
    );
  }

  return res.data?._embedded?.pipelines ?? [];
}

async function fetchCustomFields(
  subdomain: string,
  token: string
): Promise<any[]> {
  const res = await kommoFetch(
    subdomain,
    token,
    "/leads/custom_fields?limit=250"
  );

  if (!res.ok || !res.data) return [];

  return res.data?._embedded?.custom_fields ?? [];
}

async function fetchLeadsByPeriod(
  subdomain: string,
  token: string,
  dateFrom: number,
  dateTo: number
): Promise<{ leads: any[]; debug: string }> {
  const leadMap = new Map<number, any>();
  const limit = 250;
  const maxPages = 200;

  const modes: Array<"created_at" | "updated_at"> = [
    "created_at",
    "updated_at",
  ];

  for (const mode of modes) {
    for (let page = 1; page <= maxPages; page++) {
      const path =
        `/leads?limit=${limit}` +
        `&page=${page}` +
        `&filter[${mode}][from]=${dateFrom}` +
        `&filter[${mode}][to]=${dateTo}` +
        `&order[${mode}]=desc`;

      const res = await kommoFetch(subdomain, token, path);

      if (res.status === 204) break;

      if (!res.ok || !res.data) {
        throw new Error(
          `Erro ao buscar leads por ${mode} (${res.status}): ${
            res.data?.detail || res.text.substring(0, 200)
          }`
        );
      }

      const leads = res.data?._embedded?.leads ?? [];

      if (leads.length === 0) break;

      for (const lead of leads) {
        leadMap.set(Number(lead.id), lead);
      }

      if (leads.length < limit) break;
    }
  }

  const allLeads = Array.from(leadMap.values()).sort(
    (a, b) => (b.created_at || 0) - (a.created_at || 0)
  );

  const newest = allLeads[0]?.created_at
    ? new Date(allLeads[0].created_at * 1000).toLocaleDateString("pt-BR")
    : "sem data";

  const oldest = allLeads[allLeads.length - 1]?.created_at
    ? new Date(
        allLeads[allLeads.length - 1].created_at * 1000
      ).toLocaleDateString("pt-BR")
    : "sem data";

  return {
    leads: allLeads,
    debug: `${allLeads.length} leads encontrados. Mais recente: ${newest}. Mais antigo: ${oldest}.`,
  };
}

async function fetchLeadsByStatus(
  subdomain: string,
  token: string,
  pipelineId: number,
  statusId: number
): Promise<any[]> {
  const leads: any[] = [];
  const limit = 250;
  const maxPages = 200;

  for (let page = 1; page <= maxPages; page++) {
    const path =
      `/leads?limit=${limit}` +
      `&page=${page}` +
      `&filter[statuses][0][pipeline_id]=${pipelineId}` +
      `&filter[statuses][0][status_id]=${statusId}` +
      `&order[updated_at]=desc`;

    const res = await kommoFetch(subdomain, token, path);

    if (res.status === 204) break;

    if (!res.ok || !res.data) {
      throw new Error(
        `Erro ao buscar leads por status (${res.status}): ${
          res.data?.detail || res.text.substring(0, 200)
        }`
      );
    }

    const pageLeads = res.data?._embedded?.leads ?? [];

    if (pageLeads.length === 0) break;

    leads.push(...pageLeads);

    if (pageLeads.length < limit) break;
  }

  return leads;
}

async function fetchStatusEvents(
  subdomain: string,
  token: string,
  dateFrom: number,
  dateTo: number
): Promise<any[]> {
  const events: any[] = [];
  const limit = 100;
  const maxPages = 100;

  for (let page = 1; page <= maxPages; page++) {
    const path =
      `/events?limit=${limit}` +
      `&page=${page}` +
      `&filter[created_at][from]=${dateFrom}` +
      `&filter[created_at][to]=${dateTo}` +
      `&filter[type_code][]=14` +
      `&order[created_at]=desc`;

    const res = await kommoFetch(subdomain, token, path);

    if (res.status === 204) break;

    if (!res.ok || !res.data) {
      console.log("Erro ao buscar eventos:", res.status, res.text);
      break;
    }

    const pageEvents = res.data?._embedded?.events ?? [];

    if (pageEvents.length === 0) break;

    events.push(...pageEvents);

    if (pageEvents.length < limit) break;
  }

  return events;
}

function normalizeText(value: string): string {
  return String(value || "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function getVendaStatusInfo(
  pipelines: any[]
): { pipelineId: number; statusId: number; statusName: string } | null {
  for (const pipeline of pipelines) {
    const statuses = pipeline._embedded?.statuses ?? [];

    for (const status of statuses) {
      const statusName = normalizeText(status.name);

      if (
        statusName === "VENDA REALIZADA" ||
        statusName.includes("VENDA REALIZADA")
      ) {
        return {
          pipelineId: Number(pipeline.id),
          statusId: Number(status.id),
          statusName: String(status.name),
        };
      }
    }
  }

  return null;
}

function deepFindStatusId(obj: any): number | null {
  if (!obj || typeof obj !== "object") return null;

  if (typeof obj.id !== "undefined" && String(obj.name || "").length > 0) {
    return Number(obj.id);
  }

  const possibleKeys = [
    "status_id",
    "lead_status_id",
    "pipeline_status_id",
    "id",
  ];

  for (const key of possibleKeys) {
    if (typeof obj[key] !== "undefined") {
      const value = Number(obj[key]);
      if (!Number.isNaN(value)) return value;
    }
  }

  for (const key of Object.keys(obj)) {
    const value = obj[key];

    if (key === "lead_status" || key === "status") {
      const found =
        Number(value?.id) ||
        Number(value?.status_id) ||
        Number(value?.lead_status_id);

      if (found) return found;
    }

    if (typeof value === "object") {
      const found = deepFindStatusId(value);
      if (found) return found;
    }
  }

  return null;
}

function getLeadStatusAfter(event: any): number | null {
  try {
    const valueAfter = event?.value_after;

    if (Array.isArray(valueAfter)) {
      for (const item of valueAfter) {
        const found = deepFindStatusId(item);
        if (found) return Number(found);
      }
    }

    const found =
      deepFindStatusId(valueAfter) ||
      deepFindStatusId(event?.value) ||
      deepFindStatusId(event);

    return found ? Number(found) : null;
  } catch {
    return null;
  }
}

async function saveLeadSnapshots(leads: any[]) {
  if (leads.length === 0) return;

  const sb = getSupabase();

  const rows = leads.map((lead) => ({
    lead_id: lead.id,
    lead_name: lead.name || `Lead #${lead.id}`,
    pipeline_id: lead.pipeline_id,
    status_id: lead.status_id,
    venda_realizada: getFieldValueById(lead, FIELD_IDS.VENDA),
    compareceu: getFieldValueById(lead, FIELD_IDS.COMPARECEU),
    responsavel: getFieldValueById(lead, FIELD_IDS.RESPONSAVEL),
    price: lead.price || 0,
    snapshot_date: new Date().toISOString().split("T")[0],
  }));

  const { error } = await sb.from("lead_snapshots").upsert(rows, {
    onConflict: "lead_id",
    ignoreDuplicates: false,
  });

  if (error) {
    console.error("Erro ao salvar lead_snapshots:", error);
    throw new Error(`Erro ao salvar snapshots: ${error.message}`);
  }
}

function getUniqueLeadsById(leads: any[]): any[] {
  const map = new Map<number, any>();

  for (const lead of leads) {
    if (!lead?.id) continue;
    map.set(Number(lead.id), lead);
  }

  return Array.from(map.values());
}

function getUniqueVendaEvents(vendaEvents: any[]): any[] {
  const seenLeadIds = new Set<number>();
  const uniqueEvents: any[] = [];

  for (const event of vendaEvents) {
    const leadId = Number(event.entity_id);

    if (!leadId || seenLeadIds.has(leadId)) continue;

    seenLeadIds.add(leadId);
    uniqueEvents.push(event);
  }

  return uniqueEvents;
}

function leadDentroDoPeriodo(lead: any, dateFrom: number, dateTo: number) {
  const updatedAt = Number(lead.updated_at || 0);
  const closedAt = Number(lead.closed_at || 0);

  return (
    (updatedAt >= dateFrom && updatedAt <= dateTo) ||
    (closedAt >= dateFrom && closedAt <= dateTo)
  );
}

function computeRealKPIs(leads: any[], vendasUsadas: any[]) {
  const leadsCriados = leads.length;

  const totalVendas = vendasUsadas.reduce((acc: number, lead: any) => {
    return acc + Number(lead.price || 0);
  }, 0);

  const naoCompareceu = leads.filter((lead: any) => {
    return getFieldValueById(lead, FIELD_IDS.COMPARECEU) === "Não";
  }).length;

  const compareceu = leads.filter((lead: any) => {
    return getFieldValueById(lead, FIELD_IDS.COMPARECEU) === "Sim";
  }).length;

  const acompanhandoComparecimento = leads.filter((lead: any) => {
    return getFieldValueById(lead, FIELD_IDS.COMPARECEU) === "Acompanhando";
  }).length;

  const porResponsavel: Record<
    string,
    {
      leads: number;
      vendas: number;
      valor: number;
      naoCompareceu: number;
      compareceu: number;
    }
  > = {};

  leads.forEach((lead: any) => {
    const responsavel =
      getFieldValueById(lead, FIELD_IDS.RESPONSAVEL) || "Sem responsável";

    if (!porResponsavel[responsavel]) {
      porResponsavel[responsavel] = {
        leads: 0,
        vendas: 0,
        valor: 0,
        naoCompareceu: 0,
        compareceu: 0,
      };
    }

    porResponsavel[responsavel].leads += 1;

    if (getFieldValueById(lead, FIELD_IDS.COMPARECEU) === "Não") {
      porResponsavel[responsavel].naoCompareceu += 1;
    }

    if (getFieldValueById(lead, FIELD_IDS.COMPARECEU) === "Sim") {
      porResponsavel[responsavel].compareceu += 1;
    }
  });

  for (const lead of vendasUsadas) {
    const responsavel =
      getFieldValueById(lead, FIELD_IDS.RESPONSAVEL) || "Sem responsável";

    if (!porResponsavel[responsavel]) {
      porResponsavel[responsavel] = {
        leads: 0,
        vendas: 0,
        valor: 0,
        naoCompareceu: 0,
        compareceu: 0,
      };
    }

    porResponsavel[responsavel].vendas += 1;
    porResponsavel[responsavel].valor += Number(lead.price || 0);
  }

  const taxaConversao =
    leadsCriados > 0
      ? Number(((vendasUsadas.length / leadsCriados) * 100).toFixed(2))
      : 0;

  return {
    leadsCriados,
    totalLeads: leadsCriados,
    vendasQuantidade: vendasUsadas.length,
    totalVendas,
    taxaConversao,
    compareceu,
    naoCompareceu,
    acompanhandoComparecimento,
    porResponsavel,
    vendasPorEventoQuantidade: vendasUsadas.length,
    followUpsPorResponsavel: {},
    tempoMedioResposta: null,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body: RequestBody = await req.json();
    const { action, subdomain, api_token } = body;

    console.log("ACTION RECEBIDA:", action);

    if (!subdomain || !api_token) {
      return jsonResponse(
        { success: false, error: "subdomain e api_token são obrigatórios" },
        400
      );
    }

    if (action === "test_connection") {
      const res = await kommoFetch(subdomain, api_token, "/account");

      if (!res.ok || !res.data) {
        return jsonResponse({
          success: false,
          error: `Falha na conexão (${res.status}): ${
            res.data?.detail || "Resposta inválida"
          }`,
        });
      }

      return jsonResponse({
        success: true,
        account: {
          id: res.data.id,
          name: res.data.name,
        },
      });
    }

    if (action === "list_custom_fields") {
      const fields = await fetchCustomFields(subdomain, api_token);

      return jsonResponse({
        success: true,
        fields: fields.map((field: any) => ({
          id: field.id,
          name: field.name,
          type: field.type,
          enums:
            field.enums?.map((item: any) => ({
              id: item.id,
              value: item.value,
            })) ?? [],
        })),
      });
    }

    if (action === "fetch_pipelines") {
      const pipelines = await fetchPipelines(subdomain, api_token);

      return jsonResponse({
        success: true,
        pipelines,
      });
    }

    if (action === "fetch_leads") {
      const now = Math.floor(Date.now() / 1000);
      const defaultStart = 0;

      const dateFrom = body.date_from ?? defaultStart;
      const dateTo = body.date_to ?? now;

      const leadsResult = await fetchLeadsByPeriod(
        subdomain,
        api_token,
        dateFrom,
        dateTo
      );

      return jsonResponse({
        success: true,
        leads: leadsResult.leads,
        totalFetched: leadsResult.leads.length,
        debug: leadsResult.debug,
      });
    }

    if (action === "crm_data") {
      const now = Math.floor(Date.now() / 1000);
      const defaultStart = 0;

      const dateFrom = body.date_from ?? defaultStart;
      const dateTo = body.date_to ?? now;

      const [leadsResult, pipelines, statusEvents] = await Promise.all([
        fetchLeadsByPeriod(subdomain, api_token, 0, now),
        fetchPipelines(subdomain, api_token),
        fetchStatusEvents(subdomain, api_token, dateFrom, dateTo),
      ]);

      const vendaStatusInfo = getVendaStatusInfo(pipelines);

      if (!vendaStatusInfo) {
        return jsonResponse({
          success: false,
          error: "Etapa Venda Realizada não encontrada nos funis da Kommo.",
          pipelinesDebug: pipelines.map((pipeline: any) => ({
            pipeline_id: pipeline.id,
            pipeline_name: pipeline.name,
            statuses: pipeline._embedded?.statuses?.map((status: any) => ({
              id: status.id,
              name: status.name,
            })),
          })),
        });
      }

      const vendaEvents = statusEvents.filter((event: any) => {
        const statusAfter = getLeadStatusAfter(event);
        return Number(statusAfter) === Number(vendaStatusInfo.statusId);
      });

      const vendaEventsUnique = getUniqueVendaEvents(vendaEvents);

      const leadMap = new Map<number, any>();

      leadsResult.leads.forEach((lead: any) => {
        leadMap.set(Number(lead.id), lead);
      });

      const vendaLeadsPorEvento = vendaEventsUnique
        .map((event: any) => leadMap.get(Number(event.entity_id)))
        .filter(Boolean);

      const vendaLeadsPorStatus = await fetchLeadsByStatus(
        subdomain,
        api_token,
        vendaStatusInfo.pipelineId,
        vendaStatusInfo.statusId
      );

      const vendaLeadsPorStatusNoPeriodo = vendaLeadsPorStatus.filter(
        (lead: any) => leadDentroDoPeriodo(lead, dateFrom, dateTo)
      );

      const vendasUsadas =
        vendaLeadsPorEvento.length > 0
          ? vendaLeadsPorEvento
          : vendaLeadsPorStatusNoPeriodo;

      const vendasUnicas = getUniqueLeadsById(vendasUsadas);

      const totalVendas = vendasUnicas.reduce((acc: number, lead: any) => {
        return acc + Number(lead.price || 0);
      }, 0);

      const kpis = {
        ...computeRealKPIs(leadsResult.leads, vendasUnicas),
        vendasQuantidade: vendasUnicas.length,
        totalVendas,
      };

      const statusIdsEncontrados = Array.from(
        new Set(
          statusEvents
            .map((event: any) => getLeadStatusAfter(event))
            .filter(Boolean)
        )
      );

      return jsonResponse({
        success: true,
        leads: leadsResult.leads,
        pipelines,
        kpis,

        vendaStatusId: vendaStatusInfo.statusId,
        vendaPipelineId: vendaStatusInfo.pipelineId,
        vendaStatusName: vendaStatusInfo.statusName,

        vendaEvents,
        vendaEventsUnique,
        vendaEventsQuantidade: vendaEvents.length,
        vendaEventsUnicosQuantidade: vendaEventsUnique.length,

        vendaLeadsPorEvento,
        vendaLeadsPorEventoQuantidade: vendaLeadsPorEvento.length,

        vendaLeadsPorStatus,
        vendaLeadsPorStatusQuantidade: vendaLeadsPorStatus.length,

        vendaLeadsPorStatusNoPeriodo,
        vendaLeadsPorStatusNoPeriodoQuantidade:
          vendaLeadsPorStatusNoPeriodo.length,

        vendaLeads: vendasUnicas,
        totalFetched: leadsResult.leads.length,

        statusEventsQuantidade: statusEvents.length,
        statusEventsDebug: statusEvents.slice(0, 5),
        statusIdsEncontrados,

        totalVendas,

        debug:
          `${leadsResult.debug} | ` +
          `eventos de status encontrados: ${statusEvents.length} | ` +
          `vendaStatusId: ${vendaStatusInfo.statusId} | ` +
          `vendas por evento: ${vendaLeadsPorEvento.length} | ` +
          `vendas por status no período: ${vendaLeadsPorStatusNoPeriodo.length} | ` +
          `vendas usadas: ${vendasUnicas.length} | ` +
          `total vendas: ${totalVendas}`,
      });
    }

    return jsonResponse(
      { success: false, error: `Ação desconhecida: ${action}` },
      400
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro interno";

    console.error("kommo-engine error:", message);

    return jsonResponse(
      {
        success: false,
        error: message,
      },
      500
    );
  }
});