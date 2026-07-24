import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./auth";

export const PRODUTOS = [
  { slug: "aiprocont", nome: "AIProCont", processo: "Contratos" },
  { slug: "aiprorh", nome: "AIProRH", processo: "Recursos Humanos" },
  { slug: "aiprofin", nome: "AIProFin", processo: "Financeiro" },
  { slug: "aiprocomp", nome: "AIProComp", processo: "Compras" },
  { slug: "aiprojur", nome: "AIProJur", processo: "Jurídico" },
  { slug: "aiprocomer", nome: "AIProComer", processo: "Comercial" },
] as const;

export type ProdutoSlug = (typeof PRODUTOS)[number]["slug"];

export function isProdutoValido(slug: string): slug is ProdutoSlug {
  return PRODUTOS.some((p) => p.slug === slug);
}

export function produtoInfo(slug: string) {
  return PRODUTOS.find((p) => p.slug === slug);
}

export interface Empresa {
  id: string;
  slug: string;
  nome: string;
  cnpj: string | null;
  status: "trial" | "ativo" | "suspenso" | "cancelado";
}

/** Busca uma empresa cliente pelo slug da URL. Só membros conseguem ler (RLS). */
export function useEmpresaBySlug(slug: string) {
  return useQuery({
    queryKey: ["empresa", slug],
    queryFn: async (): Promise<Empresa | null> => {
      const { data, error } = await supabase
        .from("empresas_clientes")
        .select("*")
        .eq("slug", slug)
        .maybeSingle();
      if (error) throw error;
      return data as Empresa | null;
    },
  });
}

const EmpresaCtx = React.createContext<Empresa | null>(null);
const ProdutoCtx = React.createContext<ProdutoSlug | null>(null);

export function EmpresaProvider({
  empresa,
  produto,
  children,
}: {
  empresa: Empresa;
  produto: ProdutoSlug;
  children: React.ReactNode;
}) {
  return (
    <EmpresaCtx.Provider value={empresa}>
      <ProdutoCtx.Provider value={produto}>{children}</ProdutoCtx.Provider>
    </EmpresaCtx.Provider>
  );
}

export function useEmpresa(): Empresa {
  const ctx = React.useContext(EmpresaCtx);
  if (!ctx) throw new Error("useEmpresa precisa ser usado dentro de uma rota /$produto/$empresa");
  return ctx;
}

export function useProdutoAtual(): ProdutoSlug {
  const ctx = React.useContext(ProdutoCtx);
  if (!ctx) throw new Error("useProdutoAtual precisa ser usado dentro de uma rota /$produto/$empresa");
  return ctx;
}

export type EmpresaRole = "owner" | "admin" | "staff";

/** Papel do usuário logado dentro da empresa atual (null = não é membro). */
export function useMyEmpresaRole() {
  const empresa = useEmpresa();
  const { user, loading } = useAuth();
  return useQuery({
    queryKey: ["my-empresa-role", empresa.id, user?.id],
    enabled: !!user && !loading,
    queryFn: async (): Promise<EmpresaRole | null> => {
      const { data, error } = await supabase
        .from("membros")
        .select("role")
        .eq("empresa_id", empresa.id)
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return (data?.role as EmpresaRole | undefined) ?? null;
    },
  });
}

export function useIsEmpresaAdmin() {
  const { data: role, isLoading } = useMyEmpresaRole();
  return { isAdmin: role === "owner" || role === "admin", isLoading };
}

export function useIsEmpresaStaff() {
  const { data: role, isLoading } = useMyEmpresaRole();
  return { isStaff: role === "owner" || role === "admin" || role === "staff", isLoading };
}

/** Confirma se a empresa realmente comprou o produto atual (entitlement). */
export function useProdutoContratado() {
  const empresa = useEmpresa();
  const produto = useProdutoAtual();
  return useQuery({
    queryKey: ["produto-contratado", empresa.id, produto],
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await supabase
        .from("empresa_produtos")
        .select("ativo")
        .eq("empresa_id", empresa.id)
        .eq("produto", produto)
        .eq("ativo", true)
        .maybeSingle();
      if (error) throw error;
      return !!data;
    },
  });
}
