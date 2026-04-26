import type { KommoCredentials } from "@/types/kommo";

const STORAGE_KEY = "psi_kommo_credentials";
const ACCOUNT_KEY = "psi_kommo_account";

// ⚠️ CONFIGURE AQUI suas credenciais padrão da Kommo
// Isso permite que o dashboard abra já conectado automaticamente.
// Se preferir que o usuário digite manualmente, deixe os campos vazios.
const DEFAULT_CREDENTIALS: KommoCredentials = {
  subdomain: "",   // Ex: "meusubdominio" (parte antes de .kommo.com)
  apiToken: "",    // Token da integração privada da Kommo
};

export function saveCredentials(creds: KommoCredentials): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(creds));
}

export function getCredentials(): KommoCredentials | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    // Se não tem credenciais salvas, usa as padrão (se configuradas)
    if (DEFAULT_CREDENTIALS.subdomain && DEFAULT_CREDENTIALS.apiToken) {
      return DEFAULT_CREDENTIALS;
    }
    return null;
  }
  try {
    return JSON.parse(raw) as KommoCredentials;
  } catch {
    return null;
  }
}

export function clearCredentials(): void {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(ACCOUNT_KEY);
}

export function saveAccountInfo(info: { id: number; name: string }): void {
  localStorage.setItem(ACCOUNT_KEY, JSON.stringify(info));
}

export function getAccountInfo(): { id: number; name: string } | null {
  const raw = localStorage.getItem(ACCOUNT_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function isConnected(): boolean {
  return !!getCredentials();
}
