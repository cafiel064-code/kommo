import { getSupabaseUrl, isSupabaseConfigured } from "./supabase";
import { getCloudTalkCredentials } from "./cloudtalk-storage";

export type CloudTalkCallsByUser = {
  user: string;
  inbound: number;
  outbound: number;
  unknown?: number;
  total: number;
};

export type CloudTalkCallsResponse = {
  success: boolean;
  calls: any[];
  callsByUser: CloudTalkCallsByUser[];
  totals: {
    inbound: number;
    outbound: number;
    unknown?: number;
    total: number;
  };
  totalFetched: number;
  debug?: string;
  error?: string;
};

export async function fetchCloudTalkCallsByUser(params?: {
  date_from?: number;
  date_to?: number;
}): Promise<CloudTalkCallsResponse> {
  const creds = getCloudTalkCredentials();

  if (!creds) {
    throw new Error("CloudTalk não configurada");
  }

  if (!isSupabaseConfigured()) {
    throw new Error("Supabase não configurado");
  }

  const res = await fetch(`${getSupabaseUrl()}/functions/v1/cloudtalk-engine`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({
      action: "calls_by_user",
      access_key_id: creds.accessKeyId,
      access_key_secret: creds.accessKeySecret,
      date_from: params?.date_from,
      date_to: params?.date_to,
    }),
  });

  const text = await res.text();

  let json: CloudTalkCallsResponse;

  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(
      `Resposta inválida da CloudTalk Function (${res.status}): ${text.substring(
        0,
        200
      )}`
    );
  }

  if (!res.ok || !json.success) {
    throw new Error(json.error || "Erro ao buscar chamadas da CloudTalk");
  }

  return {
    ...json,
    calls: json.calls ?? [],
    callsByUser: json.callsByUser ?? [],
    totals: json.totals ?? {
      inbound: 0,
      outbound: 0,
      unknown: 0,
      total: 0,
    },
  };
}