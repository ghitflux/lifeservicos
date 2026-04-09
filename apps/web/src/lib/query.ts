// apps/web/src/lib/query.ts
export type Filters = {
  page?: number;
  page_size?: number;
  order?: string;
  q?: string;
  status?: string[];          // multi-seleção
  entidade?: string;          // filtro por entidade
  banco?: string;             // filtro por banco (alias para entidade)
  cargo?: string;             // filtro por cargo
  mine?: boolean;             // esteira individual
  assigned?: '0' | '1';       // '0' = não atribuídos, '1' = atribuídos
  exclude_siape?: boolean;    // excluir casos SIAPE/GOV
};

export function buildCasesQuery(
  f: Filters,
  opts?: { role?: string; scope?: 'global' | 'mine' | 'other' }
) {
  const p = new URLSearchParams();
  const set = (k: string, v: string | number | boolean | undefined | null) => {
    if (v === undefined || v === null) return;
    if (typeof v === 'string' && v.trim() === '') return;
    p.set(k, String(v));
  };

  // paginação/ordenação
  set('page', f.page ?? 1);
  set('page_size', f.page_size ?? 50);
  set('order', f.order ?? 'financiamentos_desc');

  // busca digitada
  if (f.q && f.q.trim()) set('q', f.q.trim());

  // status (CSV)
  if (Array.isArray(f.status) && f.status.length > 0) {
    set('status', f.status.join(','));
  }

  // entidade ou banco (banco é um alias para entidade)
  if (f.entidade) set('entidade', f.entidade);
  if (f.banco) set('entidade', f.banco);

  // cargo
  if (f.cargo) set('cargo', f.cargo);

  // mine/assigned conforme necessidade
  if (f.mine) set('mine', 'true');
  if (f.assigned) set('assigned', f.assigned);

  // excluir SIAPE/GOV
  if (f.exclude_siape) set('exclude_siape', 'true');

  return p;
}
