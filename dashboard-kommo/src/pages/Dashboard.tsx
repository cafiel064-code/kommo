import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Loader2,
  AlertCircle,
  RefreshCw,
  ArrowRight,
  Zap,
  Users,
  ChevronDown,
  DollarSign,
  UserCheck,
  XCircle,
  TrendingUp,
  CheckCircle,
} from "lucide-react";
import { fetchDashboardData } from "@/lib/kommo-api";
import { isConnected } from "@/lib/kommo-storage";
import { useNavigate } from "react-router-dom";
import type { KommoLead } from "@/types/kommo";

const FIELD_IDS = {
  VENDA: 1724504,
  COMPARECEU: 1724498,
  RESPONSAVEL: 1790641,
};

const ATENDENTES = ["Ana Paula", "Rayanne"];

function getFieldValueById(lead: KommoLead, fieldId: number): string | null {
  const field = lead.custom_fields_values?.find(
    (f: any) => f.field_id === fieldId
  );

  const value = field?.values?.[0]?.value;

  if (!value) return null;

  return String(value).trim();
}

function formatCurrency(value: number) {
  return Number(value || 0).toLocaleString("pt-PT", {
    style: "currency",
    currency: "EUR",
  });
}

export default function Dashboard() {
  const navigate = useNavigate();
  const connected = isConnected();

  const [filtro, setFiltro] = useState<"hoje" | "ontem" | "7d" | "30d" | "todos">("todos");

  const [leadsOpen, setLeadsOpen] = useState(false);
  const [vendasOpen, setVendasOpen] = useState(false);
  const [naoCompareceuOpen, setNaoCompareceuOpen] = useState(false);
  const [responsavelOpen, setResponsavelOpen] = useState<string | false>(false);

  const [visibleLeads, setVisibleLeads] = useState(100);
  const [visibleVendas, setVisibleVendas] = useState(100);
  const [visibleNaoCompareceu, setVisibleNaoCompareceu] = useState(100);
  const [visibleResponsavel, setVisibleResponsavel] = useState(100);

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["dashboard-data"],
    queryFn: fetchDashboardData,
    enabled: connected,
    retry: 1,
    staleTime: 2 * 60 * 1000,
  });

  if (!connected) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
        <Zap className="w-10 h-10 text-psi-wine" />
        <h2 className="text-xl font-bold">Conecte sua Kommo</h2>
        <Button
          onClick={() => navigate("/integracoes")}
          className="bg-primary text-primary-foreground"
        >
          <ArrowRight className="w-4 h-4 mr-2" />
          Ir para Integrações
        </Button>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
        <Loader2 className="w-10 h-10 text-psi-wine animate-spin" />
        <p className="text-muted-foreground">Carregando dados da Kommo...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
        <AlertCircle className="w-10 h-10 text-destructive" />
        <p className="text-sm text-muted-foreground">
          {error instanceof Error ? error.message : "Erro"}
        </p>
        <Button onClick={() => refetch()} variant="outline">
          <RefreshCw className="w-4 h-4 mr-2" />
          Tentar novamente
        </Button>
      </div>
    );
  }

  if (!data) return null;

  const allLeads: KommoLead[] = data.leads ?? [];

  function filterByCreatedAt(lead: KommoLead): boolean {
    if (!lead.created_at) return false;

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const createdAt = lead.created_at * 1000;

    switch (filtro) {
      case "hoje":
        return createdAt >= todayStart.getTime();

      case "ontem": {
        const ontemStart = todayStart.getTime() - 86400000;
        return createdAt >= ontemStart && createdAt < todayStart.getTime();
      }

      case "7d":
        return createdAt >= todayStart.getTime() - 7 * 86400000;

      case "30d":
        return createdAt >= todayStart.getTime() - 30 * 86400000;

      default:
        return true;
    }
  }

  const leads = filtro === "todos" ? allLeads : allLeads.filter(filterByCreatedAt);

  const vendas = leads.filter(
    (lead) => getFieldValueById(lead, FIELD_IDS.VENDA) === "Sim"
  );

  const totalVendasValor = vendas.reduce(
    (acc, lead) => acc + Number(lead.price || 0),
    0
  );

  const naoCompareceu = leads.filter(
    (lead) => getFieldValueById(lead, FIELD_IDS.COMPARECEU) === "Não"
  );

  const compareceu = leads.filter(
    (lead) => getFieldValueById(lead, FIELD_IDS.COMPARECEU) === "Sim"
  );

  const taxaConversao =
    leads.length > 0 ? Math.round((vendas.length / leads.length) * 100) : 0;

  const porResponsavel: Record<
    string,
    {
      leads: KommoLead[];
      vendas: KommoLead[];
      valor: number;
      naoCompareceu: KommoLead[];
      compareceu: KommoLead[];
    }
  > = {};

  for (const nome of ATENDENTES) {
    porResponsavel[nome] = {
      leads: [],
      vendas: [],
      valor: 0,
      naoCompareceu: [],
      compareceu: [],
    };
  }

  for (const lead of leads) {
    const responsavel =
      getFieldValueById(lead, FIELD_IDS.RESPONSAVEL) || "Sem responsável";

    if (!porResponsavel[responsavel]) {
      porResponsavel[responsavel] = {
        leads: [],
        vendas: [],
        valor: 0,
        naoCompareceu: [],
        compareceu: [],
      };
    }

    porResponsavel[responsavel].leads.push(lead);

    if (getFieldValueById(lead, FIELD_IDS.VENDA) === "Sim") {
      porResponsavel[responsavel].vendas.push(lead);
      porResponsavel[responsavel].valor += Number(lead.price || 0);
    }

    if (getFieldValueById(lead, FIELD_IDS.COMPARECEU) === "Não") {
      porResponsavel[responsavel].naoCompareceu.push(lead);
    }

    if (getFieldValueById(lead, FIELD_IDS.COMPARECEU) === "Sim") {
      porResponsavel[responsavel].compareceu.push(lead);
    }
  }

  function leadDate(lead: KommoLead) {
    return lead.created_at
      ? new Date(lead.created_at * 1000).toLocaleDateString("pt-BR")
      : "—";
  }

  function renderLeadBadges(lead: KommoLead) {
    const venda = getFieldValueById(lead, FIELD_IDS.VENDA);
    const comparecimento = getFieldValueById(lead, FIELD_IDS.COMPARECEU);
    const responsavel = getFieldValueById(lead, FIELD_IDS.RESPONSAVEL);

    return (
      <div className="flex gap-1 flex-wrap">
        {responsavel && (
          <Badge className="bg-purple-100 text-purple-700 text-[10px]">
            {responsavel}
          </Badge>
        )}

        {venda === "Sim" && (
          <Badge className="bg-green-100 text-green-700 text-[10px]">
            Venda realizada
          </Badge>
        )}

        {comparecimento === "Sim" && (
          <Badge className="bg-emerald-100 text-emerald-700 text-[10px]">
            Compareceu
          </Badge>
        )}

        {comparecimento === "Não" && (
          <Badge className="bg-red-100 text-red-700 text-[10px]">
            Não compareceu
          </Badge>
        )}

        {comparecimento === "Acompanhando" && (
          <Badge className="bg-amber-100 text-amber-700 text-[10px]">
            Acompanhando
          </Badge>
        )}
      </div>
    );
  }

  function renderLeadList(list: KommoLead[], visible: number) {
    return (
      <div className="space-y-1.5">
        {list.slice(0, visible).map((lead) => (
          <div
            key={lead.id}
            className="flex items-center justify-between border rounded-lg px-3 py-2 text-sm hover:bg-muted/50"
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-medium truncate max-w-[120px] sm:max-w-[220px]">
                {lead.name || `Lead #${lead.id}`}
              </span>
              {renderLeadBadges(lead)}
            </div>

            <div className="flex items-center gap-3 text-xs text-muted-foreground flex-shrink-0">
              {lead.price > 0 && (
                <span className="font-medium text-green-600">
                  {formatCurrency(lead.price)}
                </span>
              )}
              <span>{leadDate(lead)}</span>
              <span className="text-[10px] text-muted-foreground/50">
                #{lead.id}
              </span>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">Dash Euro</h1>
          <p className="text-muted-foreground text-xs sm:text-sm">
            Euro Implantes — Kommo CRM
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Tabs
            value={filtro}
            onValueChange={(v) => {
              setFiltro(v as typeof filtro);
              setVisibleLeads(100);
              setVisibleVendas(100);
              setVisibleNaoCompareceu(100);
              setVisibleResponsavel(100);
              setLeadsOpen(false);
              setVendasOpen(false);
              setNaoCompareceuOpen(false);
              setResponsavelOpen(false);
            }}
          >
            <TabsList className="h-8 sm:h-9">
              <TabsTrigger value="hoje" className="text-[10px] sm:text-xs px-2 sm:px-3">
                Hoje
              </TabsTrigger>
              <TabsTrigger value="ontem" className="text-[10px] sm:text-xs px-2 sm:px-3">
                Ontem
              </TabsTrigger>
              <TabsTrigger value="7d" className="text-[10px] sm:text-xs px-2 sm:px-3">
                7d
              </TabsTrigger>
              <TabsTrigger value="30d" className="text-[10px] sm:text-xs px-2 sm:px-3">
                30d
              </TabsTrigger>
              <TabsTrigger value="todos" className="text-[10px] sm:text-xs px-2 sm:px-3">
                Todos
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <Button
            size="sm"
            variant="outline"
            onClick={() => refetch()}
            disabled={isFetching}
            className="h-8 sm:h-9 px-2 sm:px-3"
          >
            <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline ml-2">Atualizar</span>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <Card
          className="border-2 border-psi-wine/20 shadow-sm cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => {
            setLeadsOpen(!leadsOpen);
            setVendasOpen(false);
            setNaoCompareceuOpen(false);
            setVisibleLeads(100);
          }}
        >
          <CardContent className="pt-3 pb-3 px-3 sm:pt-5 sm:pb-4 sm:px-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-9 h-9 sm:w-12 sm:h-12 rounded-xl bg-psi-wine/10 flex items-center justify-center">
                  <Users className="w-6 h-6 text-psi-wine" />
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Leads no período
                  </p>
                  <p className="text-2xl sm:text-4xl font-bold text-psi-wine">
                    {leads.length}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Leads criados conforme filtro
                  </p>
                </div>
              </div>
              <ChevronDown
                className={`w-5 h-5 text-muted-foreground transition-transform ${
                  leadsOpen ? "rotate-180" : ""
                }`}
              />
            </div>
          </CardContent>
        </Card>

        <Card
          className="border-2 border-green-200 shadow-sm cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => {
            setVendasOpen(!vendasOpen);
            setLeadsOpen(false);
            setNaoCompareceuOpen(false);
            setVisibleVendas(100);
          }}
        >
          <CardContent className="pt-3 pb-3 px-3 sm:pt-5 sm:pb-4 sm:px-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-9 h-9 sm:w-12 sm:h-12 rounded-xl bg-green-50 flex items-center justify-center">
                  <DollarSign className="w-6 h-6 text-green-600" />
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Vendas
                  </p>
                  <p className="text-2xl sm:text-4xl font-bold text-green-600">
                    {vendas.length}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {formatCurrency(totalVendasValor)}
                  </p>
                </div>
              </div>
              <ChevronDown
                className={`w-5 h-5 text-muted-foreground transition-transform ${
                  vendasOpen ? "rotate-180" : ""
                }`}
              />
            </div>
          </CardContent>
        </Card>

        <Card
          className="border-2 border-red-200 shadow-sm cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => {
            setNaoCompareceuOpen(!naoCompareceuOpen);
            setLeadsOpen(false);
            setVendasOpen(false);
            setVisibleNaoCompareceu(100);
          }}
        >
          <CardContent className="pt-3 pb-3 px-3 sm:pt-5 sm:pb-4 sm:px-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-9 h-9 sm:w-12 sm:h-12 rounded-xl bg-red-50 flex items-center justify-center">
                  <XCircle className="w-6 h-6 text-red-600" />
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Não compareceu
                  </p>
                  <p className="text-2xl sm:text-4xl font-bold text-red-600">
                    {naoCompareceu.length}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    No período selecionado
                  </p>
                </div>
              </div>
              <ChevronDown
                className={`w-5 h-5 text-muted-foreground transition-transform ${
                  naoCompareceuOpen ? "rotate-180" : ""
                }`}
              />
            </div>
          </CardContent>
        </Card>

        <Card className="border-2 border-emerald-200 shadow-sm">
          <CardContent className="pt-3 pb-3 px-3 sm:pt-5 sm:pb-4 sm:px-5">
            <div className="flex items-center gap-4">
              <div className="w-9 h-9 sm:w-12 sm:h-12 rounded-xl bg-emerald-50 flex items-center justify-center">
                <TrendingUp className="w-6 h-6 text-emerald-600" />
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Conversão
                </p>
                <p className="text-2xl sm:text-4xl font-bold text-emerald-600">
                  {taxaConversao}%
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {vendas.length} vendas de {leads.length} leads
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {leadsOpen && (
        <Card className="border border-border shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">
              Mostrando {Math.min(visibleLeads, leads.length)} de {leads.length} leads
            </CardTitle>
          </CardHeader>
          <CardContent>
            {renderLeadList(leads, visibleLeads)}

            {visibleLeads < leads.length && (
              <div className="flex justify-center pt-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setVisibleLeads((prev) => prev + 100)}
                  className="text-psi-wine border-psi-wine/30 hover:bg-psi-wine-light"
                >
                  Ver mais ({Math.min(100, leads.length - visibleLeads)} leads)
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {vendasOpen && (
        <Card className="border border-green-200 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-green-700">
              Mostrando {Math.min(visibleVendas, vendas.length)} de {vendas.length} vendas
            </CardTitle>
          </CardHeader>
          <CardContent>
            {vendas.length > 0 ? (
              <>
                {renderLeadList(vendas, visibleVendas)}

                {visibleVendas < vendas.length && (
                  <div className="flex justify-center pt-4">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setVisibleVendas((prev) => prev + 100)}
                      className="text-green-600 border-green-200 hover:bg-green-50"
                    >
                      Ver mais ({Math.min(100, vendas.length - visibleVendas)} vendas)
                    </Button>
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-6">
                Nenhuma venda no período selecionado.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {naoCompareceuOpen && (
        <Card className="border border-red-200 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-red-700">
              Mostrando {Math.min(visibleNaoCompareceu, naoCompareceu.length)} de{" "}
              {naoCompareceu.length} leads que não compareceram
            </CardTitle>
          </CardHeader>
          <CardContent>
            {naoCompareceu.length > 0 ? (
              <>
                {renderLeadList(naoCompareceu, visibleNaoCompareceu)}

                {visibleNaoCompareceu < naoCompareceu.length && (
                  <div className="flex justify-center pt-4">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setVisibleNaoCompareceu((prev) => prev + 100)}
                      className="text-red-600 border-red-200 hover:bg-red-50"
                    >
                      Ver mais (
                      {Math.min(100, naoCompareceu.length - visibleNaoCompareceu)} leads)
                    </Button>
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-6">
                Nenhum lead marcado como “Não compareceu” no período.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      <Card className="border-2 border-border shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center">
              <UserCheck className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <CardTitle className="text-base">Performance por Atendente</CardTitle>
              <p className="text-xs text-muted-foreground">
                Leads, vendas e valor vendido por responsável
              </p>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {Object.entries(porResponsavel)
              .filter(([, dados]) => dados.leads.length > 0)
              .map(([nome, dados]) => (
                <div
                  key={nome}
                  className="bg-purple-50 border border-purple-200 rounded-xl p-4 cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => {
                    setResponsavelOpen(responsavelOpen === nome ? false : nome);
                    setVisibleResponsavel(100);
                  }}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-medium text-purple-600 uppercase">
                        {nome}
                      </p>
                      <p className="text-3xl font-bold text-purple-700 mt-1">
                        {dados.leads.length}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        leads atribuídos
                      </p>
                    </div>

                    <ChevronDown
                      className={`w-5 h-5 text-purple-600 transition-transform ${
                        responsavelOpen === nome ? "rotate-180" : ""
                      }`}
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-2 mt-4 text-center">
                    <div className="bg-white/70 rounded-lg p-2">
                      <p className="text-xs text-muted-foreground">Vendas</p>
                      <p className="font-bold text-green-600">{dados.vendas.length}</p>
                    </div>

                    <div className="bg-white/70 rounded-lg p-2">
                      <p className="text-xs text-muted-foreground">Valor</p>
                      <p className="font-bold text-green-600 text-xs">
                        {formatCurrency(dados.valor)}
                      </p>
                    </div>

                    <div className="bg-white/70 rounded-lg p-2">
                      <p className="text-xs text-muted-foreground">Faltas</p>
                      <p className="font-bold text-red-600">
                        {dados.naoCompareceu.length}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
          </div>

          {Object.entries(porResponsavel).map(([nome, dados]) => {
            if (responsavelOpen !== nome) return null;

            return (
              <div key={`lista-${nome}`} className="space-y-1.5 pt-3 border-t">
                <p className="text-xs font-semibold text-purple-700 mb-2">
                  {nome}: {dados.leads.length} leads · {dados.vendas.length} vendas ·{" "}
                  {formatCurrency(dados.valor)}
                </p>

                {renderLeadList(dados.leads, visibleResponsavel)}

                {visibleResponsavel < dados.leads.length && (
                  <div className="flex justify-center pt-3">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setVisibleResponsavel((prev) => prev + 100)}
                      className="text-purple-600 border-purple-200 hover:bg-purple-50"
                    >
                      Ver mais ({Math.min(100, dados.leads.length - visibleResponsavel)} leads)
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card className="border border-dashed border-muted-foreground/30 shadow-sm">
        <CardContent className="py-5">
          <div className="flex items-center gap-3">
            <CheckCircle className="w-5 h-5 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">Blocos removidos</p>
              <p className="text-xs text-muted-foreground">
                Foram removidos os blocos antigos de IA-PPT, cadência, recuperação,
                status de reunião e closer antigo. Este painel agora usa apenas os
                campos reais do CRM Euro.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}