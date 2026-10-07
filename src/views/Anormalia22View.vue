<script setup lang="ts">
const episodeUrl = 'https://www.facebook.com/share/v/1DLWqekGJN/'
const embedUrl = 'https://www.facebook.com/plugins/video.php?height=476&href=https%3A%2F%2Fwww.facebook.com%2Freel%2F1785259016013838%2F&show_text=false&width=267&t=0'
</script>

<template>
  <main class="anormalia-page">
    <section class="show-hero" aria-labelledby="show-title">
      <div class="hero-orbit hero-orbit-one" aria-hidden="true"></div>
      <div class="hero-orbit hero-orbit-two" aria-hidden="true"></div>
      <div class="hero-copy">
        <p class="eyebrow"><span class="eyebrow-dot"></span> PROGRAMAS · PODCASTS · IDEAS</p>
        <h1 id="show-title">Anormalia <span>22</span></h1>
        <p class="hero-description">Un espacio para todos esos programas que merecen ser escuchados.</p>
        <a class="hero-link" href="#episodios">Explorar episodios <span aria-hidden="true">↓</span></a>
      </div>
      <div class="hero-artwork">
        <img
          src="/images/anormalia-22-programa-2.jpg"
          alt="Portada de Anormalia 22, Temporada 2"
          fetchpriority="high"
        >
        <span class="artwork-tag">TEMPORADA 2 · PROGRAMA 2</span>
      </div>
      <span class="hero-index" aria-hidden="true">CDELU / ORIGINALS</span>
    </section>

    <section id="episodios" class="episodes-section" aria-labelledby="episodes-title">
      <header class="section-heading">
        <div>
          <p class="section-kicker">EL ARCHIVO</p>
          <h2 id="episodes-title">Programas</h2>
        </div>
        <span class="episode-count">01 EPISODIO</span>
      </header>

      <article class="episode-card">
        <div class="episode-info">
          <div class="episode-number"><span>EP.</span> 02</div>
          <p class="episode-label">ANORMALIA 22</p>
          <h3>Programa N.º 2</h3>
          <p class="episode-description">Mira el programa completo. El reproductor puede requerir que Facebook esté disponible en tu navegador.</p>
          <a class="watch-link" :href="episodeUrl" target="_blank" rel="noopener noreferrer">
            <span class="play-icon" aria-hidden="true">▶</span>
            Ver en Facebook
            <span class="external-icon" aria-hidden="true">↗</span>
          </a>
        </div>

        <div class="video-frame">
          <div class="video-topline">
            <span><i></i> REPRODUCIENDO EN FACEBOOK</span>
            <span>02 / 22</span>
          </div>
          <iframe
            :src="embedUrl"
            title="Anormalia 22, Programa N.º 2 en Facebook"
            width="267"
            height="476"
            style="border: none; overflow: hidden"
            scrolling="no"
            frameborder="0"
            allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share"
            allowfullscreen="true"
            loading="lazy"
          ></iframe>
        </div>
      </article>
    </section>
  </main>
</template>

<style scoped>
.anormalia-page {
  --anormalia-ink: #15191d;
  --anormalia-lime: #d2f36b;
  --anormalia-orange: #ff7654;
  width: min(1120px, 100%);
  margin: 0 auto;
  padding: clamp(1rem, 4vw, 2.5rem) clamp(0.75rem, 3vw, 1.5rem) 4rem;
  color: var(--text-h);
}

