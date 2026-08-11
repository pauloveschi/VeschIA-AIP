import * as React from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { useEmpresa } from "@/lib/empresa";
import { Button } from "@/components/ui/button";
import { ChevronLeft, Sparkles, FileText, Download } from "lucide-react";

export const Route = createFileRoute("/$produto/$empresa/contrato/$id")({
  component: ContratoPage,
});

const inputSchema = z.object({ solicitacaoId: z.string() });










const gerarMinutaContrato = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => inputSchema.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { gerarMinuta } = await import("@/minuta.server");
    const { avancarFluxo } = await import("@/motor.server");

    const { texto, caminho } = await gerarMinuta(supabaseAdmin, data.solicitacaoId);

    // Depois de gerar, deixa o motor seguir o fluxo (fechar a etapa e avisar quem aprova).
    await avancarFluxo(supabaseAdmin, data.solicitacaoId);

    const { data: signed } = await supabaseAdmin.storage.from("documentos").createSignedUrl(caminho, 60 * 60);
    return { texto, url: signed?.signedUrl ?? null, caminho };
  });

const buscarMinutaExistente = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => inputSchema.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: doc } = await supabaseAdmin
      .from("documentos")
      .select("id, nome_arquivo, url, uploaded_at")
      .eq("solicitacao_id", data.solicitacaoId)
      .eq("tipo", "minuta_contrato")
      .order("uploaded_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!doc) return null;

    const { data: signed } = await supabaseAdmin.storage.from("documentos").createSignedUrl(doc.url, 60 * 60);
    return { nomeArquivo: doc.nome_arquivo, url: signed?.signedUrl ?? null, uploadedAt: doc.uploaded_at };
  });

function useMinutaExistente(solicitacaoId: string) {
  return useQuery({
    queryKey: ["minuta-contrato", solicitacaoId],
    queryFn: async () => buscarMinutaExistente({ data: { solicitacaoId } }),
  });
}

function ContratoPage() {
  const { produto, empresa: empresaSlug, id } = Route.useParams();
  useEmpresa();
  const qc = useQueryClient();
  const { data: minuta, isLoading } = useMinutaExistente(id);
  const [textoGerado, setTextoGerado] = React.useState<string | null>(null);
  const [erro, setErro] = React.useState<string | null>(null);

  const gerarMut = useMutation({
    mutationFn: async () => gerarMinutaContrato({ data: { solicitacaoId: id } }),
    onSuccess: (res) => {
      setTextoGerado(res.texto);
      setErro(null);
      qc.invalidateQueries({ queryKey: ["minuta-contrato", id] });
      qc.invalidateQueries({ queryKey: ["etapas-execucao", id] });
    },
    onError: (e: Error) => setErro(e.message),
  });

  return (
    <div className="min-h-svh bg-background text-foreground">
      <header style={{ background: "var(--primary)" }}>
        <div className="max-w-3xl mx-auto px-5 py-3.5">
          <Link
            to="/$produto/$empresa/solicitacoes/$id"
            params={{ produto, empresa: empresaSlug, id }}
            className="text-[13px] flex items-center gap-1 text-primary-foreground/70 hover:text-primary-foreground w-fit"
          >
            <ChevronLeft className="size-3.5" /> Voltar pra solicitação
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-5 py-6 space-y-4">
        <h1 className="text-xl font-semibold">Elaboração do Contrato</h1>
        <p className="text-sm text-muted-foreground">
          Gera a minuta do contrato com IA, a partir dos dados da empresa escolhida na Negociação Comercial. Essa é uma
          primeira versão simples do PDF (sem a formatação do modelo Word ainda); o texto pode ser revisado antes da
          Validação Jurídica.
        </p>

        <Button
          className="h-9 px-4 text-sm" variant="confirmar"
          disabled={gerarMut.isPending}
          onClick={() => gerarMut.mutate()}
        >
          <Sparkles className="size-4 mr-1.5" />
          {gerarMut.isPending ? "Gerando com IA…" : minuta ? "Gerar nova versão" : "Gerar minuta com IA"}
        </Button>

        {erro && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-[13px] text-destructive">
            {erro}
          </div>
        )}

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : minuta?.url ? (
          <div className="rounded-xl border border-border bg-card p-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <FileText className="size-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">{minuta.nomeArquivo}</p>
                <p className="text-[12px] text-muted-foreground">
                  Gerado em {new Date(minuta.uploadedAt ?? "").toLocaleString("pt-BR")}
                </p>
              </div>
            </div>
            <a href={minuta.url} target="_blank" rel="noreferrer">
              <Button size="sm" variant="outline" className="h-8">
                <Download className="size-3.5 mr-1" /> Baixar PDF
              </Button>
            </a>
          </div>
        ) : (
          !gerarMut.isPending && <p className="text-sm text-muted-foreground">Nenhuma minuta gerada ainda.</p>
        )}

        {textoGerado && (
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-[12px] text-muted-foreground mb-2">Prévia do texto gerado:</p>
            <pre className="text-[12.5px] whitespace-pre-wrap font-sans leading-relaxed">{textoGerado}</pre>
          </div>
        )}
      </main>
    </div>
  );
}
