/** HTML de ejemplo para pruebas (sitios ficticios: solo sirven para verificar la extracción). */

export const BASIC_CLINIC_HOME = `<!doctype html>
<html lang="es"><head>
<meta charset="utf-8"><title>Clínica Dental Sonrisa | Odontología en Salta</title>
<meta name="description" content="Implantes, ortodoncia y blanqueamiento en Salta. Más de 15 años cuidando tu sonrisa.">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="WordPress 6.4">
<link rel="stylesheet" href="/wp-content/themes/dental/style.css">
<script async src="https://www.googletagmanager.com/gtag/js?id=G-ABC123XYZ"></script>
</head><body class="elementor-page">
<header><nav><a href="/">Inicio</a> <a href="/servicios">Servicios</a> <a href="/contacto">Contacto</a></nav></header>
<main>
<h1>Tu sonrisa, en las mejores manos</h1>
<p>En Clínica Dental Sonrisa ofrecemos tratamientos de implantología, ortodoncia invisible, blanqueamiento y odontopediatría con tecnología digital. Nuestro equipo de especialistas te acompaña en cada paso, desde el diagnóstico hasta el seguimiento posterior. Atendemos de lunes a viernes de 9 a 20 horas y los sábados por la mañana. Llamanos al +54 387 422 1234 o escribinos a info@clinicasonrisa.example para consultar disponibilidad.</p>
<p>Contamos con convenios con las principales obras sociales y financiación en cuotas sin interés para todos los tratamientos. Cada paciente recibe un plan personalizado, con presupuesto cerrado y por escrito antes de empezar. Además trabajamos con radiografía digital y escáner intraoral para reducir las molestias y los tiempos de tratamiento en cada visita.</p>
<a class="btn" href="/contacto">Contactanos</a>
</main>
<footer>
<a href="https://www.facebook.com/clinicasonrisa">Facebook</a>
<a href="https://www.instagram.com/clinicasonrisa/">Instagram</a>
<a href="https://www.facebook.com/sharer/sharer.php?u=x">Compartir</a>
<p>© 2018 Clínica Dental Sonrisa</p>
</footer>
</body></html>`;

export const BASIC_CLINIC_CONTACT = `<!doctype html><html lang="es"><head><title>Contacto - Clínica Dental Sonrisa</title>
<meta name="viewport" content="width=device-width, initial-scale=1"></head><body>
<h1>Contacto</h1>
<form action="/enviar" method="post">
<input name="nombre" required><input type="email" name="email" required><input type="tel" name="telefono" required>
<input name="dni"><input name="ciudad"><input name="obra_social"><input name="asunto"><textarea name="mensaje"></textarea>
<input type="checkbox" name="acepto"><input type="submit" value="Enviar">
</form>
<p>Av. Belgrano 123, Salta</p></body></html>`;

export const FULL_FEATURED_HOME = `<!doctype html>
<html lang="es"><head><title>Dental Plus Salta - Reservá tu turno online</title>
<meta name="description" content="Turnos online, urgencias y tratamientos para toda la familia.">
<meta name="viewport" content="width=device-width, initial-scale=1">
<script async src="https://www.googletagmanager.com/gtag/js?id=G-ZZZ111"></script>
<script src="//code.tidio.co/abcdef.js"></script>
<script>!function(f,b,e,v){fbq('init','123456')}(window)</script>
<script src="https://connect.facebook.net/en_US/fbevents.js"></script>
<script src="https://js.hs-scripts.com/12345.js"></script>
</head><body>
<h1>Cuidamos tu salud dental</h1>
<p>Somos una clínica con 20 años de experiencia. Reservá tu turno online en un minuto, elegí profesional y horario, y recibí recordatorios por WhatsApp. Trabajamos con implantes, ortodoncia, estética dental y urgencias las 24 horas. Atendemos obras sociales y prepagas. Más de cinco mil pacientes confían en nosotros cada año en toda la ciudad de Salta y alrededores.</p>
<a href="https://wa.me/5493874221234?text=Hola">Escribinos por WhatsApp</a>
<a href="tel:+543874221234">Llamar ahora</a>
<a href="https://calendly.com/dentalplus/consulta">Reservar turno online</a>
<form action="/lead"><input name="nombre"><input type="email" name="email"><select name="servicio"><option>Implantes</option></select><textarea name="msg"></textarea><button>Pedir presupuesto</button></form>
<a href="https://www.instagram.com/dentalplus">IG</a>
<p>© 2026 Dental Plus</p>
</body></html>`;

export const NO_VIEWPORT_HTTP_HOME = `<html><head><title>Odontología Pérez</title></head><body>
<h1>Odontología Pérez</h1><p>Consultorio odontológico. Turnos al 4223344.</p></body></html>`;

export const SPA_SHELL = `<!doctype html><html lang="es"><head><title>Estética Bella</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<script src="/a.js"></script><script src="/b.js"></script><script src="/c.js"></script><script src="/d.js"></script><script src="/e.js"></script><script src="/f.js"></script>
</head><body><div id="root"></div></body></html>`;
