import * as React from "react";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { isProdutoValido, produtoInfo } from "@/lib/empresa";
import { GitBranch, Sparkles, Bell, ArrowLeft, Check, Clock } from "lucide-react";
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

function PreviewFluxo() {
  const etapas = [
    { nome: "Gestor", status: "done" },
    { nome: "SSMA", status: "current" },
    { nome: "Jurídico", status: "pending" },
    { nome: "Assinatura", status: "pending" },
  ];
  return (
    <div className="rounded-xl p-5" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
      <p className="text-[11px] uppercase tracking-wide mb-4" style={{ color: "var(--vs-text-muted)" }}>
        Solicitação #142 · Manutenção predial
      </p>
      <div className="flex items-center">
        {etapas.map((e, i) => (
          <React.Fragment key={e.nome}>
            <div className="flex flex-col items-center gap-1.5">
              <div
                className="size-8 rounded-full flex items-center justify-center"
                style={{
                  background: e.status === "done" ? "#15803D" : e.status === "current" ? "var(--vs-cyan)" : "rgba(255,255,255,0.06)",
                }}
              >
                {e.status === "done" ? (
                  <Check className="size-4 text-white" />
                ) : e.status === "current" ? (
                  <Clock className="size-4" style={{ color: "#04202B" }} />
                ) : (
                  <Clock className="size-4" style={{ color: "var(--vs-text-muted)" }} />
                )}
              </div>
              <span className="text-[11px]" style={{ color: e.status === "pending" ? "var(--vs-text-muted)" : undefined }}>{e.nome}</span>
            </div>
            {i < etapas.length - 1 && (
              <div className="flex-1 h-px mx-1" style={{ background: e.status === "done" ? "#15803D" : "rgba(255,255,255,0.12)" }} />
            )}
          </React.Fragment>
        ))}
      </div>
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
