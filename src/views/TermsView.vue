<template>
  <div class="terms-container">
    <div class="terms-card">
      <h1>Términos del Servicio - CdeluAR</h1>
      <div class="terms-content">
        <p><strong>Última actualización:</strong> April 2026</p>
        
        <h2>1. Aceptación de los términos</h2>
        <p>Al acceder a CdeluAR, aceptas cumplir con nuestras normas de comunidad y el uso responsable de la plataforma.</p>

        <h2>2. Propiedad del contenido</h2>
        <p>Los usuarios son responsables del contenido que comparten. CdeluAR se reserva el derecho de moderar o eliminar contenido inapropiado.</p>

        <h2>3. Uso de la plataforma</h2>
        <p>Queda prohibido el spam, el acoso o cualquier actividad ilegal que comprometa la integridad de otros usuarios o del sitio.</p>

        <router-link to="/" class="back-link">Volver al inicio</router-link>
      </div>
    </div>
  </div>
</template>

<style scoped>
.terms-container {
  min-height: 100vh;
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 2rem;
  background: var(--bg);
  transition: background 0.3s ease;
}

.terms-card {
  max-width: 800px;
  background: var(--card-bg);
  backdrop-filter: blur(10px);
  padding: 3rem;
  border-radius: 20px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.1);
  color: var(--text);
  line-height: 1.6;
}

h1 {
  color: var(--primary);
  margin-bottom: 2rem;
}

h2 {
  margin-top: 2rem;
  font-size: 1.25rem;
}

.back-link {
  display: inline-block;
  margin-top: 3rem;
  color: var(--primary);
  text-decoration: none;
  font-weight: 600;
}

.back-link:hover {
  text-decoration: underline;
}
</style>
