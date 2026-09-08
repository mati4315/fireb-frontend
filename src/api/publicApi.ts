export interface PublicNews {
  id: string
  type: 'news'
  title: string
  slug: string
  summary: string
  content: string
  canonical_url: string
  published_at: string
  updated_at: string
  category: { id: string; name: string } | null
  images: Array<{ url: string; alt: string | null }>
}

interface PublicNewsResponse {
  data: PublicNews[]
  pagination: {
    limit: number
    next_cursor: string | null
    has_next: boolean
  }
}

interface PublicNewsDetailResponse {
  data: PublicNews
}

const API_BASE_URL = (
  import.meta.env.VITE_PUBLIC_API_BASE_URL ||
  'https://us-central1-cdeluar-ddefc.cloudfunctions.net/publicApi/api/v1'
).replace(/\/$/, '')

const fetchJson = async <T>(path: string, signal?: AbortSignal): Promise<T> => {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    signal
  })
  if (!response.ok) {
    throw new Error(`Public API error: ${response.status}`)
  }
  return response.json() as Promise<T>
}

const encodeQuery = (params: Record<string, string | number | undefined>): string => {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') query.set(key, String(value))
  }
  const serialized = query.toString()
  return serialized ? `?${serialized}` : ''
}

export const listPublicNews = async (options: {
  limit?: number
  cursor?: string | null
  category?: string
  signal?: AbortSignal
} = {}): Promise<PublicNewsResponse> => fetchJson<PublicNewsResponse>(
  `/news${encodeQuery({
    limit: options.limit || 10,
    cursor: options.cursor || undefined,
    category: options.category
  })}`,
  options.signal
)

export const getPublicNews = async (id: string, signal?: AbortSignal): Promise<PublicNews> => {
  const response = await fetchJson<PublicNewsDetailResponse>(
    `/news/${encodeURIComponent(id)}`,
    signal
  )
  return response.data
}

export const publicNewsToFeedItem = (news: PublicNews): Record<string, unknown> => {
  const canonicalParts = news.canonical_url.split('/').filter(Boolean)
  const publicId = canonicalParts.at(-2) || news.id
  const imagesV2 = news.images.map((image) => ({
    url: image.url,
    thumbUrl: image.url,
    alt: image.alt || undefined,
    width: 16,
    height: 9
  }))

  return {
    id: news.id,
    type: 'news',
    module: 'news',
    source: 'admin',
    isOficial: true,
    titulo: news.title,
    descripcion: news.content || news.summary,
    summary: news.summary,
    slug: news.slug,
    publicId,
    postId: publicId,
    category: news.category,
    imagesV2,
    images: imagesV2.map((image) => image.url),
    createdAt: news.published_at,
    publishedAt: news.published_at,
    updatedAt: news.updated_at,
    deletedAt: null,
    stats: { likesCount: 0, commentsCount: 0, viewsCount: 0 },
    canonicalUrl: news.canonical_url,
    provenance: news
  }
}
