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

  let res: Response;

  try {
    res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    });
  } catch (e) {
    return {
      ok: false,
      status: 0,
      data: null,
      text: `Erro de rede: ${e instanceof Error ? e.message : String(e)}`,
    };
  }

  const text = await res.text();

  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    // resposta não veio em JSON
  }

  return { ok: res.ok, status: res.status, data, text };
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
  const allLeads: any[] = [];
  const limit = 250;
  const maxPages = 200;

  for (let page = 1; page <= maxPages; page++) {
    const path =
      `/leads?limit=${limit}` +
      `&page=${page}` +
      `&filter[created_at][from]=${dateFrom}` +
      `&filter[created_at][to]=${dateTo}` +
      `&order[created_at]=desc`;

    const res = await kommoFetch(subdomain, token, path);

    if (res.status === 204) break;

    if (!res.ok || !res.data) {
      throw new Error(
        `Erro ao buscar leads (${res.status}): ${
          res.data?.detail || res.text.substring(0, 200)
        }`
      );
    }

    const leads = res.data?._embedded?.leads ?? [];

    if (leads.length === 0) break;

    allLeads.push(...leads);

    if (leads.length < limit) break;
  }

  return {
    leads: allLeads,
    debug: `${allLeads.length} leads encontrados no período.`,
  };
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

function computeRealKPIs(leads: any[]) {
  const leadsCriados = leads.length;

  const vendas = leads.filter((lead: any) => {
    return getFieldValueById(lead, FIELD_IDS.VENDA) === "Sim";
  });

  const totalVendas = vendas.reduce((acc: number, lead: any) => {
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

    if (getFieldValueById(lead, FIELD_IDS.VENDA) === "Sim") {
      porResponsavel[responsavel].vendas += 1;
      porResponsavel[responsavel].valor += Number(lead.price || 0);
    }

    if (getFieldValueById(lead, FIELD_IDS.COMPARECEU) === "Não") {
      porResponsavel[responsavel].naoCompareceu += 1;
    }

    if (getFieldValueById(lead, FIELD_IDS.COMPARECEU) === "Sim") {
      porResponsavel[responsavel].compareceu += 1;
    }
  });

  const taxaConversao =
    leadsCriados > 0
      ? Number(((vendas.length / leadsCriados) * 100).toFixed(2))
      : 0;

  return {
    leadsCriados,
    totalLeads: leadsCriados,
    vendasQuantidade: vendas.length,
    totalVendas,
    taxaConversao,
    compareceu,
    naoCompareceu,
    acompanhandoComparecimento,
    porResponsavel,
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

      const [leadsResult, pipelines] = await Promise.all([
        fetchLeadsByPeriod(subdomain, api_token, dateFrom, dateTo),
        fetchPipelines(subdomain, api_token),
      ]);

      await saveLeadSnapshots(leadsResult.leads);

      const kpis = computeRealKPIs(leadsResult.leads);

      return jsonResponse({
        success: true,
        leads: leadsResult.leads,
        pipelines,
        kpis,
        totalFetched: leadsResult.leads.length,
        debug: leadsResult.debug,
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