-- A rota guarda a política de comprovante do momento em que foi iniciada (decisão do dono do produto).
-- AlterTable
ALTER TABLE "Route" ADD COLUMN     "proofPolicy" "ProofPolicy";

