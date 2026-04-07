<template>
  <div class="privacy-container">
    <div class="privacy-card">
      <h1>Política de Privacidad - CdeluAR</h1>
      <div class="privacy-content">
        <p><strong>Última actualización:</strong> April 2026</p>
        
        <h2>1. Información que recopilamos</h2>
        <p>Utilizamos Firebase Authentication para gestionar tu inicio de sesión a través de cuentas de Google. No almacenamos datos sensibles privados fuera del ámbito de funcionamiento de la aplicación.</p>

        <h2>2. Uso de la información</h2>
        <p>Tus datos básicos (nombre y perfil público) se utilizan exclusivamente para identificarte dentro de la plataforma y personalizar tu experiencia.</p>

        <h2>3. Seguridad</h2>
        <p>Toda la información es gestionada mediante servicios de Google Firebase, garantizando altos estándares de seguridad y encriptación.</p>

        <h2>4. Contacto</h2>
        <p>Si tienes dudas sobre tus datos, puedes contactarnos a través de nuestra plataforma oficial.</p>
        
        <router-link to="/" class="back-link">Volver al inicio</router-link>
      </div>
    </div>
  </div>
</template>

<style scoped>
.privacy-container {
  min-height: 100vh;
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 2rem;
  background: var(--bg);
  transition: background 0.3s ease;
}

.privacy-card {
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

.privacy-content p {
  opacity: 0.8;
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
