-- Endereço do depósito da empresa: ponto de partida do link de rota no Google Maps
-- (seção 5.6; decisão do dono do produto). Todos opcionais.
-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "depotCity" TEXT,
ADD COLUMN     "depotComplement" TEXT,
ADD COLUMN     "depotLatitude" DOUBLE PRECISION,
ADD COLUMN     "depotLongitude" DOUBLE PRECISION,
ADD COLUMN     "depotNeighborhood" TEXT,
ADD COLUMN     "depotNumber" TEXT,
ADD COLUMN     "depotState" CHAR(2),
ADD COLUMN     "depotStreet" TEXT,
ADD COLUMN     "depotZipCode" TEXT;

