import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { isProdutoValido, produtoInfo } from "@/lib/empresa";
import { GitBranch, Sparkles, Bell } from "lucide-react";

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

function ProdutoSalesPage() {
  const { produto } = Route.useParams();
  const info = produtoInfo(produto)!;

  return (
    <div className="veschia-shell px-6 py-16">
      <div className="max-w-2xl mx-auto">
        <p className="text-[11px] uppercase tracking-[0.2em]" style={{ color: "var(--vs-cyan)" }}>VeschIA</p>
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

        <div
          className="mt-8 rounded-xl p-5 flex items-center justify-between gap-4"
          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)" }}
        >
          <div>
            <p className="text-xs" style={{ color: "var(--vs-text-muted)" }}>A partir de</p>
            <p className="text-xl font-semibold">R$ 2.000<span className="text-xs font-normal" style={{ color: "var(--vs-text-muted)" }}>/mês</span></p>
          </div>
          <a
            href="https://wa.me/5585999999999"
            target="_blank"
            rel="noopener noreferrer"
            className="h-10 px-5 rounded-full text-sm font-medium flex items-center"
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
