const STORAGE_API = 'liq_api_base';
const STORAGE_TOKEN = 'liq_token';
const STORAGE_USUARIO = 'liq_usuario';

const vistaLogin = document.getElementById('vista-login');
const vistaApp = document.getElementById('vista-app');
const inputUrl = document.getElementById('input-url');
const inputUsuario = document.getElementById('input-usuario');
const inputContrasena = document.getElementById('input-contrasena');
const btnLogin = document.getElementById('btn-login');
const loginError = document.getElementById('login-error');
const infoSesion = document.getElementById('info-sesion');
const btnSalir = document.getElementById('btn-salir');

const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const listaArchivos = document.getElementById('lista-archivos');
const btnProcesar = document.getElementById('btn-procesar');
const btnLimpiar = document.getElementById('btn-limpiar');
const toggleAuto = document.getElementById('toggle-auto');
const progreso = document.getElementById('progreso');
const barraInner = document.getElementById('barra-inner');
const progresoTexto = document.getElementById('progreso-texto');
const resultado = document.getElementById('resultado');

let archivosSeleccionados = [];
let procesando = false;
let temporizadorAuto = null;

function apiBase() {
    const base = localStorage.getItem(STORAGE_API) || '';
    return base ? base.replace(/\/+$/, '') : '';
}

function token() {
    return localStorage.getItem(STORAGE_TOKEN) || '';
}

function cabeceras() {
    return {
        'Authorization': `Bearer ${token()}`,
        'ngrok-skip-browser-warning': 'true',
    };
}

async function llamar(path, opciones = {}) {
    const opcionesFinales = { ...opciones };
    if (!opcionesFinales.headers) opcionesFinales.headers = cabeceras();
    const resp = await fetch(`${apiBase()}${path}`, opcionesFinales);
    let data = null;
    try { data = await resp.json(); } catch (e) { data = null; }
    return { resp, data };
}

// --- Gestión de sesión ---
function mostrarLogin() {
    vistaApp.hidden = true;
    vistaLogin.hidden = false;
    inputUrl.value = apiBase() || '';
    inputUsuario.value = localStorage.getItem(STORAGE_USUARIO) || '';
    inputContrasena.value = '';
    loginError.hidden = true;
    inputUsuario.focus();
}

function mostrarApp() {
    vistaLogin.hidden = true;
    vistaApp.hidden = false;
    infoSesion.textContent = `Sesión: ${localStorage.getItem(STORAGE_USUARIO) || 'usuario'}`;
}

function cerrarSesion() {
    localStorage.removeItem(STORAGE_TOKEN);
    localStorage.removeItem(STORAGE_USUARIO);
    mostrarLogin();
}

if (token()) {
    mostrarApp();
} else {
    mostrarLogin();
}

