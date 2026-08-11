import * as React from "react";
import { createFileRoute, Outlet, Link, useLocation, useMatchRoute, useNavigate, notFound } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  useEmpresaBySlug,
  EmpresaProvider,
  isProdutoValido,
  produtoInfo,
  useIsEmpresaAdmin,
  type Empresa,
  type ProdutoSlug,
} from "@/lib/empresa";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import {
  STATUS_SOLICITACAO,
  STATUS_CONTRATO,
  statusSolicitacaoMeta,
  statusContratoMeta,
  contarPorStatus,
} from "@/lib/status";
import { FileText, FileStack, Settings2, Mail, LogOut, Menu, X, ChevronDown } from "lucide-react";

export const Route = createFileRoute("/$produto/$empresa")({
  loader: ({ params }) => {
    if (!isProdutoValido(params.produto)) throw notFound();
  },
  component: EmpresaLayout,
});

function EmpresaLayout() {
  // Todos os hooks ficam aqui em cima, sem condição nenhuma antes deles.
  const { produto, empresa: empresaSlug } = Route.useParams();
  const { data: empresa, isLoading, isError } = useEmpresaBySlug(empresaSlug);
  const produto_ = produto as import("@/lib/empresa").ProdutoSlug;
  const matchRoute = useMatchRoute();

  // A tela de login (/$produto/$empresa/auth) sai antes de tudo, por dois motivos.
  // 1. Não pode aparecer com o menu atrás: ver Solicitações/Contratos/Sair sem ter entrado
  //    não é falha de segurança (nenhum item dá acesso sem sessão), mas passa a impressão
  //    errada de que dá.
  // 2. Não pode depender das validações de empresa abaixo: a leitura de `empresas_clientes`
  //    passa por RLS e só devolve linha pra quem já é membro autenticado, então o visitante
  //    deslogado cairia em "Empresa não encontrada" — a tela de login ficaria protegida por
  //    uma validação que exige login. Por isso ela renderiza mesmo com a empresa ausente.
  // A detecção usa o matcher do próprio router (contra o `to` tipado da rota), não uma
  // comparação de string de pathname na mão, e fica isolada neste único ponto.
  if (matchRoute({ to: "/$produto/$empresa/auth" })) {
    // Com empresa carregada (já logado, trocando de conta) o provider ainda é fornecido, pra
    // tela poder mostrar o nome; sem ela, renderiza puro — `useEmpresaOpcional` cobre os dois.
    return empresa ? (
      <EmpresaProvider empresa={empresa} produto={produto_}>
        <Outlet />
      </EmpresaProvider>
    ) : (
      <Outlet />
    );
  }

  if (isLoading) {
    return <div className="min-h-svh grid place-items-center text-muted-foreground">Carregando…</div>;
  }

  if (isError || !empresa) {
    return (
      <div className="min-h-svh grid place-items-center px-4 text-center">
        <div>
          <h1 className="text-2xl font-semibold">Empresa não encontrada</h1>
          <p className="text-sm text-muted-foreground mt-2">
            Verifique o link, ou se ainda não tem acesso, faça login com sua conta.
          </p>
          <Link to="/" className="inline-flex mt-4 h-11 px-6 rounded-full bg-confirmar text-confirmar-foreground items-center text-sm">
            Ir para o VeschIA AIP
          </Link>
        </div>
      </div>
    );
  }

  if (empresa.status !== "ativo" && empresa.status !== "trial") {
    return (
      <div className="min-h-svh grid place-items-center px-4 text-center">
        <div>
          <h1 className="text-2xl font-semibold">{empresa.nome}</h1>
          <p className="text-sm text-muted-foreground mt-2">Acesso temporariamente suspenso. Fale com o suporte.</p>
        </div>
      </div>
    );
  }

  return (
    <EmpresaProvider empresa={empresa} produto={produto_}>
      <AppShell produto={produto_} empresa={empresa}>
        <Outlet />
      </AppShell>
    </EmpresaProvider>
  );
}

const navItemClass = cn(
  "flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13.5px] text-primary-foreground/70 transition-colors",
  "hover:bg-white/5 hover:text-primary-foreground",
  "[&.active]:bg-white/10 [&.active]:font-medium [&.active]:text-primary-foreground",
);

