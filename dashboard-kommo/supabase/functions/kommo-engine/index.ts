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
    (f: any) => f.field_id === fieldId
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
        leadMap.set(lead.id, lead);
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
    ? new Date(allLeads[allLeads.length - 1].created_at * 1000).toLocaleDateString(
        "pt-BR"
      )
    : "sem data";

  return {
    leads: allLeads,
    debug: `${allLeads.length} leads encontrados. Mais recente: ${newest}. Mais antigo: ${oldest}.`,
  };
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
      `&order[created_at]=desc`;

    const res = await kommoFetch(subdomain, token, path);

    if (res.status === 204) break;

    if (!res.ok || !res.data) {
      throw new Error(
        `Erro ao buscar eventos (${res.status}): ${
          res.data?.detail || res.text.substring(0, 200)
        }`
      );
    }

    const pageEvents = res.data?._embedded?.events ?? [];

    if (pageEvents.length === 0) break;

    events.push(...pageEvents);

    if (pageEvents.length < limit) break;
  }

  return events;
}

function getVendaStatusId(pipelines: any[]): number | null {
  const statuses = pipelines.flatMap((pipeline: any) => {
    return pipeline._embedded?.statuses ?? [];
  });

  const found = statuses.find((status: any) => {
    return String(status.name).trim().toUpperCase() === "VENDA REALIZADA";
  });

  return found?.id ?? null;
}

function getLeadStatusAfter(event: any): number | null {
  try {
    const valueAfter = event?.value_after;

    if (Array.isArray(valueAfter)) {
      for (const item of valueAfter) {
        const statusId =
          item?.lead_status?.id ??
          item?.lead_status_id ??
          item?.status_id ??
          item?.value?.lead_status?.id ??
          item?.value?.status_id ??
          item?.value?.lead_status_id;

        if (statusId) return Number(statusId);
      }
    }

    const statusId =
      valueAfter?.lead_status?.id ??
      valueAfter?.lead_status_id ??
      valueAfter?.status_id ??
      valueAfter?.value?.lead_status?.id ??
      valueAfter?.value?.status_id ??
      valueAfter?.value?.lead_status_id ??
      event?.value?.lead_status?.id ??
      event?.value?.status_id ??
      event?.value?.lead_status_id;

    return statusId ? Number(statusId) : null;
  } catch {
    return null;
  }
}

function getEventUser(event: any): string {
  return (
    event.created_by_name ||
    event.modified_by_name ||
    event.author?.name ||
    event.account?.name ||
    "Usuário não identificado"
  );
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

function computeRealKPIs(leads: any[], vendaEvents: any[] = []) {
  const leadsCriados = leads.length;

  const leadMap = new Map<number, any>();
  for (const lead of leads) {
    leadMap.set(Number(lead.id), lead);
  }

  const vendaEventsUnique = getUniqueVendaEvents(vendaEvents);

  const vendasLeads = vendaEventsUnique
    .map((event) => leadMap.get(Number(event.entity_id)))
    .filter(Boolean);

  const vendasFallback = leads.filter((lead: any) => {
    return getFieldValueById(lead, FIELD_IDS.VENDA) === "Sim";
  });

  const vendasUsadas = vendasLeads.length > 0 ? vendasLeads : vendasFallback;

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
    vendasPorEventoQuantidade: vendaEventsUnique.length,
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

      const vendaStatusId = getVendaStatusId(pipelines);

      const vendaEvents = vendaStatusId
        ? statusEvents.filter((event: any) => {
            return getLeadStatusAfter(event) === vendaStatusId;
          })
        : [];

      const vendaEventsUnique = getUniqueVendaEvents(vendaEvents);

      const allStatusIds = new Set(
        statusEvents
          .map((event: any) => getLeadStatusAfter(event))
          .filter(Boolean)
      );

      const leadMap = new Map<number, any>();

      leadsResult.leads.forEach((lead: any) => {
        leadMap.set(Number(lead.id), lead);
      });

      const vendaLeads = vendaEventsUnique
        .map((event: any) => leadMap.get(Number(event.entity_id)))
        .filter(Boolean);

      const totalVendas = vendaLeads.reduce((acc: number, lead: any) => {
        return acc + Number(lead.price || 0);
      }, 0);

      const kpis = {
        ...computeRealKPIs(leadsResult.leads, vendaEventsUnique),
        vendasQuantidade: vendaLeads.length,
        totalVendas,
      };

      return jsonResponse({
        success: true,
        leads: leadsResult.leads,
        pipelines,
        kpis,
        vendaStatusId,
        vendaEvents,
        vendaEventsUnique,
        vendaEventsQuantidade: vendaEvents.length,
        vendaEventsUnicosQuantidade: vendaEventsUnique.length,
        vendaLeads,
        totalFetched: leadsResult.leads.length,
        statusEventsQuantidade: statusEvents.length,
        statusEventsDebug: statusEvents.slice(0, 5),
        statusIdsEncontrados: Array.from(allStatusIds),
        debug: `${leadsResult.debug} | eventos encontrados: ${statusEvents.length} | vendaStatusId: ${vendaStatusId} | vendas por movimentação: ${vendaEventsUnique.length} | total vendas: ${totalVendas}`,
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