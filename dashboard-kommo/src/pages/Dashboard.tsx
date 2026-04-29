import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { DateRange } from "react-day-picker";
import {
  AlertCircle,
  CalendarIcon,
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

import { fetchDashboardData, FIELD_IDS } from "@/lib/kommo-api";
import { isConnected } from "@/lib/kommo-storage";
import type { KommoLead } from "@/types/kommo";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

const ATENDENTES = ["Ana Paula", "Rayanne"];

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

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function endOfDay(date: Date) {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    23,
    59,
    59,
    999
  );
}

function toUnix(date: Date) {
  return Math.floor(date.getTime() / 1000);
}

function getCalendarLabel(dateRange: DateRange | undefined) {
  if (!dateRange?.from && !dateRange?.to) {
    return "Toda existência do CRM";
  }

  if (dateRange?.from && !dateRange?.to) {
    return format(dateRange.from, "dd/MM/yyyy", { locale: ptBR });
  }

  if (dateRange?.from && dateRange?.to) {
    return `${format(dateRange.from, "dd/MM/yyyy", {
      locale: ptBR,
    })} até ${format(dateRange.to, "dd/MM/yyyy", { locale: ptBR })}`;
  }

  return "Selecionar período";
}

export default function Dashboard() {
  const navigate = useNavigate();
  const connected = isConnected();

  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [leadsOpen, setLeadsOpen] = useState(false);
  const [vendasOpen, setVendasOpen] = useState(false);
  const [naoCompareceuOpen, setNaoCompareceuOpen] = useState(false);
  const [responsavelOpen, setResponsavelOpen] = useState<string | false>(false);

  const [visibleLeads, setVisibleLeads] = useState(100);
  const [visibleVendas, setVisibleVendas] = useState(100);
  const [visibleNaoCompareceu, setVisibleNaoCompareceu] = useState(100);
  const [visibleResponsavel, setVisibleResponsavel] = useState(100);

  const dateFrom = dateRange?.from ? toUnix(startOfDay(dateRange.from)) : 0;

  const dateTo = dateRange?.to
    ? toUnix(endOfDay(dateRange.to))
    : dateRange?.from
    ? toUnix(endOfDay(dateRange.from))
    : Math.floor(Date.now() / 1000);

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["dashboard-data", dateFrom, dateTo],
    queryFn: () =>
      fetchDashboardData({
        date_from: dateFrom,
        date_to: dateTo,
      }),
    enabled: connected,
    retry: 1,
    staleTime: 2 * 60 * 1000,
  });

  function resetLists() {
    setVisibleLeads(100);
    setVisibleVendas(100);
    setVisibleNaoCompareceu(100);
    setVisibleResponsavel(100);
    setLeadsOpen(false);
    setVendasOpen(false);
    setNaoCompareceuOpen(false);
    setResponsavelOpen(false);
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
            <p>{error instanceof Error ? error.message : "Erro"}</p>
            <Button onClick={() => refetch()} variant="outline">
              Tentar novamente
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!data) return null;

  const allLeads: KommoLead[] = data.leads ?? [];
  const vendaEvents = (data as any).vendaEvents ?? [];
  const vendaLeadsBackend = ((data as any).vendaLeads ?? []) as KommoLead[];

  function leadInSelectedPeriod(lead: KommoLead): boolean {
    if (!lead.created_at) return false;

    const createdAt = Number(lead.created_at);

    return createdAt >= dateFrom && createdAt <= dateTo;
  }

  function eventInSelectedPeriod(event: any): boolean {
    if (!event.created_at) return false;

    const eventAt = Number(event.created_at);

    return eventAt >= dateFrom && eventAt <= dateTo;
  }

  const leads = allLeads.filter(leadInSelectedPeriod);

  const vendaEventsFiltrados = vendaEvents.filter(eventInSelectedPeriod);

  const vendaLeadIds = new Set(
    vendaEventsFiltrados.map((event: any) => Number(event.entity_id))
  );

  const vendasPorEvento = allLeads.filter((lead) =>
    vendaLeadIds.has(Number(lead.id))
  );

  const vendas = vendasPorEvento.length > 0 ? vendasPorEvento : vendaLeadsBackend;

  const vendasUnicas = useMemo(() => {
    const map = new Map<number, KommoLead>();

    for (const lead of vendas) {
      map.set(Number(lead.id), lead);
    }

    return Array.from(map.values());
  }, [vendas]);

  const totalVendasValor = vendasUnicas.reduce(
    (acc, lead) => acc + Number(lead.price || 0),
    0
  );

  const naoCompareceu = leads.filter(
    (lead) => getFieldValueById(lead, FIELD_IDS.COMPARECEU) === "Não"
  );

  const taxaConversao =
    leads.length > 0
      ? Math.round((vendasUnicas.length / leads.length) * 100)
      : 0;

  function getVendaEventByLeadId(leadId: number) {
    return vendaEventsFiltrados.find(
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

  const porResponsavel: Record<
    string,
    {
      leads: KommoLead[];
      vendas: KommoLead[];
      valor: number;
      naoCompareceu: KommoLead[];
    }
  > = {};

  for (const nome of ATENDENTES) {
    porResponsavel[nome] = {
      leads: [],
      vendas: [],
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
        valor: 0,
        naoCompareceu: [],
      };
    }

    porResponsavel[responsavel].leads.push(lead);

    if (getFieldValueById(lead, FIELD_IDS.COMPARECEU) === "Não") {
      porResponsavel[responsavel].naoCompareceu.push(lead);
    }
  }

  for (const lead of vendasUnicas) {
    const responsavel =
      getFieldValueById(lead, FIELD_IDS.RESPONSAVEL) || "Sem responsável";

    if (!porResponsavel[responsavel]) {
      porResponsavel[responsavel] = {
        leads: [],
        vendas: [],
        valor: 0,
        naoCompareceu: [],
      };
    }

    porResponsavel[responsavel].vendas.push(lead);
    porResponsavel[responsavel].valor += Number(lead.price || 0);
  }

  function renderLeadBadges(lead: KommoLead) {
    const venda = vendasUnicas.some((item) => Number(item.id) === Number(lead.id));
    const comparecimento = getFieldValueById(lead, FIELD_IDS.COMPARECEU);
    const responsavel = getFieldValueById(lead, FIELD_IDS.RESPONSAVEL);

    return (
      <div className="flex flex-wrap gap-1">
        {responsavel && <Badge variant="outline">{responsavel}</Badge>}
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
    mode: "lead" | "venda" = "lead"
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
              {mode === "venda" ? `Venda: ${vendaDate(lead)}` : leadDate(lead)}
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

        <div className="flex flex-col sm:flex-row gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="justify-start gap-2">
                <CalendarIcon className="h-4 w-4" />
                {getCalendarLabel(dateRange)}
              </Button>
            </PopoverTrigger>

            <PopoverContent className="w-auto p-3" align="end">
              <Calendar
                mode="range"
                selected={dateRange}
                onSelect={(range) => {
                  setDateRange(range);
                  resetLists();
                }}
                numberOfMonths={2}
                locale={ptBR}
                initialFocus
              />

              <div className="flex justify-between gap-2 pt-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setDateRange(undefined);
                    resetLists();
                  }}
                >
                  Toda existência
                </Button>

                <Button size="sm" onClick={() => refetch()}>
                  Aplicar
                </Button>
              </div>
            </PopoverContent>
          </Popover>

          <Button
            onClick={() => refetch()}
            disabled={isFetching}
            className="gap-2"
          >
            {isFetching ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Atualizar
          </Button>
        </div>
      </div>

      <div className="text-sm text-muted-foreground">
        Período selecionado: <strong>{getCalendarLabel(dateRange)}</strong>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card
          className="cursor-pointer"
          onClick={() => {
            setLeadsOpen(!leadsOpen);
            setVendasOpen(false);
            setNaoCompareceuOpen(false);
            setVisibleLeads(100);
          }}
        >
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="h-5 w-5" />
              Leads no período
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{leads.length}</p>
            <p className="text-sm text-muted-foreground">
              Leads criados conforme calendário
            </p>
          </CardContent>
        </Card>

        <Card
          className="cursor-pointer"
          onClick={() => {
            setVendasOpen(!vendasOpen);
            setLeadsOpen(false);
            setNaoCompareceuOpen(false);
            setVisibleVendas(100);
          }}
        >
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <DollarSign className="h-5 w-5" />
              Vendas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{vendasUnicas.length}</p>
            <p className="text-sm text-green-600">
              {formatCurrency(totalVendasValor)}
            </p>
          </CardContent>
        </Card>

        <Card
          className="cursor-pointer"
          onClick={() => {
            setNaoCompareceuOpen(!naoCompareceuOpen);
            setLeadsOpen(false);
            setVendasOpen(false);
            setVisibleNaoCompareceu(100);
          }}
        >
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <XCircle className="h-5 w-5" />
              Não compareceu
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{naoCompareceu.length}</p>
            <p className="text-sm text-muted-foreground">
              No período selecionado
            </p>
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
              {vendasUnicas.length} vendas de {leads.length} leads
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
                Ver mais ({Math.min(100, leads.length - visibleLeads)} leads)
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {vendasOpen && (
        <Card>
          <CardHeader>
            <CardTitle>
              Mostrando {Math.min(visibleVendas, vendasUnicas.length)} de{" "}
              {vendasUnicas.length} vendas
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {vendasUnicas.length > 0 ? (
              <>
                {renderLeadList(vendasUnicas, visibleVendas, "venda")}

                {visibleVendas < vendasUnicas.length && (
                  <Button
                    variant="outline"
                    onClick={() => setVisibleVendas((prev) => prev + 100)}
                  >
                    Ver mais (
                    {Math.min(100, vendasUnicas.length - visibleVendas)} vendas)
                  </Button>
                )}
              </>
            ) : (
              <p className="text-muted-foreground">
                Nenhuma venda no período selecionado.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {naoCompareceuOpen && (
        <Card>
          <CardHeader>
            <CardTitle>
              Mostrando {Math.min(visibleNaoCompareceu, naoCompareceu.length)}{" "}
              de {naoCompareceu.length} leads que não compareceram
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
                    Ver mais (
                    {Math.min(
                      100,
                      naoCompareceu.length - visibleNaoCompareceu
                    )}{" "}
                    leads)
                  </Button>
                )}
              </>
            ) : (
              <p className="text-muted-foreground">
                Nenhum lead marcado como “Não compareceu” no período.
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
            Leads, vendas e valor vendido por responsável
          </p>
        </CardHeader>

        <CardContent className="space-y-3">
          {Object.entries(porResponsavel)
            .filter(
              ([, dados]) =>
                dados.leads.length > 0 || dados.vendas.length > 0
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

                <div className="grid grid-cols-3 gap-3 text-sm">
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
                      {dados.leads.length} leads · {dados.vendas.length} vendas
                      · {formatCurrency(dados.valor)}
                    </div>

                    {renderLeadList(dados.leads, visibleResponsavel)}

                    {visibleResponsavel < dados.leads.length && (
                      <Button
                        variant="outline"
                        onClick={() =>
                          setVisibleResponsavel((prev) => prev + 100)
                        }
                      >
                        Ver mais (
                        {Math.min(
                          100,
                          dados.leads.length - visibleResponsavel
                        )}{" "}
                        leads)
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