/** Item de submenu: rótulo à esquerda, contador à direita. */
const subItemClass = cn(
  "flex items-center justify-between gap-2 rounded-lg pl-9 pr-3 py-1.5 text-[12.5px] text-primary-foreground/60 transition-colors",
  "hover:bg-white/5 hover:text-primary-foreground",
  "[&.active]:bg-white/10 [&.active]:font-medium [&.active]:text-primary-foreground",
);

/**
 * Contadores por status. Traz só a coluna `status` e conta no cliente, em vez de uma
 * consulta por status: é uma ida ao banco em lugar de nove, e a coluna é minúscula.
 * Quando a paginação entrar (o passo seguinte, pra volume grande), isso vira contagem
 * agregada no banco.
 */
function useContadores(empresaId: string, produto: string) {
  const solicitacoes = useQuery({
    queryKey: ["contagem-solicitacoes", empresaId, produto],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("solicitacoes")
        .select("status")
        .eq("empresa_id", empresaId)
        .eq("produto", produto);
      if (error) throw error;
      return contarPorStatus(data ?? [], STATUS_SOLICITACAO);
    },
  });

  const contratos = useQuery({
    queryKey: ["contagem-contratos", empresaId],
    queryFn: async () => {
      const { data, error } = await supabase.from("contratos").select("status").eq("empresa_id", empresaId);
      if (error) throw error;
      return contarPorStatus(data ?? [], STATUS_CONTRATO);
    },
  });

  const total = (c: Record<string, number> | undefined) =>
    c ? Object.values(c).reduce((soma, n) => soma + n, 0) : 0;

  return {
    solicitacoes: solicitacoes.data,
    contratos: contratos.data,
    totalSolicitacoes: total(solicitacoes.data),
    totalContratos: total(contratos.data),
  };
}

/** Cabeçalho de um grupo do menu: abre e fecha o submenu, sem navegar. */
function GrupoHeader({
  icone,
  rotulo,
  aberto,
  onToggle,
}: {
  icone: React.ReactNode;
  rotulo: string;
  aberto: boolean;
  onToggle: () => void;
}) {
  return (
    <button onClick={onToggle} aria-expanded={aberto} className={cn(navItemClass, "w-full text-left justify-between")}>
      <span className="flex items-center gap-2.5">
        {icone} {rotulo}
      </span>
      <ChevronDown className={cn("size-3.5 shrink-0 transition-transform", aberto && "rotate-180")} />
    </button>
  );
}

