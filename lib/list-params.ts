// Parâmetros de URL das listagens de cadastro: ?q=&situacao=&pagina=

import { type ListQuery, listQuerySchema } from "./validation/catalog";

type SearchParams = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export function parseListQuery(params: SearchParams): ListQuery {
  return listQuerySchema.parse({ q: first(params.q), page: first(params.pagina), status: first(params.situacao) });
}
