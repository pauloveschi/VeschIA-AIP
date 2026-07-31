import { createFileRoute } from "@tanstack/react-router";

/**
 * Endereço chamado pelo agendador do Vercel uma vez por dia.
 *
 * Protegido por CRON_SECRET: sem o cabeçalho certo, responde 401. Isso evita que
 * qualquer um dispare a rotina de fora (que manda e-mail e movimenta contrato).
 */
export const Route = createFileRoute("/api/rotina-diaria")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const segredo = process.env.CRON_SECRET;

        if (!segredo) {
          return new Response(JSON.stringify({ erro: "CRON_SECRET não configurada no servidor." }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }

        const autorizacao = request.headers.get("authorization");
        if (autorizacao !== `Bearer ${segredo}`) {
          return new Response(JSON.stringify({ erro: "Não autorizado." }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }

        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { rodarRotinaDiaria } = await import("@/rotina.server");
          const resultado = await rodarRotinaDiaria(supabaseAdmin);

          return new Response(JSON.stringify({ ok: true, ...resultado }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        } catch (e) {
          return new Response(JSON.stringify({ ok: false, erro: (e as Error).message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
