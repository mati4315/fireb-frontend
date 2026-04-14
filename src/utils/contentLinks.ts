export type ContentModuleKey = 'news' | 'community';

const MAX_SLUG_LENGTH = 96;

export const toDetailBasePath = (module: ContentModuleKey): string =>
  module === 'news' ? '/noticia' : '/c';

const normalizeScalarNewsPublicRef = (value: unknown): string => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const normalized = Math.floor(value);
    return normalized > 0 ? String(normalized) : '';
  }

  if (typeof value === 'string') {
    const raw = value.trim().replace(/^id:?/i, '');
    if (!/^\d+$/.test(raw)) return '';
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return '';
    const normalized = Math.floor(parsed);
    return normalized > 0 ? String(normalized) : '';
  }

  return '';
};

export const normalizeNewsPublicRef = (value: unknown): string => {
  const queue: unknown[] = [value];

  while (queue.length > 0) {
    const candidate = queue.shift();
    const normalized = normalizeScalarNewsPublicRef(candidate);
    if (normalized) return normalized;

    if (Array.isArray(candidate)) {
      queue.push(...candidate);
      continue;
    }

    if (candidate && typeof candidate === 'object') {
      const record = candidate as Record<string, unknown>;
      queue.push(
        record.publicId,
        record.postId,
        record.postID,
        record.id,
        record.value,
        record.rendered
      );
    }
  }

  return '';
};

export const normalizeContentSlug = (value: string): string => {
  const normalized = value
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-');

  const trimmed = normalized.slice(0, MAX_SLUG_LENGTH).replace(/-+$/g, '');
  return trimmed || 'contenido';
};

export const buildContentDetailPathByValues = (
  module: ContentModuleKey,
  refId: string,
  slug: string
): string => {
  const safeId = encodeURIComponent(refId);
  const safeSlug = encodeURIComponent(normalizeContentSlug(slug));
  return `${toDetailBasePath(module)}/${safeId}/${safeSlug}`;
};

export const buildContentDetailPath = (
  module: ContentModuleKey,
  item: {
    id: string;
    slug?: string;
    titulo?: string;
    publicId?: string | number | null;
    postId?: string | number | null;
    custom_fields?: Record<string, unknown> | null;
  }
): string | null => {
  const fallbackSlug = item.titulo || String(item.id || 'contenido');

  if (module === 'news') {
    const newsRefRaw =
      normalizeNewsPublicRef(item.publicId) ||
      normalizeNewsPublicRef(item.postId) ||
      normalizeNewsPublicRef(item.custom_fields) ||
      item.id;
    return buildContentDetailPathByValues(
      module,
      newsRefRaw,
      item.slug || fallbackSlug
    );
  }

  return buildContentDetailPathByValues(module, item.id, item.slug || fallbackSlug);
};