/** Conteúdo do menu lateral, compartilhado entre a versão fixa (desktop) e a gaveta (mobile). */
function SidebarContent({ produto, empresa, onNavigate }: { produto: ProdutoSlug; empresa: Empresa; onNavigate: () => void }) {
  const info = produtoInfo(produto)!;
  const { isAdmin } = useIsEmpresaAdmin();
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const matchRoute = useMatchRoute();
  const contadores = useContadores(empresa.id, produto);

  // O grupo da tela em que você já está nasce aberto, pra não obrigar a expandir de novo
  // a cada navegação. Depois disso, quem manda é o clique.
  const emContratos = !!matchRoute({ to: "/$produto/$empresa/contratos", fuzzy: true });
  const [abertoSolicitacoes, setAbertoSolicitacoes] = React.useState(!emContratos);
  const [abertoContratos, setAbertoContratos] = React.useState(emContratos);

  return (
    <div className="flex h-full flex-col text-primary-foreground" style={{ background: "var(--primary)" }}>
      <div className="px-4 py-5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: "var(--accent)" }}>
          {info.nome}
        </p>
        <p className="text-[15px] font-semibold mt-0.5 truncate">{empresa.nome}</p>
      </div>

      <nav className="flex-1 px-2 space-y-0.5 overflow-y-auto">
        <GrupoHeader
          icone={<FileText className="size-4 shrink-0" />}
          rotulo="Solicitações"
          aberto={abertoSolicitacoes}
          onToggle={() => setAbertoSolicitacoes((v) => !v)}
        />
        {abertoSolicitacoes && (
          <div className="space-y-0.5 pb-1">
            <Link
              to="/$produto/$empresa"
              params={{ produto, empresa: empresa.slug }}
              search={{ status: undefined, busca: undefined }}
              activeOptions={{ exact: true, includeSearch: true }}
              className={subItemClass}
              onClick={onNavigate}
            >
              <span>Todas</span>
              <span className="tabular-nums text-primary-foreground/50">{contadores.totalSolicitacoes}</span>
            </Link>
            {STATUS_SOLICITACAO.map((s) => (
              <Link
                key={s}
                to="/$produto/$empresa"
                params={{ produto, empresa: empresa.slug }}
                search={{ status: s, busca: undefined }}
                activeOptions={{ exact: true, includeSearch: true }}
                className={subItemClass}
                onClick={onNavigate}
              >
                <span>{statusSolicitacaoMeta[s].label}</span>
                <span className="tabular-nums text-primary-foreground/50">{contadores.solicitacoes?.[s] ?? 0}</span>
              </Link>
            ))}
          </div>
        )}

        <GrupoHeader
          icone={<FileStack className="size-4 shrink-0" />}
          rotulo="Contratos"
          aberto={abertoContratos}
          onToggle={() => setAbertoContratos((v) => !v)}
        />
        {abertoContratos && (
          <div className="space-y-0.5 pb-1">
            <Link
              to="/$produto/$empresa/contratos"
              params={{ produto, empresa: empresa.slug }}
              search={{ status: undefined, busca: undefined }}
              activeOptions={{ exact: true, includeSearch: true }}
              className={subItemClass}
              onClick={onNavigate}
            >
              <span>Todos</span>
              <span className="tabular-nums text-primary-foreground/50">{contadores.totalContratos}</span>
            </Link>
            {STATUS_CONTRATO.map((s) => (
              <Link
                key={s}
                to="/$produto/$empresa/contratos"
                params={{ produto, empresa: empresa.slug }}
                search={{ status: s, busca: undefined }}
                activeOptions={{ exact: true, includeSearch: true }}
                className={subItemClass}
                onClick={onNavigate}
              >
                <span>{statusContratoMeta[s].label}</span>
                <span className="tabular-nums text-primary-foreground/50">{contadores.contratos?.[s] ?? 0}</span>
              </Link>
            ))}
          </div>
        )}

        {isAdmin && (
          <Link
            to="/$produto/$empresa/configuracao"
            params={{ produto, empresa: empresa.slug }}
            className={navItemClass}
            onClick={onNavigate}
          >
            <Settings2 className="size-4 shrink-0" /> Configuração
          </Link>
        )}
      </nav>

      <div className="px-2 py-3 border-t border-white/10 space-y-0.5">
        <a href="mailto:veschipaulo@gmail.com" className={navItemClass}>
          <Mail className="size-4 shrink-0" /> Suporte
        </a>
        <button
          onClick={async () => {
            await signOut();
            navigate({ to: "/" });
          }}
          className={cn(navItemClass, "w-full text-left")}
        >
          <LogOut className="size-4 shrink-0" /> Sair
        </button>
      </div>
    </div>
  );
}

/** Casca do app: menu lateral fixo no desktop, gaveta no mobile. */
function AppShell({ produto, empresa, children }: { produto: ProdutoSlug; empresa: Empresa; children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const location = useLocation();

  // Fecha a gaveta sozinha sempre que a rota muda (inclusive voltar/avançar do navegador).
  React.useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  return (
    <div className="min-h-svh bg-background text-foreground">
      <aside className="hidden md:block fixed inset-y-0 left-0 w-56 z-20">
        <SidebarContent produto={produto} empresa={empresa} onNavigate={() => {}} />
      </aside>

      <div
        className="md:hidden sticky top-0 z-20 flex items-center gap-3 px-4 py-3 text-primary-foreground"
        style={{ background: "var(--primary)" }}
      >
        <button onClick={() => setOpen(true)} aria-label="Abrir menu" className="-ml-1 p-1">
          <Menu className="size-5" />
        </button>
        <span className="text-[14px] font-semibold truncate">{empresa.nome}</span>
      </div>

      {open && (
        <div className="md:hidden fixed inset-0 z-30">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-64 shadow-xl">
            <SidebarContent produto={produto} empresa={empresa} onNavigate={() => setOpen(false)} />
            <button
              onClick={() => setOpen(false)}
              aria-label="Fechar menu"
              className="absolute right-2 top-2 p-1 text-primary-foreground/70 hover:text-primary-foreground"
            >
              <X className="size-5" />
            </button>
          </aside>
        </div>
      )}

      <div className="md:pl-56">{children}</div>
    </div>
  );
}
