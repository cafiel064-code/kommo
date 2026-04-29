import { supabase, getSupabaseUrl, isSupabaseConfigured } from "./supabase";
import { getCredentials } from "./kommo-storage";
import type {
  KommoEngineRequest,
  KommoEngineResponse,
  KommoLead,
  KommoPipeline,
  DashboardKPIs,
} from "@/types/kommo";

async function callEngine(
  action: KommoEngineRequest["action"],
  extra?: Record<string, any>
): Promise<KommoEngineResponse> {
  const creds = getCredentials();

  if (!creds) {
    throw new Error("Sem credenciais Kommo configuradas");
  }

  if (!isSupabaseConfigured()) {
    throw new Error(
      "Supabase não configurado. Defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no .env"
    );
  }

  const body: KommoEngineRequest = {
    action,
    subdomain: creds.subdomain,
    api_token: creds.apiToken,
    ...extra,
  };

  const res = await fetch(`${getSupabaseUrl()}/functions/v1/kommo-engine`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${
        supabase?.["supabaseKey"] ?? import.meta.env.VITE_SUPABASE_ANON_KEY
      }`,
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();

  let json: KommoEngineResponse;

  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(
      `Resposta inválida da Edge Function (${res.status}): ${text.substring(
        0,
        200
      )}`
    );
  }

  if (!res.ok || !json.success) {
    throw new Error(json.error || `Erro na Edge Function (${res.status})`);
  }

  return json;
}

export async function testConnection(): Promise<{
  success: boolean;
  account?: { id: number; name: string };
  error?: string;
}> {
  return callEngine("test_connection") as any;
}

export async function fetchLeads(): Promise<KommoLead[]> {
  const res = await callEngine("fetch_leads");
  return (res.leads ?? []) as KommoLead[];
}

export async function fetchPipelines(): Promise<KommoPipeline[]> {
  const res = await callEngine("fetch_pipelines");
  return (res.pipelines ?? []) as KommoPipeline[];
}

export async function fetchDashboardData(params?: {
  date_from?: number;
  date_to?: number;
}): Promise<{
  leads: KommoLead[];
  lostTagLeads: KommoLead[];
  pipelines: KommoPipeline[];
  kpis: DashboardKPIs;
  events: any[];
  tagDeletedEvents: any[];
  tag: string;
  totalFetched: number;
  vendaEvents: any[];
  vendaLeads: KommoLead[];
  totalVendas: number;
}> {
  const res = await callEngine("crm_data", {
    date_from: params?.date_from,
    date_to: params?.date_to,
  });

  return {
    leads: (res.leads ?? []) as KommoLead[],
    lostTagLeads: ((res as any).lostTagLeads ?? []) as KommoLead[],
    pipelines: (res.pipelines ?? []) as KommoPipeline[],
    kpis: res.kpis as DashboardKPIs,
    events: ((res as any).events ?? []) as any[],
    tagDeletedEvents: ((res as any).tagDeletedEvents ?? []) as any[],
    tag: (res as any).tag ?? "",
    totalFetched: (res as any).totalFetched ?? 0,
    vendaEvents: ((res as any).vendaEvents ?? []) as any[],
    vendaLeads: ((res as any).vendaLeads ?? []) as KommoLead[],
    totalVendas: Number((res as any).totalVendas ?? 0),
  };
}

export const FIELD_IDS = {
  VENDA: 1724504,
  COMPARECEU: 1724498,
  RESPONSAVEL: 1790641,
};