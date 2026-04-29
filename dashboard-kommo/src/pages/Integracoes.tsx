import { useState, useEffect } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { toast } from "sonner";
import {
  saveCredentials,
  getCredentials,
  clearCredentials,
  getAccountInfo,
  saveAccountInfo,
  isConnected,
} from "@/lib/kommo-storage";
import { testConnection } from "@/lib/kommo-api";
import {
  Link2,
  Link2Off,
  Loader2,
  CheckCircle2,
  XCircle,
  ChevronDown,
  Eye,
  EyeOff,
  ExternalLink,
  PhoneCall,
} from "lucide-react";

type CloudTalkCredentials = {
  accessKeyId: string;
  accessKeySecret: string;
};

const CLOUDTALK_STORAGE_KEY = "cloudtalk_credentials";

function saveCloudTalkCredentials(credentials: CloudTalkCredentials) {
  localStorage.setItem(CLOUDTALK_STORAGE_KEY, JSON.stringify(credentials));
}

function getCloudTalkCredentials(): CloudTalkCredentials | null {
  const raw = localStorage.getItem(CLOUDTALK_STORAGE_KEY);

  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function clearCloudTalkCredentials() {
  localStorage.removeItem(CLOUDTALK_STORAGE_KEY);
}

function isCloudTalkConnected() {
  const creds = getCloudTalkCredentials();

  return Boolean(creds?.accessKeyId && creds?.accessKeySecret);
}

export default function Integracoes() {
  const [subdomain, setSubdomain] = useState("");
  const [apiToken, setApiToken] = useState("");
  const [testingKommo, setTestingKommo] = useState(false);
  const [kommoConnected, setKommoConnected] = useState(false);
  const [accountName, setAccountName] = useState("");
  const [showToken, setShowToken] = useState(false);

  const [cloudTalkAccessKeyId, setCloudTalkAccessKeyId] = useState("");
  const [cloudTalkAccessKeySecret, setCloudTalkAccessKeySecret] = useState("");
  const [cloudTalkConnected, setCloudTalkConnected] = useState(false);
  const [showCloudTalkSecret, setShowCloudTalkSecret] = useState(false);

  const [kommoGuideOpen, setKommoGuideOpen] = useState(false);
  const [cloudTalkGuideOpen, setCloudTalkGuideOpen] = useState(false);

  useEffect(() => {
    const kommoCreds = getCredentials();

    if (kommoCreds) {
      setSubdomain(kommoCreds.subdomain);
      setApiToken(kommoCreds.apiToken);
      setKommoConnected(isConnected());

      const acc = getAccountInfo();
      if (acc) setAccountName(acc.name);
    }

    const cloudTalkCreds = getCloudTalkCredentials();

    if (cloudTalkCreds) {
      setCloudTalkAccessKeyId(cloudTalkCreds.accessKeyId);
      setCloudTalkAccessKeySecret(cloudTalkCreds.accessKeySecret);
      setCloudTalkConnected(isCloudTalkConnected());
    }
  }, []);

  async function handleConnectKommo() {
    if (!subdomain.trim() || !apiToken.trim()) {
      toast.error("Preencha o subdomínio e o token da API da Kommo");
      return;
    }

    setTestingKommo(true);

    try {
      saveCredentials({
        subdomain: subdomain.trim(),
        apiToken: apiToken.trim(),
      });

      const result = await testConnection();

      if (result.success && result.account) {
        saveAccountInfo(result.account);
        setAccountName(result.account.name);
        setKommoConnected(true);
        toast.success(`Kommo conectada: ${result.account.name}`);
      } else {
        clearCredentials();
        setKommoConnected(false);
        toast.error(result.error || "Falha na conexão com a Kommo");
      }
    } catch (err) {
      clearCredentials();
      setKommoConnected(false);
      toast.error(err instanceof Error ? err.message : "Erro ao conectar");
    } finally {
      setTestingKommo(false);
    }
  }

  function handleDisconnectKommo() {
    clearCredentials();
    setKommoConnected(false);
    setAccountName("");
    setSubdomain("");
    setApiToken("");
    toast.info("Desconectado da Kommo");
  }

  function handleConnectCloudTalk() {
    if (!cloudTalkAccessKeyId.trim() || !cloudTalkAccessKeySecret.trim()) {
      toast.error("Preencha o Access Key ID e o Access Key Secret da CloudTalk");
      return;
    }

    saveCloudTalkCredentials({
      accessKeyId: cloudTalkAccessKeyId.trim(),
      accessKeySecret: cloudTalkAccessKeySecret.trim(),
    });

    setCloudTalkConnected(true);
    toast.success("Credenciais da CloudTalk salvas");
  }

  function handleDisconnectCloudTalk() {
    clearCloudTalkCredentials();
    setCloudTalkConnected(false);
    setCloudTalkAccessKeyId("");
    setCloudTalkAccessKeySecret("");
    toast.info("Desconectado da CloudTalk");
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Integrações</h1>
        <p className="text-muted-foreground mt-1">
          Configure suas conexões com Kommo CRM e CloudTalk
        </p>
      </div>

      <Card className="border-2 border-border shadow-sm">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-psi-wine-light flex items-center justify-center">
                <Link2 className="w-5 h-5 text-psi-wine" />
              </div>

              <div>
                <CardTitle className="text-lg">Kommo CRM</CardTitle>
                <CardDescription>Leads, vendas e agendamentos</CardDescription>
              </div>
            </div>

            <Badge
              variant={kommoConnected ? "default" : "secondary"}
              className={
                kommoConnected
                  ? "bg-emerald-100 text-emerald-700 border-emerald-200"
                  : "bg-gray-100 text-gray-500"
              }
            >
              {kommoConnected ? (
                <span className="flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> Conectado
                </span>
              ) : (
                <span className="flex items-center gap-1">
                  <XCircle className="w-3 h-3" /> Desconectado
                </span>
              )}
            </Badge>
          </div>

          {kommoConnected && accountName && (
            <p className="text-sm text-muted-foreground mt-2 ml-[52px]">
              Conta:{" "}
              <span className="font-medium text-foreground">
                {accountName}
              </span>
            </p>
          )}
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="kommo-subdomain">Subdomínio</Label>

            <div className="flex items-center gap-2">
              <Input
                id="kommo-subdomain"
                placeholder="seudominio"
                value={subdomain}
                onChange={(e) => setSubdomain(e.target.value)}
                disabled={kommoConnected}
                className="flex-1"
              />

              <span className="text-sm text-muted-foreground whitespace-nowrap">
                .kommo.com
              </span>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="kommo-token">Token da API</Label>

            <div className="relative">
              <Input
                id="kommo-token"
                type={showToken ? "text" : "password"}
                placeholder="Cole o token da integração privada"
                value={apiToken}
                onChange={(e) => setApiToken(e.target.value)}
                disabled={kommoConnected}
                className="pr-10"
              />

              <button
                type="button"
                onClick={() => setShowToken(!showToken)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                {showToken ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            {!kommoConnected ? (
              <Button
                onClick={handleConnectKommo}
                disabled={testingKommo}
                className="bg-primary hover:bg-primary/90 text-primary-foreground"
              >
                {testingKommo ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Testando...
                  </>
                ) : (
                  <>
                    <Link2 className="w-4 h-4 mr-2" />
                    Conectar Kommo
                  </>
                )}
              </Button>
            ) : (
              <Button
                onClick={handleDisconnectKommo}
                variant="outline"
                className="border-red-200 text-red-600 hover:bg-red-50"
              >
                <Link2Off className="w-4 h-4 mr-2" />
                Desconectar Kommo
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="border-2 border-border shadow-sm">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                <PhoneCall className="w-5 h-5 text-blue-700" />
              </div>

              <div>
                <CardTitle className="text-lg">CloudTalk</CardTitle>
                <CardDescription>Chamadas, atendidas e perdidas</CardDescription>
              </div>
            </div>

            <Badge
              variant={cloudTalkConnected ? "default" : "secondary"}
              className={
                cloudTalkConnected
                  ? "bg-emerald-100 text-emerald-700 border-emerald-200"
                  : "bg-gray-100 text-gray-500"
              }
            >
              {cloudTalkConnected ? (
                <span className="flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> Conectado
                </span>
              ) : (
                <span className="flex items-center gap-1">
                  <XCircle className="w-3 h-3" /> Desconectado
                </span>
              )}
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="cloudtalk-key-id">Access Key ID</Label>

            <Input
              id="cloudtalk-key-id"
              placeholder="Cole o Access Key ID"
              value={cloudTalkAccessKeyId}
              onChange={(e) => setCloudTalkAccessKeyId(e.target.value)}
              disabled={cloudTalkConnected}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="cloudtalk-key-secret">Access Key Secret</Label>

            <div className="relative">
              <Input
                id="cloudtalk-key-secret"
                type={showCloudTalkSecret ? "text" : "password"}
                placeholder="Cole o Access Key Secret"
                value={cloudTalkAccessKeySecret}
                onChange={(e) => setCloudTalkAccessKeySecret(e.target.value)}
                disabled={cloudTalkConnected}
                className="pr-10"
              />

              <button
                type="button"
                onClick={() => setShowCloudTalkSecret(!showCloudTalkSecret)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                {showCloudTalkSecret ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            {!cloudTalkConnected ? (
              <Button
                onClick={handleConnectCloudTalk}
                className="bg-primary hover:bg-primary/90 text-primary-foreground"
              >
                <PhoneCall className="w-4 h-4 mr-2" />
                Salvar CloudTalk
              </Button>
            ) : (
              <Button
                onClick={handleDisconnectCloudTalk}
                variant="outline"
                className="border-red-200 text-red-600 hover:bg-red-50"
              >
                <Link2Off className="w-4 h-4 mr-2" />
                Desconectar CloudTalk
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Collapsible open={kommoGuideOpen} onOpenChange={setKommoGuideOpen}>
        <Card className="border border-border shadow-sm">
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">
                  Como obter o token da Kommo?
                </CardTitle>

                <ChevronDown
                  className={`w-5 h-5 text-muted-foreground transition-transform ${
                    kommoGuideOpen ? "rotate-180" : ""
                  }`}
                />
              </div>
            </CardHeader>
          </CollapsibleTrigger>

          <CollapsibleContent>
            <CardContent className="pt-0 space-y-4">
              <ol className="space-y-3 text-sm text-muted-foreground">
                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">
                    1
                  </span>
                  <span>
                    Acesse sua conta Kommo e vá em{" "}
                    <strong className="text-foreground">
                      Configurações → Integrações
                    </strong>
                  </span>
                </li>

                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">
                    2
                  </span>
                  <span>
                    Clique em{" "}
                    <strong className="text-foreground">
                      + Criar integração
                    </strong>{" "}
                    →{" "}
                    <strong className="text-foreground">
                      Integração privada
                    </strong>
                  </span>
                </li>

                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">
                    3
                  </span>
                  <span>
                    Copie o{" "}
                    <strong className="text-foreground">
                      Long-lived token
                    </strong>{" "}
                    e cole no campo acima
                  </span>
                </li>
              </ol>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      <Collapsible
        open={cloudTalkGuideOpen}
        onOpenChange={setCloudTalkGuideOpen}
      >
        <Card className="border border-border shadow-sm">
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">
                  Como obter as chaves da CloudTalk?
                </CardTitle>

                <ChevronDown
                  className={`w-5 h-5 text-muted-foreground transition-transform ${
                    cloudTalkGuideOpen ? "rotate-180" : ""
                  }`}
                />
              </div>
            </CardHeader>
          </CollapsibleTrigger>

          <CollapsibleContent>
            <CardContent className="pt-0 space-y-4">
              <ol className="space-y-3 text-sm text-muted-foreground">
                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">
                    1
                  </span>
                  <span>
                    Acesse a CloudTalk e vá em{" "}
                    <strong className="text-foreground">
                      Account → Settings → API Keys
                    </strong>
                  </span>
                </li>

                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">
                    2
                  </span>
                  <span>
                    Gere ou copie um par de chaves:{" "}
                    <strong className="text-foreground">
                      Access Key ID
                    </strong>{" "}
                    e{" "}
                    <strong className="text-foreground">
                      Access Key Secret
                    </strong>
                  </span>
                </li>

                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">
                    3
                  </span>
                  <span>Cole as chaves no bloco da CloudTalk acima</span>
                </li>
              </ol>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      <Card className="border border-amber-200 bg-amber-50/50 shadow-sm">
        <CardContent className="pt-6">
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center flex-shrink-0">
              <ExternalLink className="w-4 h-4 text-amber-600" />
            </div>

            <div className="space-y-1">
              <p className="text-sm font-medium text-amber-800">
                Configuração Supabase
              </p>

              <p className="text-xs text-amber-600">
                Este dashboard precisa de um projeto Supabase com a Edge
                Function{" "}
                <code className="bg-amber-100 px-1 rounded">
                  kommo-engine
                </code>{" "}
                deployada. Configure as variáveis{" "}
                <code className="bg-amber-100 px-1 rounded">
                  VITE_SUPABASE_URL
                </code>{" "}
                e{" "}
                <code className="bg-amber-100 px-1 rounded">
                  VITE_SUPABASE_ANON_KEY
                </code>{" "}
                no arquivo <code className="bg-amber-100 px-1 rounded">.env</code>.
              </p>

              <p className="text-xs text-amber-700">
                Importante: neste primeiro passo, as credenciais da CloudTalk
                ficam salvas no navegador. No próximo ajuste, o ideal é mover a
                chamada da CloudTalk para uma Edge Function do Supabase para não
                expor o segredo no frontend.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}