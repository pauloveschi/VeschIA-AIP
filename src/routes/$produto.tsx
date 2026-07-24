import { createFileRoute, Outlet, notFound } from "@tanstack/react-router";
import { isProdutoValido } from "@/lib/empresa";

export const Route = createFileRoute("/$produto")({
  loader: ({ params }) => {
    if (!isProdutoValido(params.produto)) throw notFound();
  },
  component: () => <Outlet />,
});
