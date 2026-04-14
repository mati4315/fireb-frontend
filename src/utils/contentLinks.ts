export type ContentModuleKey = 'news' | 'community';

const MAX_SLUG_LENGTH = 96;

export const toDetailBasePath = (module: ContentModuleKey): string =>
  module === 'news' ? '/noticia' : '/c';

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
  id: string,
  slug: string
): string => {
  const safeId = encodeURIComponent(id);
  const safeSlug = encodeURIComponent(normalizeContentSlug(slug));
  return `${toDetailBasePath(module)}/${safeId}/${safeSlug}`;
};

export const buildContentDetailPath = (
  module: ContentModuleKey,
  item: { id: string; slug?: string; titulo?: string }
): string => {
  const fallbackSlug = item.titulo || item.id || 'contenido';
  return buildContentDetailPathByValues(module, item.id, item.slug || fallbackSlug);
};
