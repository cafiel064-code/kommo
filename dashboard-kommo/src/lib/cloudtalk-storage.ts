export type CloudTalkCredentials = {
  accessKeyId: string;
  accessKeySecret: string;
};

const CLOUDTALK_STORAGE_KEY = "cloudtalk_credentials";

export function saveCloudTalkCredentials(credentials: CloudTalkCredentials) {
  localStorage.setItem(CLOUDTALK_STORAGE_KEY, JSON.stringify(credentials));
}

export function getCloudTalkCredentials(): CloudTalkCredentials | null {
  const raw = localStorage.getItem(CLOUDTALK_STORAGE_KEY);

  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function clearCloudTalkCredentials() {
  localStorage.removeItem(CLOUDTALK_STORAGE_KEY);
}

export function isCloudTalkConnected() {
  const creds = getCloudTalkCredentials();

  return Boolean(creds?.accessKeyId && creds?.accessKeySecret);
}