btnLogin.addEventListener('click', async () => {
    const url = inputUrl.value.trim();
    const usuario = inputUsuario.value.trim();
    const contrasena = inputContrasena.value;
    loginError.hidden = true;
    btnLogin.disabled = true;

    if (!url) {
        loginError.textContent = 'Ingresa la URL del servidor (la de ngrok, ej: https://xxxx.ngrok-free.app).';
        loginError.hidden = false;
        btnLogin.disabled = false;
        return;
    }

    const base = url.replace(/\/+$/, '').replace(/^http:\/\//, 'https://');

    try {
        const resp = await fetch(`${base}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
            body: JSON.stringify({ usuario, contrasena }),
        });
        let data = null;
        try { data = await resp.json(); } catch (e) { data = null; }
        if (!data || !data.ok) {
            loginError.textContent = data && data.error
                ? data.error
                : `El servidor respondió (${resp.status}) pero no es la URL correcta. Verifica que pegaste la URL completa de ngrok.`;
            loginError.hidden = false;
            return;
        }
        localStorage.setItem(STORAGE_API, url);
        localStorage.setItem(STORAGE_TOKEN, data.token);
        localStorage.setItem(STORAGE_USUARIO, usuario);
        mostrarApp();
    } catch (e) {
        loginError.textContent = `No se pudo conectar con "${base}". Verifica que ngrok esté corriendo en la máquina y que la URL sea exacta.`;
        loginError.hidden = false;
    } finally {
        btnLogin.disabled = false;
    }
});

btnSalir.addEventListener('click', cerrarSesion);

inputContrasena.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') btnLogin.click();
});

// --- Lista de archivos ---
function renderizarLista() {
    listaArchivos.innerHTML = '';
    archivosSeleccionados.forEach((f, i) => {
        const li = document.createElement('li');
        const tam = (f.size / 1024).toFixed(1);
        li.innerHTML = `<span>${f.name}</span><small>${tam} KB</small>
                        <button type="button" data-idx="${i}" class="quitar" title="Quitar">&times;</button>`;
        listaArchivos.appendChild(li);
    });
    const hayPdfs = archivosSeleccionados.some(f => f.name.toLowerCase().endsWith('.pdf'));
    btnProcesar.disabled = !hayPdfs || procesando;
    btnLimpiar.disabled = archivosSeleccionados.length === 0 || procesando;
    if (!procesando) resultado.hidden = true;
}

dropZone.addEventListener('click', () => fileInput.click());

dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('arrastrando');
});

dropZone.addEventListener('dragleave', () => dropZone.classList.remove('arrastrando'));

dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('arrastrando');
    agregarArchivos(e.dataTransfer.files);
});

fileInput.addEventListener('change', () => {
    agregarArchivos(fileInput.files);
    fileInput.value = '';
});

function agregarArchivos(lista) {
    let agregados = 0;
    for (const f of lista) {
        if (f.name.toLowerCase().endsWith('.pdf') &&
            !archivosSeleccionados.some(a => a.name === f.name)) {
            archivosSeleccionados.push(f);
            agregados++;
        }
    }
    if (agregados > 0) {
        renderizarLista();
        programarAutomatico();
    }
}

listaArchivos.addEventListener('click', (e) => {
    const btn = e.target.closest('.quitar');
    if (!btn) return;
    archivosSeleccionados.splice(Number(btn.dataset.idx), 1);
    renderizarLista();
});

btnLimpiar.addEventListener('click', () => {
    clearTimeout(temporizadorAuto);
    archivosSeleccionados = [];
    renderizarLista();
});

btnProcesar.addEventListener('click', () => {
    clearTimeout(temporizadorAuto);
    procesar();
});

toggleAuto.addEventListener('change', () => {
    if (toggleAuto.checked && archivosSeleccionados.length > 0 && !procesando) {
        programarAutomatico();
    }
});

// --- Procesamiento ---
function procesar() {
    if (procesando || archivosSeleccionados.length === 0) return;
    const aProcesar = [...archivosSeleccionados];
    archivosSeleccionados = [];
    renderizarLista();

    procesando = true;
    btnProcesar.disabled = true;
    btnLimpiar.disabled = true;
    resultado.hidden = true;
    progreso.hidden = false;
    barraInner.style.width = '0%';
    progresoTexto.textContent = 'Subiendo archivos...';

    const formData = new FormData();
    for (const f of aProcesar) {
        formData.append('archivos', f);
    }

    llamar('/procesar', { method: 'POST', body: formData })
        .then(({ resp, data }) => {
            if (resp.status === 413) {
                throw new Error('El lote supera el tamaño máximo permitido (50 MB).');
            }
            if (resp.status === 401) {
                cerrarSesion();
                throw new Error('Sesión expirada. Vuelva a ingresar.');
            }
            if (!data || !data.ok) {
                throw new Error((data && data.error) || 'Error al procesar.');
            }
            vigilarJob(data.job_id);
        })
        .catch(err => mostrarResultado(false, err.message || 'Error de conexión con el servidor.', []));
}

function programarAutomatico() {
    if (!toggleAuto.checked || procesando) return;
    clearTimeout(temporizadorAuto);
    temporizadorAuto = setTimeout(procesar, 600);
}

function vigilarJob(jobId) {
    const intervalo = setInterval(async () => {
        try {
            const { resp, data } = await llamar(`/estado/${jobId}`);
            if (resp.status === 401) {
                clearInterval(intervalo);
                cerrarSesion();
                mostrarResultado(false, 'Sesión expirada. Vuelva a ingresar.', []);
                finalizarProcesamiento();
                return;
            }
            if (!data || !data.ok) throw new Error(data ? data.error : 'Error de estado.');

            const job = data.job;
            const pct = job.total > 0 ? Math.round((job.actual / job.total) * 100) : 0;
            barraInner.style.width = `${pct}%`;
            if (job.status === 'procesando' || job.status === 'en_cola') {
                progresoTexto.textContent = job.status === 'en_cola'
                    ? 'En cola de espera...'
                    : `Procesando ${job.actual} de ${job.total}: ${job.archivo_actual}`;
                return;
            }

            clearInterval(intervalo);
            barraInner.style.width = '100%';
            progresoTexto.textContent = 'Finalizando...';

            if (job.status === 'error' || job.camaras === 0) {
                const msj = job.camaras === 0
                    ? 'Ningún PDF pudo procesarse.'
                    : 'Ocurrió un error durante el procesamiento.';
                mostrarResultado(false, msj, job.errores);
                finalizarProcesamiento();
                return;
            }

            let aviso = `Se procesaron ${job.camaras} cámaras correctamente.`;
            if (job.descartados > 0) {
                aviso += ` Se descartaron ${job.descartados} archivo(s) que no eran PDF.`;
            }
            mostrarResultado(true, aviso, job.errores);
            await descargarExcel(jobId);
            finalizarProcesamiento();
        } catch (err) {
            clearInterval(intervalo);
            mostrarResultado(false, err.message || 'Error al consultar el estado.', []);
            finalizarProcesamiento();
        }
    }, 500);
}

async function descargarExcel(jobId) {
    try {
        const resp = await fetch(`${apiBase()}/descargar/${jobId}`, { headers: cabeceras() });
        if (!resp.ok) {
            throw new Error('No se pudo descargar el archivo.');
        }
        const blob = await resp.blob();
        const urlObjeto = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = urlObjeto;
        link.download = 'consolidado_liquidaciones_tesoreria.xlsx';
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(urlObjeto);
    } catch (e) {
        mostrarResultado(false, e.message, []);
    }
}

function finalizarProcesamiento() {
    procesando = false;
    progreso.hidden = true;
    btnProcesar.disabled = archivosSeleccionados.length === 0;
    btnLimpiar.disabled = archivosSeleccionados.length === 0;
    if (archivosSeleccionados.length > 0 && toggleAuto.checked) {
        programarAutomatico();
    }
}

function mostrarResultado(ok, mensaje, errores) {
    resultado.hidden = false;
    resultado.className = ok ? 'resultado ok' : 'resultado error';
    resultado.innerHTML = `<p><strong>${ok ? '¡Listo!' : 'Error'}:</strong> ${mensaje}</p>`;
    if (errores && errores.length) {
        const ul = document.createElement('ul');
        errores.forEach(e => {
            const li = document.createElement('li');
            li.textContent = `${e.archivo}: ${e.error}`;
            ul.appendChild(li);
        });
        resultado.appendChild(ul);
    }
}
