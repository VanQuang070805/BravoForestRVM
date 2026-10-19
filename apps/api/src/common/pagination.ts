import { DataSource } from 'typeorm';

export interface PageOptions {
  page: number;
  pageSize: number;
}

export function pageOptions(page?: string, pageSize?: string): PageOptions {
  const parsedPage = page && /^\d{1,8}$/.test(page) ? Number(page) : 1;
  const parsedSize = pageSize && /^\d{1,3}$/.test(pageSize) ? Number(pageSize) : 20;
  return {
    page: Math.max(1, parsedPage),
    pageSize: Math.min(100, Math.max(1, parsedSize)),
  };
}

export async function pagedQuery<T>(
  db: DataSource,
  query: string,
  countQuery: string,
  params: unknown[],
  options: PageOptions,
) {
  const offset = (options.page - 1) * options.pageSize;
  const [items, countRows] = await Promise.all([
    db.query(`${query} LIMIT ? OFFSET ?`, [...params, options.pageSize, offset]),
    db.query(countQuery, params),
  ]);
  const total = Number(countRows[0]?.total ?? 0);
  return {
    items: items as T[],
    total,
    page: options.page,
    pageSize: options.pageSize,
    totalPages: Math.ceil(total / options.pageSize),
  };
}
