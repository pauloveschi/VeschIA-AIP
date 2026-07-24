import { createFileRoute, Outlet, Link, notFound } from "@tanstack/react-router";
import { useEmpresaBySlug, EmpresaProvider, isProdutoValido, produtoInfo } from "@/lib/empresa";

export const Route = createFileRoute("/$produto/$empresa")({
  loader: ({ params }) => {
    if (!isProdutoValido(params.produto)) throw notFound();
  },
  component: EmpresaLayout,
});

function EmpresaLayout() {
  const { produto, empresa: empresaSlug } = Route.useParams();
  const { data: empresa, isLoading, isError } = useEmpresaBySlug(empresaSlug);
  const produto_ = produto as import("@/lib/empresa").ProdutoSlug;

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
          <Link to="/" className="inline-flex mt-4 h-11 px-6 rounded-full bg-primary text-primary-foreground items-center text-sm">
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
      <Outlet />
    </EmpresaProvider>
  );
}
