// Importado ANTES de qualquer outro módulo do seed: em produção ele para aqui, antes de ler
// variáveis de ambiente ou abrir conexão com o banco.

if (process.env.VERCEL_ENV === "production") {
  console.error("\nFalha no seed: o seed de demonstração não roda em produção (VERCEL_ENV=production).");
  process.exit(1);
}
