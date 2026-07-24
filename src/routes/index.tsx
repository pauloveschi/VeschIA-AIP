import { Link, createFileRoute } from "@tanstack/react-router";
import { PRODUTOS } from "@/lib/empresa";
import { FileText, Users, Coins, ShoppingCart, Scale, Target } from "lucide-react";
import logo from "@/assets/logo.png";

export const Route = createFileRoute("/")({
  component: LandingPage,
});

const ICONS: Record<string, React.ComponentType<{ className?: string; style?: React.CSSProperties }>> = {
  aiprocont: FileText,
  aiprorh: Users,
  aiprofin: Coins,
  aiprocomp: ShoppingCart,
  aiprojur: Scale,
  aiprocomer: Target,
};

function LandingPage() {
  return (
    <div className="veschia-shell px-6 py-16">
      <div className="max-w-3xl mx-auto text-center">
        <img src={logo} alt="VeschIA" className="h-14 mx-auto mb-6 drop-shadow-[0_0_24px_rgba(44,167,201,0.35)]" />
        <h1 className="text-3xl md:text-4xl font-semibold mt-2">Automação Inteligente de Processos</h1>
        <p className="mt-4 text-sm md:text-base max-w-xl mx-auto" style={{ color: "var(--vs-text-muted)" }}>
          Seis soluções, um só motor: fluxo de aprovação configurável, prazo e indicador
          automáticos, e IA analisando documento em cada etapa.
        </p>
      </div>


      <div className="max-w-4xl mx-auto mt-14 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {PRODUTOS.map((p) => {
          const Icon = ICONS[p.slug];
          const disponivel = p.slug === "aiprocont";
          const cardInner = (
            <>
              <div
                className="h-9 w-9 rounded-lg flex items-center justify-center mb-3"
                style={{ background: "rgba(44,167,201,0.15)" }}
              >
                <Icon className="size-4" style={{ color: "var(--vs-cyan)" }} />
              </div>
              <p className="font-semibold text-sm">{p.nome}</p>
              <p className="text-xs mt-0.5" style={{ color: "var(--vs-text-muted)" }}>{p.processo}</p>
              {!disponivel && (
                <p className="text-[10px] mt-2 uppercase tracking-wide" style={{ color: "var(--vs-text-muted)" }}>
                  Em breve
                </p>
              )}
            </>
          );
          const cardStyle: React.CSSProperties = {
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.18)",
            opacity: disponivel ? 1 : 0.5,
          };
          if (disponivel) {
            return (
              <Link key={p.slug} to="/$produto" params={{ produto: p.slug }} className="rounded-2xl p-5 text-left transition-colors" style={cardStyle}>
                {cardInner}
              </Link>
            );
          }
          return (
            <div key={p.slug} className="rounded-2xl p-5 text-left" style={cardStyle}>
              {cardInner}
            </div>
          );
        })}
      </div>
    </div>
  );
}
