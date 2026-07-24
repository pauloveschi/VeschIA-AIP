import * as React from "react";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { isProdutoValido, produtoInfo } from "@/lib/empresa";
import { GitBranch, Sparkles, Bell, ArrowLeft, Check } from "lucide-react";
import logo from "@/assets/logo.png";

export const Route = createFileRoute("/$produto")({
  loader: ({ params }) => {
    if (!isProdutoValido(params.produto)) throw notFound();
  },
  component: ProdutoSalesPage,
});

const FEATURES = [
  { icon: GitBranch, title: "Fluxo configurável", desc: "Cada empresa define suas próprias etapas de aprovação." },
  { icon: Sparkles, title: "IA documental", desc: "Lê os documentos do processo e participa da decisão." },
  { icon: Bell, title: "Prazo e indicador", desc: "SLA e KPI monitorados automaticamente, por processo ou por cliente." },
];

const WHATSAPP_VENDAS = "5531981023577";

function FluxoExemplo({
  rotulo,
  areas,
  etapas,
}: {
  rotulo: string;
  areas: string;
  etapas: string[];
}) {
  const [ativo, setAtivo] = React.useState(0);

  React.useEffect(() => {
    const id = setInterval(() => {
      setAtivo((prev) => (prev + 1) % etapas.length);
    }, 1100);
    return () => clearInterval(id);
  }, [etapas.length]);

  return (
    <div className="rounded-xl p-5" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
      <p className="text-[10px] uppercase tracking-[0.16em] font-semibold" style={{ color: "var(--vs-cyan)" }}>{rotulo}</p>
      <p className="text-[11px] mt-0.5 mb-4" style={{ color: "var(--vs-text-muted)" }}>Atende: {areas}</p>
      <div className="flex items-center overflow-x-auto no-scrollbar py-2">
        {etapas.map((nome, i) => {
          const isLast = i === etapas.length - 1;
          const isPast = i < ativo;
          const isCurrent = i === ativo;
          const lineFilled = i < ativo;
          return (
            <React.Fragment key={nome}>
              <div className="flex flex-col items-center gap-1.5 shrink-0" style={{ minWidth: 56 }}>
                <div
                  className="size-7 rounded-full flex items-center justify-center text-[10px] font-semibold shrink-0 transition-all duration-500"
                  style={{
                    background: isPast || (isLast && isCurrent) ? "#15803D" : isCurrent ? "#EDB111" : "rgba(255,255,255,0.08)",
                    color: isPast || isCurrent ? "#fff" : "var(--vs-text-muted)",
                    boxShadow: isCurrent ? "0 0 0 4px rgba(237,177,17,0.25)" : "none",
                    transform: isCurrent ? "scale(1.1)" : "scale(1)",
                  }}
                >
                  {isPast || (isLast && isCurrent) ? <Check className="size-3.5" /> : i + 1}
                </div>
                <span
                  className="text-[10px] text-center leading-tight transition-colors duration-500"
                  style={{ color: isCurrent ? "#fff" : isPast ? undefined : "var(--vs-text-muted)" }}
                >
                  {nome}
                </span>
              </div>
              {!isLast && (
                <div className="h-px w-4 shrink-0 mx-0.5 mb-5 relative overflow-hidden" style={{ background: "rgba(255,255,255,0.15)" }}>
                  <div
                    className="absolute inset-y-0 left-0 transition-all duration-500"
                    style={{ width: lineFilled ? "100%" : "0%", background: "#15803D" }}
                  />
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}

function PreviewFluxo() {
  return (
    <div className="space-y-3">
      <FluxoExemplo
        rotulo="Modelo Setorial Profissional"
        areas="Industrial, Engenharia, Facilities, Prestação de Serviços, Imobiliário, Saúde, Energia, Agronegócio, Logística"
        etapas={["Suprimentos", "Gestor", "SSMA", "Assinatura", "Execução", "Monitoramento", "Encerramento"]}
      />
      <FluxoExemplo
        rotulo="Modelo Empresarial Padrão"
        areas="TI, Marketing, Consultoria, Startups, Escolas, Clínicas, Tecnologia, Eventos"
        etapas={["Solicitação", "Análise", "Assinatura", "Execução", "Monitoramento", "Encerramento"]}
      />
    </div>
  );
}

function ProdutoSalesPage() {
  const { produto } = Route.useParams();
  const info = produtoInfo(produto)!;
  const mensagem = `Olá! Gostaria de solicitar uma demonstração do ${info.nome} (VeschIA).`;

  return (
    <div className="veschia-shell px-6 py-16">
      <div className="max-w-2xl mx-auto">
        <Link to="/" className="inline-flex items-center gap-1.5 text-xs mb-6" style={{ color: "var(--vs-text-muted)" }}>
          <ArrowLeft className="size-3.5" /> Voltar
        </Link>

        <img src={logo} alt="VeschIA" className="h-10 mb-4 drop-shadow-[0_0_20px_rgba(44,167,201,0.3)]" />
        <h1 className="text-3xl font-semibold mt-1">{info.nome}</h1>
        <p className="mt-2 text-sm max-w-lg" style={{ color: "var(--vs-text-muted)" }}>
          Automação inteligente de processos de {info.processo.toLowerCase()}: da solicitação
          à conclusão, com aprovação configurável e IA analisando documento em cada etapa.
        </p>

        <div className="grid sm:grid-cols-3 gap-3 mt-8">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-xl p-4" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
              <f.icon className="size-5" style={{ color: "var(--vs-cyan)" }} />
              <p className="text-sm font-medium mt-2">{f.title}</p>
              <p className="text-xs mt-1" style={{ color: "var(--vs-text-muted)" }}>{f.desc}</p>
            </div>
          ))}
        </div>

        <div className="mt-6">
          <PreviewFluxo />
        </div>

        <div
          className="mt-6 rounded-xl p-5 flex items-center justify-center"
          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)" }}
        >
          <a
            href={`https://wa.me/${WHATSAPP_VENDAS}?text=${encodeURIComponent(mensagem)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="h-11 px-6 rounded-full text-sm font-medium flex items-center"
            style={{ background: "var(--vs-cyan)", color: "#04202B" }}
          >
            Solicitar demonstração
          </a>
        </div>

        <p className="text-xs mt-6" style={{ color: "var(--vs-text-muted)" }}>
          Já é cliente? Acesse pelo link direto da sua empresa (<Link to="/$produto/$empresa" params={{ produto, empresa: "sua-empresa" }} className="underline">/{produto}/sua-empresa</Link>).
        </p>
      </div>
    </div>
  );
}
