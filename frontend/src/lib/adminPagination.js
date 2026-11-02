export function paginateRows(rows = [], requestedPage = 1, pageSize = 10) {
  const size = Math.max(1, Math.floor(pageSize) || 10);
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const page = Math.min(pages, Math.max(1, Math.floor(requestedPage) || 1));
  const offset = (page - 1) * size;
  return { rows: rows.slice(offset, offset + size), page, pages, total: rows.length, start: rows.length ? offset + 1 : 0, end: Math.min(offset + size, rows.length) };
}
