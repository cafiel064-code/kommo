import { useEffect, useState } from "react";
import {
  AlertCircle,
  CalendarDays,
  CheckCircle,
  ChevronDown,
  DollarSign,
  Loader2,
  RefreshCw,
  TrendingUp,
  UserCheck,
  Users,
  XCircle,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import { fetchDashboardData, FIELD_IDS } from "@/lib/kommo-api";
import { isConnected } from "@/lib/kommo-storage";
import { useNavigate } from "react-router-dom";
import type { KommoLead } from "@/types/kommo";

const ATENDENTES = ["Ana Paula", "Rayanne"];

type DashboardData = Awaited<ReturnType<typeof fetchDashboardData>>;

function getFieldValueById(lead: KommoLead, fieldId: number): string | null {
  const field = lead.custom_fields_values?.find(
    (f: any) => Number(f.field_id) === Number(fieldId)
  );

  const value = field?.values?.[0]?.value;

  return value ? String(value).trim() : null;
}

function formatCurrency(value: number) {
  return Number(value || 0).toLocaleString("pt-PT", {
    style: "currency",
    currency: "EUR",
  });
}

function toInputDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function dateInputToUnixStart(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return Math.floor(
    new Date(year, month - 1, day, 0, 0, 0, 0).getTime() / 1000
  );
}

function dateInputToUnixEnd(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return Math.floor(
    new Date(year, month - 1, day, 23, 59, 59, 999).getTime() / 1000
  );
}

function formatDateBR(value: string) {
  if (!value) return "";

  const [year, month, day] = value.split("-");

  return `${day}/${month}/${year}`;
}

function getDefaultSevenDaysRange() {
  const hoje = new Date();
  const seteDiasAtras = new Date();

  seteDiasAtras.setDate(hoje.getDate() - 7);

  return {
    from: toInputDate(seteDiasAtras),
    to: toInputDate(hoje),
  };
}

function uniqueLeads(leads: KommoLead[]) {
  const map = new Map<number, KommoLead>();

  for (const lead of leads || []) {
    if (!lead?.id) continue;
    map.set(Number(lead.id), lead);
  }

  return Array.from(map.values());
}

export default function Dashboard() {
  const navigate = useNavigate();
  const connected = isConnected();

  const defaultRange = getDefaultSevenDaysRange();

  const [dateFromInput, setDateFromInput] = useState(defaultRange.from);
  const [dateToInput, setDateToInput] = useState(defaultRange.to);
  const [allTime, setAllTime] = useState(false);

  const [data, setData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isFetching, setIsFetching] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const [leadsOpen, setLeadsOpen] = useState(false);
  const [vendasOpen, setVendasOpen] = useState(false);
  const [agendadosOpen, setAgendadosOpen] = useState(false);
  const [naoCompareceuOpen, setNaoCompareceuOpen] = useState(false);
  const [responsavelOpen, setResponsavelOpen] = useState<string | false>(false);

  const [visibleLeads, setVisibleLeads] = useState(100);
  const [visibleVendas, setVisibleVendas] = useState(100);
  const [visibleAgendados, setVisibleAgendados] = useState(100);
  const [visibleNaoCompareceu, setVisibleNaoCompareceu] = useState(100);
  const [visibleResponsavel, setVisibleResponsavel] = useState(100);

  const dateFrom = allTime ? 0 : dateInputToUnixStart(dateFromInput);
  const dateTo = allTime
    ? Math.floor(Date.now() / 1000)
    : dateInputToUnixEnd(dateToInput || dateFromInput);

  async function loadDashboard() {
    if (!connected) {
      setIsLoading(false);
      return;
    }

    try {
      setError(null);
      setIsFetching(true);

      const result = await fetchDashboardData({
        date_from: dateFrom,
        date_to: dateTo,
      });

      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err : new Error("Erro desconhecido"));
    } finally {
      setIsLoading(false);
      setIsFetching(false);
    }
  }

  useEffect(() => {
    loadDashboard();
  }, [connected, dateFrom, dateTo]);

  function resetLists() {
    setVisibleLeads(100);
    setVisibleVendas(100);
    setVisibleAgendados(100);
    setVisibleNaoCompareceu(100);
    setVisibleResponsavel(100);
    setLeadsOpen(false);
    setVendasOpen(false);
    setAgendadosOpen(false);
    setNaoCompareceuOpen(false);
    setResponsavelOpen(false);
  }

  function aplicarUltimosSeteDias() {
    const range = getDefaultSevenDaysRange();

    setDateFromInput(range.from);
    setDateToInput(range.to);
    setAllTime(false);
    resetLists();
  }

  function aplicarTodaExistencia() {
    setAllTime(true);
    resetLists();
  }

  function periodoLabel() {
    if (allTime) return "Toda existência do CRM";

    return `${formatDateBR(dateFromInput)} até ${formatDateBR(dateToInput)}`;
  }

  if (!connected) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="p-6 space-y-4">
            <h2 className="text-xl font-semibold">Conecte sua Kommo</h2>
            <p className="text-muted-foreground">
              Configure suas credenciais para carregar o dashboard.
            </p>

            <Button
              onClick={() => navigate("/integracoes")}
              className="bg-primary text-primary-foreground"
            >
              Ir para Integrações
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          Carregando dados da Kommo...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="p-6 space-y-4">
            <div className="flex items-center gap-2 text-red-600">
              <AlertCircle className="h-5 w-5" />
              <strong>Erro ao carregar dashboard</strong>
            </div>

            <p>{error.message}</p>

            <Button onClick={loadDashboard} variant="outline">
              Tentar novamente
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="p-6">
            <p className="text-muted-foreground">
              Nenhum dado encontrado para o período selecionado.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const allLeads: KommoLead[] = data.leads ?? [];

  const vendaEvents = (data as any).vendaEvents ?? [];
  const vendaLeadsBackend = ((data as any).vendaLeads ?? []) as KommoLead[];

  const agendadoEvents = (data as any).agendadoEvents ?? [];
  const agendadoLeadsBackend = ((data as any).agendadoLeads ??
    []) as KommoLead[];

  function leadInSelectedPeriod(lead: KommoLead): boolean {
    if (allTime) return true;
    if (!lead.created_at) return false;

    const createdAt = Number(lead.created_at);

    return createdAt >= dateFrom && createdAt <= dateTo;
  }

  function eventInSelectedPeriod(event: any): boolean {
    if (allTime) return true;
    if (!event.created_at) return false;

    const eventAt = Number(event.created_at);

    return eventAt >= dateFrom && eventAt <= dateTo;
  }

  const leads = allLeads.filter(leadInSelectedPeriod);

  const vendaEventsFiltrados = vendaEvents.filter(eventInSelectedPeriod);
  const agendadoEventsFiltrados = agendadoEvents.filter(eventInSelectedPeriod);

  const vendaLeadIds = new Set(
    vendaEventsFiltrados.map((event: any) => Number(event.entity_id))
  );

  const agendadoLeadIds = new Set(
    agendadoEventsFiltrados.map((event: any) => Number(event.entity_id))
  );

  const vendasPorEvento = allLeads.filter((lead) =>
    vendaLeadIds.has(Number(lead.id))
  );

  const agendadosPorEvento = allLeads.filter((lead) =>
    agendadoLeadIds.has(Number(lead.id))
  );

  const vendas = uniqueLeads(
    vendasPorEvento.length > 0 ? vendasPorEvento : vendaLeadsBackend
  );

  const agendados = uniqueLeads(
    agendadosPorEvento.length > 0 ? agendadosPorEvento : agendadoLeadsBackend
  );

  const totalVendasValor = vendas.reduce(
    (acc, lead) => acc + Number(lead.price || 0),
    0
  );

  const naoCompareceu = leads.filter(
    (lead) => getFieldValueById(lead, FIELD_IDS.COMPARECEU) === "Não"
  );

  const taxaConversao =
    leads.length > 0 ? Math.round((vendas.length / leads.length) * 100) : 0;

  function getVendaEventByLeadId(leadId: number) {
    return vendaEventsFiltrados.find(
      (event: any) => Number(event.entity_id) === Number(leadId)
    );
  }

  function getAgendadoEventByLeadId(leadId: number) {
    return agendadoEventsFiltrados.find(
      (event: any) => Number(event.entity_id) === Number(leadId)
    );
  }

  function leadDate(lead: KommoLead) {
    return lead.created_at
      ? new Date(lead.created_at * 1000).toLocaleDateString("pt-BR")
      : "—";
  }

  function vendaDate(lead: KommoLead) {
    const vendaEvent = getVendaEventByLeadId(Number(lead.id));

    return vendaEvent?.created_at
      ? new Date(vendaEvent.created_at * 1000).toLocaleString("pt-BR")
      : lead.updated_at
      ? new Date(lead.updated_at * 1000).toLocaleString("pt-BR")
      : leadDate(lead);
  }

  function agendadoDate(lead: KommoLead) {
    const agendadoEvent = getAgendadoEventByLeadId(Number(lead.id));

    return agendadoEvent?.created_at
      ? new Date(agendadoEvent.created_at * 1000).toLocaleString("pt-BR")
      : lead.updated_at
      ? new Date(lead.updated_at * 1000).toLocaleString("pt-BR")
      : leadDate(lead);
  }

  const porResponsavel: Record<
    string,
    {
      leads: KommoLead[];
      vendas: KommoLead[];
      agendamentos: KommoLead[];
      valor: number;
      naoCompareceu: KommoLead[];
    }
  > = {};

  for (const nome of ATENDENTES) {
    porResponsavel[nome] = {
      leads: [],
      vendas: [],
      agendamentos: [],
      valor: 0,
      naoCompareceu: [],
    };
  }

  for (const lead of leads) {
    const responsavel =
      getFieldValueById(lead, FIELD_IDS.RESPONSAVEL) || "Sem responsável";

    if (!porResponsavel[responsavel]) {
      porResponsavel[responsavel] = {
        leads: [],
        vendas: [],
        agendamentos: [],
        valor: 0,
        naoCompareceu: [],
      };
    }

    porResponsavel[responsavel].leads.push(lead);

    if (getFieldValueById(lead, FIELD_IDS.COMPARECEU) === "Não") {
      porResponsavel[responsavel].naoCompareceu.push(lead);
    }
  }

  for (const lead of vendas) {
    const responsavel =
      getFieldValueById(lead, FIELD_IDS.RESPONSAVEL) || "Sem responsável";

    if (!porResponsavel[responsavel]) {
      porResponsavel[responsavel] = {
        leads: [],
        vendas: [],
        agendamentos: [],
        valor: 0,
        naoCompareceu: [],
      };
    }

    porResponsavel[responsavel].vendas.push(lead);
    porResponsavel[responsavel].valor += Number(lead.price || 0);
  }

  for (const lead of agendados) {
    const responsavel =
      getFieldValueById(lead, FIELD_IDS.RESPONSAVEL) || "Sem responsável";

    if (!porResponsavel[responsavel]) {
      porResponsavel[responsavel] = {
        leads: [],
        vendas: [],
        agendamentos: [],
        valor: 0,
        naoCompareceu: [],
      };
    }

    porResponsavel[responsavel].agendamentos.push(lead);
  }

  function renderLeadBadges(lead: KommoLead) {
    const venda = vendas.some((item) => Number(item.id) === Number(lead.id));
    const agendado = agendados.some(
      (item) => Number(item.id) === Number(lead.id)
    );

    const comparecimento = getFieldValueById(lead, FIELD_IDS.COMPARECEU);
    const responsavel = getFieldValueById(lead, FIELD_IDS.RESPONSAVEL);

    return (
      <div className="flex flex-wrap gap-1">
        {responsavel && <Badge variant="outline">{responsavel}</Badge>}

        {agendado && <Badge className="bg-purple-600">Agendado</Badge>}

        {venda && <Badge className="bg-green-600">Venda realizada</Badge>}

        {comparecimento === "Sim" && (
          <Badge className="bg-blue-600">Compareceu</Badge>
        )}

        {comparecimento === "Não" && (
          <Badge variant="destructive">Não compareceu</Badge>
        )}

        {comparecimento === "Acompanhando" && (
          <Badge variant="secondary">Acompanhando</Badge>
        )}
      </div>
    );
  }

  function renderLeadList(
    list: KommoLead[],
    visible: number,
    mode: "lead" | "venda" | "agendado" = "lead"
  ) {
    return (
      <div className="space-y-2">
        {list.slice(0, visible).map((lead) => (
          <div
            key={lead.id}
            className="rounded-lg border bg-background p-3 flex flex-col gap-2"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-medium">{lead.name || `Lead #${lead.id}`}</p>
                <p className="text-xs text-muted-foreground">#{lead.id}</p>
              </div>

              {lead.price > 0 && (
                <p className="font-semibold text-green-600">
                  {formatCurrency(lead.price)}
                </p>
              )}
            </div>

            {renderLeadBadges(lead)}

            <p className="text-xs text-muted-foreground">
              {mode === "venda"
                ? `Venda: ${vendaDate(lead)}`
                : mode === "agendado"
                ? `Agendado: ${agendadoDate(lead)}`
                : leadDate(lead)}
            </p>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dash Euro</h1>
          <p className="text-muted-foreground">Euro Implantes — Kommo CRM</p>
        </div>

        <Button onClick={loadDashboard} disabled={isFetching} className="gap-2">
          {isFetching ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          Atualizar
        </Button>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-sm font-medium flex items-center gap-2">
                <CalendarDays className="h-4 w-4" />
                Filtro de período
              </p>
              <p className="text-xs text-muted-foreground">
                Padrão: últimos 7 dias.
              </p>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">De</label>
                <input
                  type="date"
                  value={dateFromInput}
                  disabled={allTime}
                  onChange={(e) => {
                    setDateFromInput(e.target.value);
                    setAllTime(false);
                    resetLists();
                  }}
                  className="h-9 rounded-md border bg-background px-3 text-sm"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">Até</label>
                <input
                  type="date"
                  value={dateToInput}
                  disabled={allTime}
                  onChange={(e) => {
                    setDateToInput(e.target.value);
                    setAllTime(false);
                    resetLists();
                  }}
                  className="h-9 rounded-md border bg-background px-3 text-sm"
                />
              </div>

              <Button variant="outline" onClick={aplicarUltimosSeteDias}>
                Últimos 7 dias
              </Button>

              <Button variant="outline" onClick={aplicarTodaExistencia}>
                Toda existência
              </Button>

              <Button onClick={loadDashboard}>Aplicar</Button>
            </div>
          </div>

          <div className="mt-3 text-sm text-muted-foreground">
            Período selecionado: <strong>{periodoLabel()}</strong>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <Card className="cursor-pointer" onClick={() => setLeadsOpen(!leadsOpen)}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="h-5 w-5" />
              Leads no período
            </CardTitle>
          </CardHeader>

          <CardContent>
            <p className="text-3xl font-bold">{leads.length}</p>
            <p className="text-sm text-muted-foreground">Leads criados</p>
          </CardContent>
        </Card>

        <Card
          className="cursor-pointer"
          onClick={() => setAgendadosOpen(!agendadosOpen)}
        >
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarDays className="h-5 w-5" />
              Agendados
            </CardTitle>
          </CardHeader>

          <CardContent>
            <p className="text-3xl font-bold">{agendados.length}</p>
            <p className="text-sm text-muted-foreground">
              Movidos para Agendado
            </p>
          </CardContent>
        </Card>

        <Card className="cursor-pointer" onClick={() => setVendasOpen(!vendasOpen)}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <DollarSign className="h-5 w-5" />
              Vendas
            </CardTitle>
          </CardHeader>

          <CardContent>
            <p className="text-3xl font-bold">{vendas.length}</p>
            <p className="text-sm text-green-600">
              {formatCurrency(totalVendasValor)}
            </p>
          </CardContent>
        </Card>

        <Card
          className="cursor-pointer"
          onClick={() => setNaoCompareceuOpen(!naoCompareceuOpen)}
        >
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <XCircle className="h-5 w-5" />
              Não compareceu
            </CardTitle>
          </CardHeader>

          <CardContent>
            <p className="text-3xl font-bold">{naoCompareceu.length}</p>
            <p className="text-sm text-muted-foreground">No período</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="h-5 w-5" />
              Conversão
            </CardTitle>
          </CardHeader>

          <CardContent>
            <p className="text-3xl font-bold">{taxaConversao}%</p>
            <p className="text-sm text-muted-foreground">
              {vendas.length} vendas de {leads.length} leads
            </p>
          </CardContent>
        </Card>
      </div>

      {leadsOpen && (
        <Card>
          <CardHeader>
            <CardTitle>
              Mostrando {Math.min(visibleLeads, leads.length)} de {leads.length}{" "}
              leads
            </CardTitle>
          </CardHeader>

          <CardContent className="space-y-4">
            {renderLeadList(leads, visibleLeads)}

            {visibleLeads < leads.length && (
              <Button
                variant="outline"
                onClick={() => setVisibleLeads((prev) => prev + 100)}
              >
                Ver mais
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {agendadosOpen && (
        <Card>
          <CardHeader>
            <CardTitle>
              Mostrando {Math.min(visibleAgendados, agendados.length)} de{" "}
              {agendados.length} agendamentos
            </CardTitle>
          </CardHeader>

          <CardContent className="space-y-4">
            {agendados.length > 0 ? (
              <>
                {renderLeadList(agendados, visibleAgendados, "agendado")}

                {visibleAgendados < agendados.length && (
                  <Button
                    variant="outline"
                    onClick={() => setVisibleAgendados((prev) => prev + 100)}
                  >
                    Ver mais
                  </Button>
                )}
              </>
            ) : (
              <p className="text-muted-foreground">
                Nenhum agendamento no período.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {vendasOpen && (
        <Card>
          <CardHeader>
            <CardTitle>
              Mostrando {Math.min(visibleVendas, vendas.length)} de{" "}
              {vendas.length} vendas
            </CardTitle>
          </CardHeader>

          <CardContent className="space-y-4">
            {vendas.length > 0 ? (
              <>
                {renderLeadList(vendas, visibleVendas, "venda")}

                {visibleVendas < vendas.length && (
                  <Button
                    variant="outline"
                    onClick={() => setVisibleVendas((prev) => prev + 100)}
                  >
                    Ver mais
                  </Button>
                )}
              </>
            ) : (
              <p className="text-muted-foreground">
                Nenhuma venda no período.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {naoCompareceuOpen && (
        <Card>
          <CardHeader>
            <CardTitle>
              Mostrando{" "}
              {Math.min(visibleNaoCompareceu, naoCompareceu.length)} de{" "}
              {naoCompareceu.length}
            </CardTitle>
          </CardHeader>

          <CardContent className="space-y-4">
            {naoCompareceu.length > 0 ? (
              <>
                {renderLeadList(naoCompareceu, visibleNaoCompareceu)}

                {visibleNaoCompareceu < naoCompareceu.length && (
                  <Button
                    variant="outline"
                    onClick={() =>
                      setVisibleNaoCompareceu((prev) => prev + 100)
                    }
                  >
                    Ver mais
                  </Button>
                )}
              </>
            ) : (
              <p className="text-muted-foreground">
                Nenhum lead marcado como “Não compareceu”.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserCheck className="h-5 w-5" />
            Performance por Atendente
          </CardTitle>

          <p className="text-sm text-muted-foreground">
            Leads, agendamentos, vendas e valor vendido por responsável
          </p>
        </CardHeader>

        <CardContent className="space-y-3">
          {Object.entries(porResponsavel)
            .filter(
              ([, dados]) =>
                dados.leads.length > 0 ||
                dados.vendas.length > 0 ||
                dados.agendamentos.length > 0
            )
            .map(([nome, dados]) => (
              <div key={nome} className="rounded-lg border p-4 space-y-3">
                <button
                  className="w-full flex items-center justify-between text-left"
                  onClick={() => {
                    setResponsavelOpen(
                      responsavelOpen === nome ? false : nome
                    );
                    setVisibleResponsavel(100);
                  }}
                >
                  <div>
                    <p className="font-semibold">{nome}</p>
                    <p className="text-sm text-muted-foreground">
                      {dados.leads.length} leads atribuídos
                    </p>
                  </div>

                  <ChevronDown className="h-4 w-4" />
                </button>

                <div className="grid grid-cols-4 gap-3 text-sm">
                  <div>
                    <p className="text-muted-foreground">Agendamentos</p>
                    <p className="font-semibold">
                      {dados.agendamentos.length}
                    </p>
                  </div>

                  <div>
                    <p className="text-muted-foreground">Vendas</p>
                    <p className="font-semibold">{dados.vendas.length}</p>
                  </div>

                  <div>
                    <p className="text-muted-foreground">Valor</p>
                    <p className="font-semibold">
                      {formatCurrency(dados.valor)}
                    </p>
                  </div>

                  <div>
                    <p className="text-muted-foreground">Faltas</p>
                    <p className="font-semibold">
                      {dados.naoCompareceu.length}
                    </p>
                  </div>
                </div>

                {responsavelOpen === nome && (
                  <div className="space-y-4 pt-3">
                    <div className="flex items-center gap-2 text-sm">
                      <CheckCircle className="h-4 w-4 text-green-600" />
                      {dados.leads.length} leads ·{" "}
                      {dados.agendamentos.length} agendamentos ·{" "}
                      {dados.vendas.length} vendas ·{" "}
                      {formatCurrency(dados.valor)}
                    </div>

                    {renderLeadList(dados.leads, visibleResponsavel)}

                    {visibleResponsavel < dados.leads.length && (
                      <Button
                        variant="outline"
                        onClick={() =>
                          setVisibleResponsavel((prev) => prev + 100)
                        }
                      >
                        Ver mais
                      </Button>
                    )}
                  </div>
                )}
              </div>
            ))}
        </CardContent>
      </Card>
    </div>
  );
}