.show-hero {
  min-height: 360px;
  position: relative;
  isolation: isolate;
  display: flex;
  align-items: center;
  overflow: hidden;
  padding: clamp(2rem, 7vw, 5rem);
  border-radius: 28px;
  color: #f6f7ef;
  background:
    radial-gradient(ellipse at 80% 10%, rgba(210, 243, 107, 0.18), transparent 34%),
    radial-gradient(ellipse at 90% 100%, rgba(255, 118, 84, 0.18), transparent 35%),
    linear-gradient(125deg, #111619 0%, #202a2a 56%, #293229 100%);
  box-shadow: 0 24px 65px rgba(15, 24, 20, 0.2);
}

.hero-copy {
  max-width: 650px;
  position: relative;
  z-index: 2;
}

.eyebrow,
.section-kicker,
.episode-label {
  font-size: 0.7rem;
  font-weight: 800;
  letter-spacing: 0.16em;
}

.eyebrow {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  margin: 0 0 1.5rem;
  color: #dce4d5;
}

.eyebrow-dot,
.video-topline i {
  width: 8px;
  height: 8px;
  flex: 0 0 auto;
  border-radius: 50%;
  background: var(--anormalia-lime);
  box-shadow: 0 0 14px rgba(210, 243, 107, 0.8);
}

.show-hero h1 {
  margin: 0;
  font-size: clamp(3.3rem, 10vw, 7.4rem);
  font-weight: 900;
  letter-spacing: -0.085em;
  line-height: 0.88;
}

.show-hero h1 span {
  color: var(--anormalia-lime);
}

.hero-description {
  max-width: 420px;
  margin: 1.4rem 0 1.5rem;
  color: rgba(246, 247, 239, 0.75);
  font-size: clamp(0.95rem, 2vw, 1.1rem);
  line-height: 1.6;
}

.hero-link {
  display: inline-flex;
  align-items: center;
  gap: 0.65rem;
  color: var(--anormalia-lime);
  font-size: 0.9rem;
  font-weight: 800;
  text-decoration: none;
}

.hero-link:hover {
  color: #fff;
}

.hero-artwork {
  position: absolute;
  right: 7%;
  top: 50%;
  z-index: 1;
  width: min(38%, 410px);
  aspect-ratio: 4 / 3;
  overflow: hidden;
  transform: translateY(-50%) rotate(2deg);
  border: 1px solid rgba(246, 247, 239, 0.42);
  border-radius: 18px;
  background: #101b49;
  box-shadow: 0 24px 55px rgba(0, 0, 0, 0.42), 0 0 0 7px rgba(246, 247, 239, 0.06);
}

.hero-artwork::after {
  content: '';
  position: absolute;
  inset: 45% 0 0;
  background: linear-gradient(transparent, rgba(7, 12, 27, 0.72));
}

.hero-artwork img {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;
}

.artwork-tag {
  position: absolute;
  right: 0.75rem;
  bottom: 0.75rem;
  z-index: 1;
  color: #fff;
  font-size: 0.58rem;
  font-weight: 900;
  letter-spacing: 0.11em;
  text-shadow: 0 1px 8px rgba(0, 0, 0, 0.65);
}

.hero-orbit {
  position: absolute;
  z-index: -1;
  border: 1px solid rgba(246, 247, 239, 0.08);
  border-radius: 50%;
}

.hero-orbit-one {
  width: 520px;
  height: 520px;
  top: -290px;
  right: 20%;
}

.hero-orbit-two {
  width: 380px;
  height: 380px;
  right: -130px;
  bottom: -285px;
}

.hero-index {
  position: absolute;
  right: 1.5rem;
  bottom: 1.25rem;
  color: rgba(246, 247, 239, 0.45);
  font-size: 0.58rem;
  font-weight: 800;
  letter-spacing: 0.16em;
}

.episodes-section {
  padding: clamp(2.5rem, 6vw, 4.5rem) 0 0;
}

.section-heading {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1.25rem;
}

.section-kicker {
  margin: 0 0 0.35rem;
  color: var(--anormalia-orange);
}

.section-heading h2 {
  margin: 0;
  color: var(--text-h);
  font-size: clamp(1.7rem, 4vw, 2.5rem);
  letter-spacing: -0.055em;
}

.episode-count {
  padding-bottom: 0.3rem;
  color: var(--text);
  font-size: 0.66rem;
  font-weight: 800;
  letter-spacing: 0.12em;
}

.episode-card {
  display: grid;
  grid-template-columns: minmax(220px, 0.8fr) minmax(280px, 1fr);
  gap: clamp(1.5rem, 5vw, 4rem);
  align-items: center;
  padding: clamp(1.25rem, 4vw, 2.5rem);
  border: 1px solid var(--border);
  border-radius: 22px;
  background: var(--card-bg);
  box-shadow: 0 12px 36px rgba(20, 35, 55, 0.06);
}

.episode-info {
  padding: 0.5rem;
}

.episode-number {
  color: var(--text-h);
  font-size: clamp(3.8rem, 8vw, 6.5rem);
  font-weight: 900;
  letter-spacing: -0.09em;
  line-height: 0.9;
}

.episode-number span {
  display: block;
  margin: 0 0 0.7rem 0.3rem;
  color: var(--anormalia-orange);
  font-size: 0.7rem;
  letter-spacing: 0.16em;
}

.episode-label {
  margin: 1.5rem 0 0.5rem;
  color: var(--text);
}

.episode-info h3 {
  margin: 0;
  color: var(--text-h);
  font-size: clamp(1.35rem, 3vw, 2rem);
  letter-spacing: -0.04em;
}

.episode-description {
  max-width: 360px;
  margin: 0.75rem 0 1.5rem;
  color: var(--text);
  line-height: 1.6;
}

.watch-link {
  min-height: 48px;
  display: inline-flex;
  align-items: center;
  gap: 0.7rem;
  padding: 0.7rem 1rem;
  border-radius: 999px;
  background: var(--anormalia-ink);
  color: #fff;
  font-size: 0.88rem;
  font-weight: 800;
  text-decoration: none;
  transition: transform 160ms ease, background 160ms ease;
}

.watch-link:hover {
  transform: translateY(-2px);
  background: #303b3a;
}

.play-icon {
  color: var(--anormalia-lime);
  font-size: 0.75rem;
}

.external-icon {
  color: var(--anormalia-lime);
}

.video-frame {
  width: min(100%, 460px);
  justify-self: center;
  overflow: hidden;
  border-radius: 16px;
  background: #101313;
  box-shadow: 0 18px 45px rgba(10, 16, 14, 0.18);
}

.video-topline {
  min-height: 38px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0 0.75rem;
  color: rgba(246, 247, 239, 0.7);
  font-size: 0.54rem;
  font-weight: 800;
  letter-spacing: 0.08em;
}

.video-topline > span:first-child {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
}

.video-topline i {
  width: 6px;
  height: 6px;
}

.video-frame iframe {
  display: block;
  width: 100%;
  aspect-ratio: 9 / 16;
  height: auto;
  background: #101313;
}

@media (max-width: 680px) {
  .show-hero {
    min-height: 390px;
    align-items: start;
    padding: 2rem 1.35rem 3.4rem;
    border-radius: 20px;
  }

  .show-hero h1 {
    font-size: clamp(3.5rem, 18vw, 6rem);
  }

  .hero-description {
    max-width: 290px;
  }

  .hero-artwork {
    top: auto;
    right: 1.3rem;
    bottom: 3.3rem;
    width: min(47%, 190px);
    transform: rotate(2deg);
  }

  .artwork-tag {
    right: 0.45rem;
    bottom: 0.45rem;
    font-size: 0.42rem;
  }

  .hero-index {
    right: auto;
    left: 1.4rem;
    bottom: 1.2rem;
  }

  .episode-card {
    grid-template-columns: 1fr;
    gap: 1.5rem;
    padding: 1rem;
    border-radius: 18px;
  }

  .episode-info {
    padding: 0.5rem;
  }

  .episode-number {
    font-size: 4.5rem;
  }

  .video-frame {
    width: min(100%, 380px);
  }
}

@media (prefers-reduced-motion: reduce) {
  .watch-link {
    transition: none;
  }
}
</style>
