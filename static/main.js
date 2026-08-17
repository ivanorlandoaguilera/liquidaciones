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

// --- Fábrica de módulos (envía 'tipo' al backend) ---
function crearModulo(tipo, prefijo, nombreDescarga) {
    const el = {
        dropZone: document.getElementById(`drop-zone-${prefijo}`),
        fileInput: document.getElementById(`file-input-${prefijo}`),
        listaArchivos: document.getElementById(`lista-archivos-${prefijo}`),
        btnProcesar: document.getElementById(`btn-procesar-${prefijo}`),
        btnLimpiar: document.getElementById(`btn-limpiar-${prefijo}`),
        toggleAuto: document.getElementById(`toggle-auto-${prefijo}`),
        progreso: document.getElementById(`progreso-${prefijo}`),
        barraInner: document.getElementById(`barra-inner-${prefijo}`),
        progresoTexto: document.getElementById(`progreso-texto-${prefijo}`),
        resultado: document.getElementById(`resultado-${prefijo}`),
    };

    let archivosSeleccionados = [];
    let procesando = false;
    let temporizadorAuto = null;

    function renderizarLista() {
        el.listaArchivos.innerHTML = '';
        archivosSeleccionados.forEach((f, i) => {
            const li = document.createElement('li');
            const tam = (f.size / 1024).toFixed(1);
            li.innerHTML = `<span>${f.name}</span><small>${tam} KB</small>
                            <button type="button" data-idx="${i}" class="quitar" title="Quitar">&times;</button>`;
            el.listaArchivos.appendChild(li);
        });
        const hayPdfs = archivosSeleccionados.some(f => f.name.toLowerCase().endsWith('.pdf'));
        el.btnProcesar.disabled = !hayPdfs || procesando;
        el.btnLimpiar.disabled = archivosSeleccionados.length === 0 || procesando;
        if (!procesando) el.resultado.hidden = true;
    }

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

    function programarAutomatico() {
        if (!el.toggleAuto.checked || procesando) return;
        clearTimeout(temporizadorAuto);
        temporizadorAuto = setTimeout(procesar, 600);
    }

    function procesar() {
        if (procesando || archivosSeleccionados.length === 0) return;
        const aProcesar = [...archivosSeleccionados];
        archivosSeleccionados = [];
        renderizarLista();

        procesando = true;
        el.btnProcesar.disabled = true;
        el.btnLimpiar.disabled = true;
        el.resultado.hidden = true;
        el.progreso.hidden = false;
        el.barraInner.style.width = '0%';
        el.progresoTexto.textContent = 'Subiendo archivos...';

        const formData = new FormData();
        formData.append('tipo', tipo);
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

    function vigilarJob(jobId) {
        let cerrado = false;
        const intervalo = setInterval(async () => {
            if (cerrado) return;
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
                el.barraInner.style.width = `${pct}%`;
                if (job.status === 'procesando' || job.status === 'en_cola') {
                    el.progresoTexto.textContent = job.status === 'en_cola'
                        ? 'En cola de espera...'
                        : `Procesando ${job.actual} de ${job.total}: ${job.archivo_actual}`;
                    return;
                }

                cerrado = true;
                clearInterval(intervalo);
                el.barraInner.style.width = '100%';
                el.progresoTexto.textContent = 'Finalizando...';

                if (job.status === 'error' || job.camaras === 0) {
                    const msj = job.camaras === 0
                        ? 'Ningún PDF pudo procesarse.'
                        : 'Ocurrió un error durante el procesamiento.';
                    mostrarResultado(false, msj, job.errores);
                    finalizarProcesamiento();
                    return;
                }

                let aviso = `Se procesaron ${job.camaras} archivo(s) correctamente.`;
                if (job.descartados > 0) {
                    aviso += ` Se descartaron ${job.descartados} archivo(s) que no eran PDF.`;
                }
                mostrarResultado(true, aviso, job.errores);
                await descargarExcel(jobId);
                finalizarProcesamiento();
            } catch (err) {
                clearInterval(intervalo);
                if (!cerrado) {
                    mostrarResultado(false, err.message || 'Error al consultar el estado.', []);
                }
                finalizarProcesamiento();
            }
        }, 500);
    }

    async function descargarExcel(jobId, reintento = true) {
        try {
            const resp = await fetch(`${apiBase()}/descargar/${jobId}`, { headers: cabeceras() });
            if (!resp.ok) {
                if (reintento) {
                    await new Promise(r => setTimeout(r, 1000));
                    return descargarExcel(jobId, false);
                }
                throw new Error('No se pudo descargar el archivo.');
            }
            const blob = await resp.blob();
            const urlObjeto = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = urlObjeto;
            link.download = nombreDescarga;
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
        el.progreso.hidden = true;
        el.btnProcesar.disabled = archivosSeleccionados.length === 0;
        el.btnLimpiar.disabled = archivosSeleccionados.length === 0;
        if (archivosSeleccionados.length > 0 && el.toggleAuto.checked) {
            programarAutomatico();
        }
    }

    function mostrarResultado(ok, mensaje, errores) {
        el.resultado.hidden = false;
        el.resultado.className = ok ? 'resultado ok' : 'resultado error';
        el.resultado.innerHTML = `<p><strong>${ok ? '¡Listo!' : 'Error'}:</strong> ${mensaje}</p>`;
        if (errores && errores.length) {
            const ul = document.createElement('ul');
            errores.forEach(e => {
                const li = document.createElement('li');
                li.textContent = `${e.archivo}: ${e.error}`;
                ul.appendChild(li);
            });
            el.resultado.appendChild(ul);
        }
    }

    // --- Eventos del módulo ---
    el.dropZone.addEventListener('click', () => el.fileInput.click());

    el.dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        el.dropZone.classList.add('arrastrando');
    });

    el.dropZone.addEventListener('dragleave', () => el.dropZone.classList.remove('arrastrando'));

    el.dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        el.dropZone.classList.remove('arrastrando');
        agregarArchivos(e.dataTransfer.files);
    });

    el.fileInput.addEventListener('change', () => {
        agregarArchivos(el.fileInput.files);
        el.fileInput.value = '';
    });

    el.listaArchivos.addEventListener('click', (e) => {
        const btnQuitar = e.target.closest('.quitar');
        if (!btnQuitar) return;
        archivosSeleccionados.splice(Number(btnQuitar.dataset.idx), 1);
        renderizarLista();
    });

    el.btnLimpiar.addEventListener('click', () => {
        clearTimeout(temporizadorAuto);
        archivosSeleccionados = [];
        renderizarLista();
    });

    el.btnProcesar.addEventListener('click', () => {
        clearTimeout(temporizadorAuto);
        procesar();
    });

    el.toggleAuto.addEventListener('change', () => {
        if (el.toggleAuto.checked && archivosSeleccionados.length > 0 && !procesando) {
            programarAutomatico();
        }
    });
}

// --- Instanciar los dos módulos ---
crearModulo('liquidaciones', 'liq', 'consolidado_liquidaciones_tesoreria.xlsx');
crearModulo('facturas', 'fac', 'planilla_facturas_camaras.xlsx');