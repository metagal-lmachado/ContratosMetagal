Chart.register(ChartDataLabels);

const PAGE_SIZE = 20;
const CSV_PATH = 'DADOS.csv';
const ACESSO_PATH = 'acesso.csv';
const SESSION_KEY = 'contratos_metagal_usuario';
const REMEMBER_KEY = 'contratos_metagal_usuario_lembrado';

const CORES_ESTABELECIMENTO = {
    VIES: '#2d5016',
    SRS: '#4caf50',
    OUROS: '#ff9800',
    '333': '#7b1fa2',
    VIESADM: '#009688'
};
const CORES_BARRAS = [
    'rgba(27, 61, 27, 0.85)',
    'rgba(45, 80, 22, 0.8)',
    'rgba(76, 175, 80, 0.75)',
    'rgba(139, 195, 74, 0.75)',
    'rgba(255, 152, 0, 0.75)',
    'rgba(244, 67, 54, 0.75)',
    'rgba(33, 150, 243, 0.75)',
    'rgba(156, 39, 176, 0.75)',
    'rgba(0, 188, 212, 0.75)',
    'rgba(233, 30, 99, 0.75)',
    'rgba(63, 81, 181, 0.75)',
    'rgba(255, 193, 7, 0.75)',
    'rgba(121, 85, 72, 0.75)',
    'rgba(96, 125, 139, 0.75)',
    'rgba(0, 150, 136, 0.75)'
];

let dadosCompletos = [];
let dados = [];
let dadosFiltrados = [];
let dadosTabela = [];
let paginaAtual = 1;
let statusMode = 'quantidade';
let periodoInicio = null;
let periodoFim = null;
let charts = {};
const CALENDARIO_ANO_TODOS = 'todos';
let calendarioMesSelecionado = null;
let calendarioOrdenacao = 'vencimento';
let mapaAcessos = {};
let usuarioAtual = null;
let dadosCsvLocal = null;
let listaAcessoCarregada = false;
let usuarioIdentificado = '';
let usuarioIdentificadoExibicao = '';
let origemIdentidade = '';
let msalInstance = null;

document.addEventListener('DOMContentLoaded', async () => {
    inicializarEventos();
    inicializarBotoesCopiarGrafico();
    await iniciarControleAcesso();
});

function inicializarEventos() {
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', e => {
            e.preventDefault();
            mudarPagina(item.dataset.page);
            fecharMenuMobile();
        });
    });

    document.getElementById('btn-collapse-sidebar').addEventListener('click', () => {
        if (isLayoutMobile()) {
            fecharMenuMobile();
            return;
        }
        document.getElementById('sidebar').classList.toggle('collapsed');
    });

    document.getElementById('btn-menu')?.addEventListener('click', alternarMenuMobile);
    document.getElementById('sidebar-backdrop')?.addEventListener('click', fecharMenuMobile);
    window.addEventListener('resize', () => {
        if (!isLayoutMobile()) fecharMenuMobile();
    });

    document.getElementById('btn-toggle-filters').addEventListener('click', () => {
        document.getElementById('filters-panel').classList.toggle('open');
    });

    [
        'filter-estabelecimento',
        'filter-status',
        'filter-departamento',
        'filter-depto-compras',
        'filter-gestao',
        'filter-curva'
    ].forEach(id => {
        document.getElementById(id).addEventListener('change', aplicarFiltros);
    });

    document.getElementById('btn-aplicar-periodo').addEventListener('click', aplicarPeriodo);
    document.getElementById('btn-limpar-periodo').addEventListener('click', limparPeriodo);
    document.getElementById('btn-reset-filtros').addEventListener('click', limparFiltros);
    document.getElementById('search-global').addEventListener('input', aplicarFiltros);
    document.getElementById('btn-reload').addEventListener('click', carregarDados);

    document.getElementById('btn-status-quantidade').addEventListener('click', () => setStatusMode('quantidade'));
    document.getElementById('btn-status-valor').addEventListener('click', () => setStatusMode('valor'));

    document.getElementById('input-csv').addEventListener('change', e => {
        const file = e.target.files?.[0];
        if (file) carregarCsvArquivo(file);
    });

    document.getElementById('search-lancamentos').addEventListener('input', filtrarTabela);
    document.getElementById('btn-export').addEventListener('click', exportarXlsx);
    document.getElementById('btn-export-tabela').addEventListener('click', exportarTabelaContratosXlsx);
    document.getElementById('btn-prev').addEventListener('click', () => mudarPaginaTabela(-1));
    document.getElementById('btn-next').addEventListener('click', () => mudarPaginaTabela(1));

    document.getElementById('filter-analise-departamento').addEventListener('change', atualizarAnalise);
    document.getElementById('calendario-ano').addEventListener('change', () => {
        calendarioMesSelecionado = null;
        atualizarCalendario();
    });
    document.getElementById('calendario-grid').addEventListener('click', e => {
        const card = e.target.closest('.calendario-mes-card');
        if (!card) return;
        const mes = Number(card.dataset.mes);
        if (Number.isNaN(mes)) return;
        calendarioMesSelecionado = calendarioMesSelecionado === mes ? null : mes;
        atualizarCalendario();
    });
    document.getElementById('calendario-ordenacao').addEventListener('change', e => {
        calendarioOrdenacao = e.target.value;
        const selectAno = document.getElementById('calendario-ano');
        const ano = selectAno.value === CALENDARIO_ANO_TODOS
            ? CALENDARIO_ANO_TODOS
            : Number(selectAno.value);
        renderizarListaContratosCalendario(ano, calendarioMesSelecionado);
    });

    document.getElementById('form-login').addEventListener('submit', e => {
        e.preventDefault();
        const usuario = usuarioIdentificado || document.getElementById('login-usuario').value;
        autenticarUsuario(usuario, {
            origemWindows: origemIdentidade === 'windows' || origemIdentidade === 'microsoft'
        });
    });

    document.getElementById('btn-microsoft')?.addEventListener('click', () => iniciarLoginMicrosoft());

    document.getElementById('btn-logout').addEventListener('click', encerrarSessao);
    document.getElementById('input-pasta-projeto').addEventListener('change', e => {
        carregarArquivosPasta(e.target.files);
        e.target.value = '';
    });
    document.getElementById('input-acesso-csv').addEventListener('change', e => {
        const file = e.target.files?.[0];
        if (file) carregarAcessoArquivo(file);
        e.target.value = '';
    });
    document.getElementById('input-csv-faltando')?.addEventListener('change', e => {
        const file = e.target.files?.[0];
        if (file) carregarCsvArquivo(file);
        e.target.value = '';
    });
}

async function iniciarControleAcesso() {
    await identificarUsuario();
    aplicarIdentidadeDetectada();

    const ok = await carregarAcessos();
    if (!ok) {
        mostrarFallbackLocal();
        atualizarTextosAcessoPendente();
        return;
    }

    aposListaAcessoPronta();
}

function isSitePublicado() {
    const host = location.hostname;
    return location.protocol === 'https:'
        && host !== 'localhost'
        && host !== '127.0.0.1';
}

function configMicrosoft() {
    const cfg = window.AUTH_CONFIG || {};
    return {
        clientId: String(cfg.microsoftClientId || cfg.clientId || '').trim(),
        tenantId: String(cfg.microsoftTenantId || cfg.tenantId || 'metagal.com.br').trim(),
        domainHint: String(cfg.microsoftDomainHint || cfg.domainHint || 'metagal.com.br').trim()
    };
}

function normalizarIdentidade(valor) {
    let texto = String(valor || '').trim().toLowerCase();
    if (!texto) return '';
    if (texto.includes('\\')) texto = texto.split('\\').pop();
    if (texto.includes('@')) texto = texto.split('@')[0];
    return texto.trim();
}

function encontrarPerfil(login) {
    const bruto = String(login || '').trim().toLowerCase();
    const curto = normalizarIdentidade(bruto);
    return mapaAcessos[bruto] || mapaAcessos[curto] || null;
}

function definirIdentidade(login, origem) {
    usuarioIdentificadoExibicao = String(login || '').trim();
    usuarioIdentificado = normalizarIdentidade(usuarioIdentificadoExibicao);
    origemIdentidade = origem || '';
}

function obterUsuarioLembrado() {
    try {
        return String(localStorage.getItem(REMEMBER_KEY) || sessionStorage.getItem(SESSION_KEY) || '').trim();
    } catch (_) {
        return String(sessionStorage.getItem(SESSION_KEY) || '').trim();
    }
}

function lembrarUsuario(login) {
    const curto = normalizarIdentidade(login);
    if (!curto) return;
    try { localStorage.setItem(REMEMBER_KEY, curto); } catch (_) { /* modo privado */ }
    sessionStorage.setItem(SESSION_KEY, curto);
}

function esquecerUsuario() {
    try { localStorage.removeItem(REMEMBER_KEY); } catch (_) { /* modo privado */ }
    sessionStorage.removeItem(SESSION_KEY);
}

async function identificarUsuario() {
    const windows = await obterUsuarioWindows();
    if (windows) {
        definirIdentidade(windows, 'windows');
        return;
    }

    const microsoft = await obterUsuarioMicrosoft();
    if (microsoft) {
        definirIdentidade(microsoft, 'microsoft');
        return;
    }

    const lembrado = obterUsuarioLembrado();
    if (lembrado) {
        definirIdentidade(lembrado, 'lembrado');
        return;
    }

    definirIdentidade('', '');
}

async function obterUsuarioWindows() {
    if (isSitePublicado()) return '';

    try {
        const resposta = await fetch('/api/whoami', { cache: 'no-store' });
        if (resposta.ok) {
            const data = await resposta.json();
            if (data?.usuario) return String(data.usuario).trim();
        }
    } catch (_) { /* file:// ou servidor indisponível */ }

    return String(window.USUARIO_WINDOWS || '').trim();
}

function obterInstanciaMsal() {
    const { clientId, tenantId } = configMicrosoft();
    if (!clientId || typeof msal === 'undefined') return null;
    if (msalInstance) return msalInstance;

    msalInstance = new msal.PublicClientApplication({
        auth: {
            clientId,
            authority: `https://login.microsoftonline.com/${tenantId}`,
            redirectUri: window.location.origin + '/',
            postLogoutRedirectUri: window.location.origin + '/'
        },
        cache: { cacheLocation: 'sessionStorage' }
    });
    return msalInstance;
}

function loginDaContaMicrosoft(account) {
    return account?.username || account?.idTokenClaims?.preferred_username || account?.name || '';
}

async function obterUsuarioMicrosoft() {
    const instancia = obterInstanciaMsal();
    if (!instancia) return '';

    try {
        const redirecionamento = await instancia.handleRedirectPromise();
        if (redirecionamento?.account) {
            instancia.setActiveAccount(redirecionamento.account);
            return loginDaContaMicrosoft(redirecionamento.account);
        }

        const contas = instancia.getAllAccounts();
        if (contas[0]) {
            instancia.setActiveAccount(contas[0]);
            return loginDaContaMicrosoft(contas[0]);
        }

        const { domainHint } = configMicrosoft();
        const silencioso = await instancia.ssoSilent({
            scopes: ['openid', 'profile'],
            extraQueryParameters: { domain_hint: domainHint }
        });
        if (silencioso?.account) {
            instancia.setActiveAccount(silencioso.account);
            return loginDaContaMicrosoft(silencioso.account);
        }
    } catch (erro) {
        console.warn('Microsoft SSO silencioso indisponível', erro);
    }

    return '';
}

function iniciarLoginMicrosoft() {
    const instancia = obterInstanciaMsal();
    if (!instancia) {
        mostrarErroLogin('A identificação automática pela conta Microsoft ainda não está configurada neste site.');
        return;
    }

    const { domainHint } = configMicrosoft();
    document.getElementById('login-subtitle').textContent = 'Redirecionando para a conta Microsoft...';
    instancia.loginRedirect({
        scopes: ['openid', 'profile'],
        extraQueryParameters: { domain_hint: domainHint }
    });
}

function aplicarIdentidadeDetectada() {
    const box = document.getElementById('login-windows');
    const manual = document.getElementById('login-manual');
    const subtitle = document.getElementById('login-subtitle');
    const input = document.getElementById('login-usuario');
    const btn = document.getElementById('btn-login');
    const btnMicrosoft = document.getElementById('btn-microsoft');
    const label = document.getElementById('login-windows-label');
    const temMicrosoft = Boolean(configMicrosoft().clientId && typeof msal !== 'undefined');

    if (usuarioIdentificado) {
        const rotulos = {
            microsoft: 'Conta Microsoft',
            windows: 'Usuário Windows',
            lembrado: 'Usuário deste computador'
        };
        label.textContent = rotulos[origemIdentidade] || 'Usuário identificado';
        document.getElementById('login-windows-nome').textContent = usuarioIdentificadoExibicao || usuarioIdentificado;
        box.classList.remove('hidden');
        manual.classList.add('hidden');
        input.value = usuarioIdentificadoExibicao || usuarioIdentificado;
        subtitle.textContent = origemIdentidade === 'microsoft'
            ? 'Acesso validado pela conta Microsoft da Metagal'
            : origemIdentidade === 'windows'
                ? 'Acesso validado pelo usuário logado no Windows'
                : 'Entrando com o usuário lembrado neste computador';
        btn.classList.remove('hidden');
        btnMicrosoft.classList.add('hidden');
        return;
    }

    box.classList.add('hidden');
    manual.classList.remove('hidden');
    btn.classList.remove('hidden');
    btnMicrosoft.classList.toggle('hidden', !temMicrosoft);
    subtitle.textContent = 'Informe seu usuário ou e-mail Metagal. Neste computador o acesso ficará lembrado.';
}

function aposListaAcessoPronta() {
    if (!listaAcessoCarregada) return;

    if (usuarioIdentificado) {
        autenticarUsuario(usuarioIdentificado, {
            origemWindows: origemIdentidade === 'windows' || origemIdentidade === 'microsoft',
            silencioso: origemIdentidade === 'lembrado'
        });
        if (origemIdentidade === 'lembrado' && !usuarioAtual) {
            esquecerUsuario();
            definirIdentidade('', '');
            aplicarIdentidadeDetectada();
            mostrarErroLogin('O usuário lembrado neste computador não está na lista de acesso.');
        }
        return;
    }

    aplicarIdentidadeDetectada();
}

function atualizarTextosAcessoPendente() {
    if (!usuarioIdentificado) return;
    mostrarAvisoLogin('Usuário identificado. Carregue os arquivos da pasta para validar o acesso.');
}

function isFalhaLeituraLocal(erro) {
    const raw = String(erro?.message || erro || '');
    return location.protocol === 'file:'
        || /failed to fetch|networkerror|load failed|not allowed|cors/i.test(raw);
}

function mostrarFallbackLocal() {
    if (isSitePublicado()) return;
    document.getElementById('login-local').classList.remove('hidden');
}

function ocultarFallbackLocal() {
    document.getElementById('login-local').classList.add('hidden');
}

function mostrarAvisoLogin(mensagem) {
    const el = document.getElementById('login-ok');
    if (!mensagem) {
        el.classList.add('hidden');
        el.textContent = '';
        return;
    }
    el.textContent = mensagem;
    el.classList.remove('hidden');
}

function mostrarBannerDadosFaltando(exibir) {
    document.getElementById('dados-faltando')?.classList.toggle('hidden', !exibir);
}

function localizarArquivo(fileList, nome) {
    const alvo = nome.toLowerCase();
    return [...fileList].find(file => file.name.toLowerCase() === alvo) || null;
}

async function carregarAcessos() {
    try {
        const response = await fetch(ACESSO_PATH);
        if (!response.ok) {
            throw new Error(`Não foi possível carregar ${ACESSO_PATH}.`);
        }
        const buffer = await response.arrayBuffer();
        const texto = decodificarCsvAcesso(buffer);
        processarAcessoCsv(texto);
        listaAcessoCarregada = true;
        ocultarFallbackLocal();
        return true;
    } catch (erro) {
        console.error(erro);
        listaAcessoCarregada = false;
        mostrarErroLogin(isFalhaLeituraLocal(erro)
            ? ''
            : (erro.message || 'Não foi possível carregar a lista de acesso.'));
        mostrarFallbackLocal();
        return false;
    }
}

async function carregarArquivosPasta(fileList) {
    if (!fileList?.length) return;

    const acesso = localizarArquivo(fileList, 'acesso.csv');
    const dados = localizarArquivo(fileList, 'DADOS.csv');

    if (!acesso) {
        mostrarAvisoLogin('');
        mostrarErroLogin('A pasta selecionada não contém acesso.csv.');
        mostrarFallbackLocal();
        return;
    }

    try {
        const texto = decodificarCsvAcesso(await acesso.arrayBuffer());
        processarAcessoCsv(texto);
        listaAcessoCarregada = true;
        dadosCsvLocal = dados ? await dados.arrayBuffer() : null;
        mostrarErroLogin('');
        ocultarFallbackLocal();
        mostrarAvisoLogin(dados
            ? (usuarioIdentificado
                ? 'Arquivos carregados. Validando o usuário...'
                : 'Arquivos carregados. Informe seu usuário para entrar.')
            : 'acesso.csv carregado. O DADOS.csv poderá ser selecionado depois.');

        aposListaAcessoPronta();
    } catch (erro) {
        console.error(erro);
        listaAcessoCarregada = false;
        mostrarAvisoLogin('');
        mostrarErroLogin(erro.message || 'Não foi possível ler os arquivos da pasta.');
        mostrarFallbackLocal();
    }
}

async function carregarAcessoArquivo(file) {
    try {
        const texto = decodificarCsvAcesso(await file.arrayBuffer());
        processarAcessoCsv(texto);
        listaAcessoCarregada = true;
        mostrarErroLogin('');
        ocultarFallbackLocal();
        mostrarAvisoLogin('Lista de acesso carregada. Validando permissão...');
        aposListaAcessoPronta();
    } catch (erro) {
        console.error(erro);
        listaAcessoCarregada = false;
        mostrarAvisoLogin('');
        mostrarErroLogin(erro.message || 'Não foi possível ler acesso.csv.');
        mostrarFallbackLocal();
    }
}

function decodificarCsvAcesso(buffer) {
    const encodings = ['windows-1252', 'iso-8859-1', 'utf-8'];
    for (const enc of encodings) {
        try {
            const texto = new TextDecoder(enc).decode(buffer);
            if (/usuario/i.test(texto)) return texto;
        } catch (_) { /* tenta próximo encoding */ }
    }
    return new TextDecoder('utf-8').decode(buffer);
}

function processarAcessoCsv(texto) {
    const linhas = texto.split(/\r?\n/).filter(l => l.trim());
    if (linhas.length < 2) throw new Error('Arquivo de acesso vazio ou inválido.');

    const cabecalho = parseCsvLinha(linhas[0]).map(c => normalizarChave(c));
    const iUser = cabecalho.indexOf('usuario');
    const iNivel = cabecalho.indexOf('nivel');
    const iAcesso = cabecalho.indexOf('acesso');

    if (iUser < 0 || iNivel < 0 || iAcesso < 0) {
        throw new Error('acesso.csv deve conter as colunas usuario, nivel e acesso.');
    }

    mapaAcessos = {};
    linhas.slice(1).forEach(linha => {
        const partes = parseCsvLinha(linha);
        const usuario = normalizarIdentidade(partes[iUser] || '');
        const nivel = (partes[iNivel] || '').trim();
        const acesso = (partes[iAcesso] || '').trim();
        if (!usuario) return;

        if (!mapaAcessos[usuario]) {
            mapaAcessos[usuario] = { usuario, admin: false, regras: [], niveis: new Set() };
        }

        const perfil = mapaAcessos[usuario];
        if (nivel) perfil.niveis.add(nivel);

        if (normalizarChave(nivel) === 'administrador') {
            perfil.admin = true;
            return;
        }

        if (nivel && acesso) {
            perfil.regras.push({ coluna: nivel, valor: acesso });
        }
    });
}

function autenticarUsuario(login, opcoes = {}) {
    const usuario = normalizarIdentidade(login);
    if (!usuario) {
        if (!opcoes.silencioso) mostrarErroLogin('Informe o usuário para acessar o painel.');
        return false;
    }

    if (!listaAcessoCarregada) {
        if (!opcoes.silencioso) {
            mostrarErroLogin('Carregue a lista de acesso antes de entrar.');
            mostrarFallbackLocal();
        }
        return false;
    }

    if (usuarioIdentificado && usuario !== usuarioIdentificado && (origemIdentidade === 'windows' || origemIdentidade === 'microsoft')) {
        if (!opcoes.silencioso) {
            mostrarErroLogin(`O acesso deve ser feito com o usuário "${usuarioIdentificadoExibicao || usuarioIdentificado}".`);
        }
        return false;
    }

    const perfil = encontrarPerfil(usuario);
    if (!perfil) {
        usuarioAtual = null;
        esquecerUsuario();
        if (!opcoes.silencioso) {
            const exibicao = usuarioIdentificadoExibicao || usuarioIdentificado || login;
            mostrarErroLogin(opcoes.origemWindows
                ? `O usuário "${exibicao}" não está na lista de acesso. Você não pode visualizar os dados do painel.`
                : 'Usuário sem permissão de acesso. Você não pode visualizar os dados do painel.');
        }
        return false;
    }

    usuarioAtual = {
        usuario: perfil.usuario,
        admin: perfil.admin,
        regras: perfil.regras,
        niveis: [...perfil.niveis]
    };

    lembrarUsuario(perfil.usuario);
    definirIdentidade(usuarioIdentificadoExibicao || perfil.usuario, origemIdentidade || 'lembrado');
    mostrarErroLogin('');
    exibirPainel();
    atualizarBadgeUsuario();
    carregarDados();
    return true;
}

function encerrarSessao() {
    usuarioAtual = null;
    dadosCompletos = [];
    dados = [];
    dadosFiltrados = [];
    dadosTabela = [];
    esquecerUsuario();
    definirIdentidade('', '');

    mostrarBannerDadosFaltando(false);
    document.getElementById('app').classList.add('hidden');
    document.getElementById('login-overlay').classList.remove('hidden');
    document.getElementById('login-usuario').value = '';
    aplicarIdentidadeDetectada();
    mostrarErroLogin('');
    mostrarAvisoLogin('');
    if (!listaAcessoCarregada) {
        mostrarFallbackLocal();
        atualizarTextosAcessoPendente();
    }
}

function exibirPainel() {
    document.getElementById('login-overlay').classList.add('hidden');
    document.getElementById('app').classList.remove('hidden');
}

function mostrarErroLogin(mensagem) {
    const el = document.getElementById('login-erro');
    if (!mensagem) {
        el.classList.add('hidden');
        el.textContent = '';
        return;
    }
    el.textContent = mensagem;
    el.classList.remove('hidden');
}

function atualizarBadgeUsuario() {
    if (!usuarioAtual) return;
    document.getElementById('user-session-name').textContent = usuarioIdentificadoExibicao || usuarioAtual.usuario;
    const origem = origemIdentidade === 'microsoft' ? 'Microsoft' : (origemIdentidade === 'windows' ? 'Windows' : '');
    document.getElementById('user-session-role').textContent = usuarioAtual.admin
        ? (origem ? `Administrador · ${origem}` : 'Administrador')
        : rotuloAcessoUsuario(usuarioAtual);
}

function rotuloAcessoUsuario(perfil) {
    const colunas = [...new Set(perfil.regras.map(r => r.coluna.trim()))];
    if (!colunas.length) return 'Acesso restrito';
    return colunas.join(' · ');
}

function aplicarRestricaoAcesso(registros) {
    if (!usuarioAtual) return [];
    if (usuarioAtual.admin) return [...registros];
    return registros.filter(registroPermitido);
}

function registroPermitido(registro) {
    if (!usuarioAtual?.regras?.length) return false;
    return usuarioAtual.regras.some(regra => {
        const valorRegistro = valorCampoRegistro(registro, regra.coluna);
        return normalizarTexto(valorRegistro) === normalizarTexto(regra.valor);
    });
}

function valorCampoRegistro(registro, coluna) {
    const chave = normalizarChave(coluna);
    if (registro.campos && Object.prototype.hasOwnProperty.call(registro.campos, chave)) {
        return registro.campos[chave];
    }
    const aliases = {
        gestao: registro.gestao,
        'acessos gerentes': registro.acessos_gerentes
    };
    if (aliases[chave] !== undefined) return aliases[chave];
    return registro[chave] ?? '';
}

function normalizarChave(valor) {
    return String(valor || '').trim().toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function normalizarTexto(valor) {
    return String(valor || '').trim().toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ');
}

async function carregarDados() {
    if (!usuarioAtual) return;

    const badge = document.getElementById('loading-badge');
    badge.classList.remove('hidden');
    badge.textContent = 'Carregando...';
    mostrarBannerDadosFaltando(false);

    try {
        if (dadosCsvLocal) {
            const texto = decodificarCsv(dadosCsvLocal);
            processarCsv(texto);
            return;
        }

        const response = await fetch(CSV_PATH);
        if (!response.ok) {
            throw new Error(`Não foi possível carregar ${CSV_PATH}.`);
        }

        const buffer = await response.arrayBuffer();
        const texto = decodificarCsv(buffer);
        processarCsv(texto);
    } catch (erro) {
        console.error(erro);
        if (!dados.length) {
            mostrarBannerDadosFaltando(true);
        }
    } finally {
        badge.classList.add('hidden');
        badge.textContent = 'Carregando...';
    }
}

function carregarCsvArquivo(file) {
    if (!usuarioAtual) return;

    const badge = document.getElementById('loading-badge');
    badge.classList.remove('hidden');
    badge.textContent = 'Carregando...';

    const reader = new FileReader();
    reader.onload = e => {
        try {
            const texto = decodificarCsv(e.target.result);
            processarCsv(texto);
            mostrarBannerDadosFaltando(false);
        } catch (erro) {
            console.error(erro);
            alert(`Erro ao processar CSV: ${erro.message}`);
        } finally {
            badge.classList.add('hidden');
        }
    };
    reader.onerror = () => {
        badge.classList.add('hidden');
        alert('Erro ao ler o arquivo CSV.');
    };
    reader.readAsArrayBuffer(file);
}

function decodificarCsv(buffer) {
    const encodings = ['windows-1252', 'iso-8859-1', 'utf-8'];
    for (const enc of encodings) {
        try {
            const texto = new TextDecoder(enc).decode(buffer);
            if (texto.includes('preco_total_linha')) return texto;
        } catch (_) { /* tenta próximo encoding */ }
    }
    return new TextDecoder('utf-8').decode(buffer);
}

function processarCsv(texto) {
    const linhas = texto.split(/\r?\n/).filter(l => l.trim());
    if (linhas.length < 2) throw new Error('CSV vazio ou inválido.');

    const cabecalho = parseCsvLinha(linhas[0]);
    const mapa = mapearColunas(cabecalho);

    dadosCompletos = linhas.slice(1).map(linha => normalizarRegistro(parseCsvLinha(linha), mapa));
    dados = aplicarRestricaoAcesso(dadosCompletos);
    dadosFiltrados = [...dados];
    dadosTabela = [...dados];

    console.log(`${dadosCompletos.length} registros carregados · ${dados.length} liberados para ${usuarioAtual?.usuario || 'sem usuário'}`);
    preencherFiltros();
    definirPeriodoPadrao();
    aplicarFiltros();
}

function mapearColunas(cabecalho) {
    const idx = {};
    cabecalho.forEach((col, i) => {
        idx[normalizarChave(col)] = i;
    });

    const buscar = (...nomes) => {
        for (const nome of nomes) {
            const chave = normalizarChave(nome);
            if (idx[chave] !== undefined) return idx[chave];
        }
        return -1;
    };

    return {
        nota_fiscal: buscar('nota_fiscal'),
        estabelecimento: buscar('estabelecimento'),
        pn_fornecedor: buscar('pn_fornecedor'),
        descricao_fornecedor: buscar('descricao_fornecedor'),
        data_fiscal: buscar('data_fiscal'),
        item: buscar('item'),
        numero_processo: buscar('numero_processo'),
        contrato: buscar('Contrato', 'contrato'),
        status_do_contrato: buscar('status_do_contrato'),
        vencimento: buscar('vencimento'),
        depto_de_compras: buscar('depto_de_compras'),
        quantidade_unidade_estoque: buscar('quantidade_unidade_estoque'),
        preco_total_linha: buscar('preco_total_linha'),
        cond_pagamento: buscar('cond.pagamento', 'cond_pagamento'),
        departamento: buscar('departamento'),
        familia: buscar('família', 'familia'),
        gestao: buscar('gestão', 'gestao'),
        curva: buscar('curva'),
        acessos_gerentes: buscar('ACESSOS GERENTES', 'acessos_gerentes'),
        todas: idx
    };
}

function parseCsvLinha(linha) {
    const campos = [];
    let atual = '';
    let dentroAspas = false;

    for (let i = 0; i < linha.length; i++) {
        const c = linha[i];
        if (c === '"') {
            dentroAspas = !dentroAspas;
        } else if (c === ';' && !dentroAspas) {
            campos.push(atual);
            atual = '';
        } else {
            atual += c;
        }
    }
    campos.push(atual);
    return campos;
}

function valorColuna(partes, indice) {
    if (indice < 0 || indice >= partes.length) return '';
    return (partes[indice] || '').trim();
}

function normalizarRegistro(partes, mapa) {
    const status = valorColuna(partes, mapa.status_do_contrato);
    const campos = {};
    Object.entries(mapa.todas || {}).forEach(([nome, indice]) => {
        campos[nome] = valorColuna(partes, indice);
    });

    return {
        nota_fiscal: valorColuna(partes, mapa.nota_fiscal),
        estabelecimento: valorColuna(partes, mapa.estabelecimento),
        pn_fornecedor: valorColuna(partes, mapa.pn_fornecedor),
        descricao_fornecedor: valorColuna(partes, mapa.descricao_fornecedor),
        data_fiscal: valorColuna(partes, mapa.data_fiscal),
        item: valorColuna(partes, mapa.item),
        numero_processo: valorColuna(partes, mapa.numero_processo),
        contrato: valorColuna(partes, mapa.contrato),
        status_do_contrato: status,
        vencimento: valorColuna(partes, mapa.vencimento),
        depto_de_compras: valorColuna(partes, mapa.depto_de_compras),
        quantidade_unidade_estoque: parseNumero(valorColuna(partes, mapa.quantidade_unidade_estoque)),
        preco_total_linha: parseNumero(valorColuna(partes, mapa.preco_total_linha)),
        cond_pagamento: valorColuna(partes, mapa.cond_pagamento),
        departamento: valorColuna(partes, mapa.departamento),
        familia: valorColuna(partes, mapa.familia),
        gestao: valorColuna(partes, mapa.gestao),
        curva: valorColuna(partes, mapa.curva),
        acessos_gerentes: valorColuna(partes, mapa.acessos_gerentes),
        campos
    };
}

function parseNumero(valor) {
    if (valor === undefined || valor === null || valor === '') return 0;
    if (typeof valor === 'number') return Number.isFinite(valor) ? valor : 0;

    let texto = String(valor).trim().replace(/\s/g, '');
    const virgula = texto.lastIndexOf(',');
    const ponto = texto.lastIndexOf('.');

    if (virgula > -1 && ponto > -1) {
        texto = virgula > ponto
            ? texto.replace(/\./g, '').replace(',', '.')
            : texto.replace(/,/g, '');
    } else if (virgula > -1) {
        texto = texto.replace(',', '.');
    } else if (ponto > -1) {
        const depoisPonto = texto.slice(ponto + 1);
        if (depoisPonto.length === 3 && texto.indexOf('.') === ponto) {
            texto = texto.replace(/\./g, '');
        }
    }

    const n = parseFloat(texto);
    return Number.isNaN(n) ? 0 : n;
}

function parseDataFiscal(valor) {
    if (!valor) return null;

    const serial = parseNumero(valor);
    if (serial > 30000 && serial < 60000) {
        const epoch = new Date(1899, 11, 30);
        const data = new Date(epoch.getTime() + serial * 86400000);
        return Number.isNaN(data.getTime()) ? null : data;
    }

    const texto = String(valor).trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(texto)) {
        const d = new Date(texto + (texto.length === 10 ? 'T00:00:00' : ''));
        return Number.isNaN(d.getTime()) ? null : d;
    }

    const br = texto.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (br) return new Date(+br[3], +br[2] - 1, +br[1]);

    const d = new Date(texto);
    return Number.isNaN(d.getTime()) ? null : d;
}

function definirPeriodoPadrao() {
    if (!dados.length) return;
    const datas = dados.map(d => parseDataFiscal(d.data_fiscal)).filter(Boolean).sort((a, b) => a - b);
    if (!datas.length) return;
    periodoInicio = datas[0];
    periodoFim = datas[datas.length - 1];
    sincronizarInputsPeriodo();
}

function sincronizarInputsPeriodo() {
    document.getElementById('filter-date-start').value = periodoInicio
        ? periodoInicio.toISOString().split('T')[0] : '';
    document.getElementById('filter-date-end').value = periodoFim
        ? periodoFim.toISOString().split('T')[0] : '';
}

function aplicarPeriodo() {
    const start = document.getElementById('filter-date-start').value;
    const end = document.getElementById('filter-date-end').value;
    periodoInicio = start ? new Date(start + 'T00:00:00') : null;
    periodoFim = end ? new Date(end + 'T23:59:59') : null;
    aplicarFiltros();
}

function limparPeriodo() {
    definirPeriodoPadrao();
    aplicarFiltros();
}

function preencherFiltros() {
    preencherSelect('filter-estabelecimento', uniq('estabelecimento'));
    preencherSelect('filter-status', uniq('status_do_contrato'));
    preencherSelect('filter-departamento', uniq('departamento'));
    preencherSelect('filter-depto-compras', uniq('depto_de_compras'));
    preencherSelect('filter-gestao', uniq('gestao'));
    preencherSelect('filter-curva', uniq('curva'));
    preencherSelectAnalise('filter-analise-departamento', uniq('departamento'));
}

function preencherSelectAnalise(id, opcoes) {
    const select = document.getElementById(id);
    const atual = select.value;
    select.innerHTML = '<option value="__TODOS__">Todos os departamentos</option>';
    opcoes.forEach(op => {
        const opt = document.createElement('option');
        opt.value = op;
        opt.textContent = op;
        select.appendChild(opt);
    });

    if ([...select.options].some(o => o.value === atual)) {
        select.value = atual;
    } else {
        select.value = '__TODOS__';
    }
}

function uniq(campo) {
    return [...new Set(dados.map(d => d[campo]).filter(Boolean))].sort();
}

function preencherSelect(id, opcoes) {
    const select = document.getElementById(id);
    const atual = select.value;
    const primeira = select.options[0];
    select.innerHTML = '';
    select.appendChild(primeira);
    opcoes.forEach(op => {
        const opt = document.createElement('option');
        opt.value = op;
        opt.textContent = op;
        select.appendChild(opt);
    });
    if ([...select.options].some(o => o.value === atual)) select.value = atual;
}

function aplicarFiltros() {
    const estabelecimento = document.getElementById('filter-estabelecimento').value;
    const status = document.getElementById('filter-status').value;
    const departamento = document.getElementById('filter-departamento').value;
    const deptoCompras = document.getElementById('filter-depto-compras').value;
    const gestao = document.getElementById('filter-gestao').value;
    const curva = document.getElementById('filter-curva').value;
    const busca = document.getElementById('search-global').value.trim().toLowerCase();

    dadosFiltrados = dados.filter(d => {
        if (estabelecimento && d.estabelecimento !== estabelecimento) return false;
        if (status && d.status_do_contrato !== status) return false;
        if (departamento && d.departamento !== departamento) return false;
        if (deptoCompras && d.depto_de_compras !== deptoCompras) return false;
        if (gestao && d.gestao !== gestao) return false;
        if (curva && d.curva !== curva) return false;

        if (busca) {
            const texto = [
                d.nota_fiscal, d.estabelecimento, d.descricao_fornecedor,
                d.contrato, d.status_do_contrato, d.depto_de_compras,
                d.departamento, d.gestao, d.curva, d.numero_processo
            ].join(' ').toLowerCase();
            if (!texto.includes(busca)) return false;
        }

        if (periodoInicio || periodoFim) {
            const data = parseDataFiscal(d.data_fiscal);
            if (!data) return false;
            if (periodoInicio && data < periodoInicio) return false;
            if (periodoFim && data > periodoFim) return false;
        }

        return true;
    });

    dadosTabela = [...dadosFiltrados];
    paginaAtual = 1;
    atualizarChipsFiltros();
    atualizarDashboard();
    atualizarAnalise();
    atualizarTabelaContratos();
    atualizarCalendario();
    atualizarTabela();
}

function limparFiltros() {
    document.getElementById('filter-estabelecimento').value = '';
    document.getElementById('filter-status').value = '';
    document.getElementById('filter-departamento').value = '';
    document.getElementById('filter-depto-compras').value = '';
    document.getElementById('filter-gestao').value = '';
    document.getElementById('filter-curva').value = '';
    document.getElementById('search-global').value = '';
    definirPeriodoPadrao();
    aplicarFiltros();
}

function atualizarChipsFiltros() {
    const container = document.getElementById('active-filters');
    const chips = [];

    const add = (label, clearFn) => {
        const chip = document.createElement('span');
        chip.className = 'filter-chip';
        chip.innerHTML = `${label} <button type="button" aria-label="Remover filtro">×</button>`;
        chip.querySelector('button').addEventListener('click', clearFn);
        chips.push(chip);
    };

    const filtros = [
        ['filter-estabelecimento', 'Estabelecimento'],
        ['filter-status', 'Status'],
        ['filter-departamento', 'Departamento'],
        ['filter-depto-compras', 'Depto Compras'],
        ['filter-gestao', 'Gestão'],
        ['filter-curva', 'Curva']
    ];

    filtros.forEach(([id, rotulo]) => {
        const val = document.getElementById(id).value;
        if (val) {
            add(`${rotulo}: ${val}`, () => {
                document.getElementById(id).value = '';
                aplicarFiltros();
            });
        }
    });

    container.innerHTML = '';
    chips.forEach(c => container.appendChild(c));
    container.classList.toggle('hidden', chips.length === 0);
}

function toggleFiltroSelect(id, valor) {
    const select = document.getElementById(id);
    select.value = select.value === valor ? '' : valor;
    aplicarFiltros();
}

function atualizarDashboard() {
    atualizarKpis();
    atualizarGraficoPizza('estabelecimento', 'estabelecimento', 'chart-estabelecimento', 'legend-estabelecimento', 'filter-estabelecimento', CORES_ESTABELECIMENTO);
    atualizarGraficoBarras('departamentos', 'departamento', 'chart-departamentos', null, 'filter-departamento');
    atualizarGraficoBarras('deptoCompras', 'depto_de_compras', 'chart-depto-compras', 10, 'filter-depto-compras');
    atualizarGraficoBarras('gestao', 'gestao', 'chart-gestao', 10, 'filter-gestao');
    atualizarGraficoBarras('curva', 'curva', 'chart-curva', 10, 'filter-curva');
    atualizarGraficoMensal();
}

function atualizarKpis() {
    const total = dadosFiltrados.reduce((s, d) => s + d.preco_total_linha, 0);
    const contratosDistintos = new Set(
        dadosFiltrados.map(d => d.contrato).filter(c => c)
    ).size;
    const prazoMedio = calcularPrazoMedioPonderado(dadosFiltrados);

    document.getElementById('total-valor').textContent = formatarMoeda(total);
    document.getElementById('total-contratos').textContent = contratosDistintos.toLocaleString('pt-BR');
    document.getElementById('prazo-medio').textContent = formatarPrazo(prazoMedio);

    const statusMap = { Ativo: 0, 'Concluído': 0, Concluido: 0 };
    dadosFiltrados.forEach(d => {
        const chave = d.status_do_contrato;
        if (statusMap[chave] !== undefined) {
            statusMap[chave] += statusMode === 'valor' ? d.preco_total_linha : 1;
        } else if (chave.toLowerCase().includes('conclu')) {
            statusMap['Concluído'] += statusMode === 'valor' ? d.preco_total_linha : 1;
        } else if (chave.toLowerCase().includes('ativo')) {
            statusMap.Ativo += statusMode === 'valor' ? d.preco_total_linha : 1;
        }
    });

    const concluido = (statusMap['Concluído'] || 0) + (statusMap.Concluido || 0);
    const fmt = v => statusMode === 'valor' ? formatarMoeda(v) : v.toLocaleString('pt-BR');
    document.getElementById('status-ativo').textContent = fmt(statusMap.Ativo || 0);
    document.getElementById('status-concluido').textContent = fmt(concluido);
}

function setStatusMode(mode) {
    statusMode = mode;
    document.getElementById('btn-status-quantidade').classList.toggle('active', mode === 'quantidade');
    document.getElementById('btn-status-valor').classList.toggle('active', mode === 'valor');
    atualizarKpis();
}

function agruparPor(campo) {
    const mapa = {};
    dadosFiltrados.forEach(d => {
        const chave = d[campo] || 'Não informado';
        mapa[chave] = (mapa[chave] || 0) + d.preco_total_linha;
    });
    return Object.entries(mapa).sort((a, b) => b[1] - a[1]);
}

function atualizarGraficoPizza(chave, campo, canvasId, legendId, filtroId, paleta) {
    const agrupado = agruparPor(campo);
    const labels = agrupado.map(([k]) => k);
    const valores = agrupado.map(([, v]) => v);
    const cores = labels.map(l => paleta[l] || CORES_BARRAS[labels.indexOf(l) % CORES_BARRAS.length]);
    const total = valores.reduce((s, v) => s + v, 0);

    destruirChart(chave);
    const ctx = document.getElementById(canvasId).getContext('2d');
    charts[chave] = new Chart(ctx, {
        type: 'doughnut',
        data: { labels, datasets: [{ data: valores, backgroundColor: cores, borderWidth: 2, borderColor: '#fff' }] },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '42%',
            plugins: {
                legend: { display: false },
                datalabels: {
                    color: '#fff',
                    font: { weight: 'bold', size: 12 },
                    formatter: v => total > 0 ? `${((v / total) * 100).toFixed(1)}%` : '',
                    display: ctx => ctx.dataset.data[ctx.dataIndex] > 0
                },
                tooltip: {
                    callbacks: {
                        label: ctx => `${ctx.label}: ${formatarMoeda(ctx.raw)} (${total > 0 ? ((ctx.raw / total) * 100).toFixed(1) : 0}%)`
                    }
                }
            },
            onClick: (_, elements) => {
                if (!elements.length) return;
                toggleFiltroSelect(filtroId, labels[elements[0].index]);
            }
        }
    });

    const el = document.getElementById(legendId);
    el.innerHTML = labels.map((l, i) => {
        const pct = total > 0 ? ((valores[i] / total) * 100).toFixed(1) : 0;
        return `<div class="legend-item"><span class="legend-dot" style="background:${cores[i]}"></span>${esc(l)} — ${formatarMoeda(valores[i])} (${pct}%)</div>`;
    }).join('');
}

function atualizarGraficoBarras(chave, campo, canvasId, limite, filtroId) {
    const agrupado = limite ? agruparPor(campo).slice(0, limite) : agruparPor(campo);
    const labels = agrupado.map(([k]) => k);
    const valores = agrupado.map(([, v]) => v);
    const cores = labels.map((_, i) => CORES_BARRAS[i % CORES_BARRAS.length]);

    destruirChart(chave);
    const canvas = document.getElementById(canvasId);
    const wrap = canvas.parentElement;

    if (chave === 'departamentos') {
        wrap.style.height = '';
        wrap.style.flex = '1';
    } else {
        wrap.style.flex = '';
        wrap.style.height = Math.max(260, labels.length * 28) + 'px';
    }

    charts[chave] = new Chart(canvas.getContext('2d'), {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                data: valores,
                backgroundColor: cores,
                borderRadius: 6,
                borderSkipped: false
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                datalabels: { display: false },
                tooltip: {
                    callbacks: { label: ctx => formatarMoeda(ctx.raw) }
                }
            },
            scales: {
                x: {
                    beginAtZero: true,
                    ticks: {
                        callback: v => 'R$ ' + Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 0 })
                    },
                    grid: { color: 'rgba(0,0,0,0.05)' }
                },
                y: {
                    grid: { display: false },
                    ticks: { font: { size: 11 } }
                }
            },
            onClick: (_, elements) => {
                if (!elements.length) return;
                const label = labels[elements[0].index];
                if (label !== 'Não informado') {
                    toggleFiltroSelect(filtroId, label);
                }
            }
        }
    });
}

function atualizarGraficoMensal() {
    const meses = {};
    dadosFiltrados.forEach(d => {
        const data = parseDataFiscal(d.data_fiscal);
        if (!data) return;
        const chave = `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}`;
        if (!meses[chave]) meses[chave] = { valor: 0, registros: [] };
        meses[chave].valor += d.preco_total_linha;
        meses[chave].registros.push(d);
    });

    const chaves = Object.keys(meses).sort();
    const labels = chaves.map(k => {
        const [ano, mes] = k.split('-');
        const nome = new Date(+ano, +mes - 1).toLocaleString('pt-BR', { month: 'short', year: 'numeric' });
        return nome.charAt(0).toUpperCase() + nome.slice(1);
    });
    const valores = chaves.map(k => meses[k].valor);
    const prazos = chaves.map(k => calcularPrazoMedioPonderado(meses[k].registros));

    destruirChart('mensal');
    charts.mensal = new Chart(document.getElementById('chart-mensal').getContext('2d'), {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: 'Valor',
                    data: valores,
                    yAxisID: 'y',
                    borderColor: '#1b3d1b',
                    backgroundColor: 'rgba(76, 175, 80, 0.15)',
                    borderWidth: 3,
                    fill: true,
                    tension: 0.35,
                    pointRadius: 5,
                    pointBackgroundColor: '#1b3d1b',
                    pointBorderColor: '#fff',
                    pointBorderWidth: 2,
                    pointHoverRadius: 7,
                    order: 2
                },
                {
                    label: 'Prazo médio',
                    data: prazos,
                    yAxisID: 'yPrazo',
                    borderColor: '#f59e0b',
                    backgroundColor: '#f59e0b',
                    borderWidth: 3,
                    fill: false,
                    tension: 0.35,
                    pointRadius: 5,
                    pointBackgroundColor: '#f59e0b',
                    pointBorderColor: '#fff',
                    pointBorderWidth: 2,
                    pointHoverRadius: 7,
                    spanGaps: true,
                    order: 1
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                    align: 'end',
                    labels: {
                        usePointStyle: true,
                        pointStyle: 'circle',
                        boxWidth: 8,
                        padding: 16,
                        font: { weight: '600', size: 12 }
                    }
                },
                datalabels: { display: false },
                tooltip: {
                    callbacks: {
                        label: ctx => {
                            if (ctx.dataset.yAxisID === 'yPrazo') {
                                return `Prazo médio: ${formatarPrazo(ctx.raw)}`;
                            }
                            return `Valor: ${formatarMoeda(ctx.raw)}`;
                        }
                    }
                }
            },
            scales: {
                y: {
                    position: 'left',
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Valor (R$)',
                        color: '#1b3d1b',
                        font: { weight: '600', size: 12 }
                    },
                    ticks: {
                        color: '#1b3d1b',
                        callback: v => 'R$ ' + Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 0 })
                    },
                    grid: { color: 'rgba(0,0,0,0.05)' }
                },
                yPrazo: {
                    position: 'right',
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Prazo médio (dias)',
                        color: '#d97706',
                        font: { weight: '600', size: 12 }
                    },
                    ticks: {
                        color: '#d97706',
                        callback: v => `${Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} dias`
                    },
                    grid: { drawOnChartArea: false }
                },
                x: { grid: { display: false } }
            },
            onClick: (_, elements) => {
                if (!elements.length) return;
                const idx = elements[0].index;
                const [ano, mes] = chaves[idx].split('-');
                periodoInicio = new Date(+ano, +mes - 1, 1);
                periodoFim = new Date(+ano, +mes, 0, 23, 59, 59);
                sincronizarInputsPeriodo();
                aplicarFiltros();
            }
        }
    });
}

function destruirChart(nome) {
    if (charts[nome]) {
        charts[nome].destroy();
        charts[nome] = null;
    }
}

const ICONE_CAMERA = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>`;

function inicializarBotoesCopiarGrafico() {
    document.querySelectorAll('.chart-wrap canvas, .analise-pie-wrap canvas').forEach(canvas => {
        const wrap = canvas.parentElement;
        if (wrap.querySelector('.chart-copy-btn')) return;

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'chart-copy-btn';
        btn.title = 'Copiar imagem do gráfico';
        btn.setAttribute('aria-label', 'Copiar imagem do gráfico');
        btn.innerHTML = ICONE_CAMERA;
        btn.addEventListener('click', e => {
            e.preventDefault();
            e.stopPropagation();
            copiarGraficoParaClipboard(canvas, btn);
        });
        wrap.appendChild(btn);
    });
}

async function copiarGraficoParaClipboard(canvas, btn) {
    try {
        const blob = await new Promise((resolve, reject) => {
            canvas.toBlob(b => (b ? resolve(b) : reject(new Error('Falha ao gerar imagem'))), 'image/png');
        });

        if (navigator.clipboard?.write && window.ClipboardItem) {
            await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        } else {
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = 'grafico.png';
            link.click();
            URL.revokeObjectURL(url);
            alert('Seu navegador não suporta copiar imagens. O arquivo foi baixado.');
            return;
        }

        const tituloOriginal = btn.title;
        btn.classList.add('copied');
        btn.title = 'Copiado!';
        setTimeout(() => {
            btn.classList.remove('copied');
            btn.title = tituloOriginal;
        }, 2000);
    } catch (err) {
        console.error(err);
        alert('Não foi possível copiar a imagem. Verifique as permissões do navegador e tente novamente.');
    }
}

function atualizarTabela() {
    const inicio = (paginaAtual - 1) * PAGE_SIZE;
    const pagina = dadosTabela.slice(inicio, inicio + PAGE_SIZE);
    const tbody = document.getElementById('table-body');

    if (!pagina.length) {
        tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:32px;color:#64748b">Nenhum lançamento encontrado</td></tr>';
    } else {
        tbody.innerHTML = pagina.map(r => {
            const data = parseDataFiscal(r.data_fiscal);
            const dataFmt = data ? data.toLocaleDateString('pt-BR') : r.data_fiscal;
            const badge = badgeStatus(r.status_do_contrato);
            return `<tr>
                <td>${dataFmt}</td>
                <td>${esc(r.nota_fiscal)}</td>
                <td>${esc(r.descricao_fornecedor)}</td>
                <td>${esc(r.contrato)}</td>
                <td>${badge}</td>
                <td>${esc(r.depto_de_compras)}</td>
                <td>${esc(r.departamento)}</td>
                <td>${esc(r.gestao)}</td>
                <td class="valor-cell">${formatarMoeda(r.preco_total_linha)}</td>
            </tr>`;
        }).join('');
    }

    const totalPaginas = Math.max(1, Math.ceil(dadosTabela.length / PAGE_SIZE));
    document.getElementById('pagination-info').textContent =
        `Página ${paginaAtual} de ${totalPaginas} (${dadosTabela.length} registros)`;
    document.getElementById('btn-prev').disabled = paginaAtual <= 1;
    document.getElementById('btn-next').disabled = paginaAtual >= totalPaginas;
}

function badgeStatus(status) {
    const cls = (status || '').toLowerCase().includes('conclu') ? 'badge-concluido' : 'badge-ativo';
    return `<span class="badge ${cls}">${esc(status)}</span>`;
}

function filtrarTabela() {
    const busca = document.getElementById('search-lancamentos').value.toLowerCase();
    dadosTabela = dadosFiltrados.filter(d => {
        const texto = [
            d.data_fiscal, d.nota_fiscal, d.descricao_fornecedor, d.contrato,
            d.status_do_contrato, d.depto_de_compras, d.departamento, d.gestao,
            d.preco_total_linha
        ].join(' ').toLowerCase();
        return texto.includes(busca);
    });
    paginaAtual = 1;
    atualizarTabela();
}

function mudarPaginaTabela(delta) {
    const total = Math.ceil(dadosTabela.length / PAGE_SIZE);
    paginaAtual = Math.min(Math.max(1, paginaAtual + delta), total);
    atualizarTabela();
    document.querySelector('.table-scroll')?.scrollTo({ top: 0, behavior: 'smooth' });
}

function mudarPagina(pagina) {
    document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.page === pagina));
    document.getElementById('page-analise').classList.toggle('active', pagina === 'analise');
    document.getElementById('page-tabela').classList.toggle('active', pagina === 'tabela');
    document.getElementById('page-calendario').classList.toggle('active', pagina === 'calendario');
    document.getElementById('page-dashboard').classList.toggle('active', pagina === 'dashboard');
    document.getElementById('page-lancamentos').classList.toggle('active', pagina === 'lancamentos');

    const titulos = {
        dashboard: 'Contratos Metagal',
        analise: 'Análise por Departamento',
        tabela: 'Tabela de Contratos',
        calendario: 'Calendário de Vencimentos',
        lancamentos: 'Lançamentos'
    };
    document.querySelector('.page-title').textContent = titulos[pagina] || 'Contratos Metagal';

    if (pagina === 'lancamentos') atualizarTabela();
    if (pagina === 'analise') atualizarAnalise();
    if (pagina === 'tabela') atualizarTabelaContratos();
    if (pagina === 'calendario') atualizarCalendario();
}

function isLayoutMobile() {
    return window.matchMedia('(max-width: 900px)').matches;
}

function alternarMenuMobile() {
    const aberto = document.getElementById('sidebar').classList.contains('open');
    if (aberto) fecharMenuMobile();
    else abrirMenuMobile();
}

function abrirMenuMobile() {
    document.getElementById('sidebar').classList.add('open');
    document.getElementById('sidebar-backdrop')?.classList.add('visible');
    document.getElementById('btn-menu')?.setAttribute('aria-expanded', 'true');
    document.body.classList.add('sidebar-open');
}

function fecharMenuMobile() {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebar-backdrop')?.classList.remove('visible');
    document.getElementById('btn-menu')?.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('sidebar-open');
}

function obterDadosBaseAnalise() {
    const estabelecimento = document.getElementById('filter-estabelecimento').value;
    const status = document.getElementById('filter-status').value;
    const deptoCompras = document.getElementById('filter-depto-compras').value;
    const gestao = document.getElementById('filter-gestao').value;
    const curva = document.getElementById('filter-curva').value;
    const busca = document.getElementById('search-global').value.trim().toLowerCase();

    return dados.filter(d => {
        if (estabelecimento && d.estabelecimento !== estabelecimento) return false;
        if (status && d.status_do_contrato !== status) return false;
        if (deptoCompras && d.depto_de_compras !== deptoCompras) return false;
        if (gestao && d.gestao !== gestao) return false;
        if (curva && d.curva !== curva) return false;

        if (busca) {
            const texto = [
                d.nota_fiscal, d.estabelecimento, d.descricao_fornecedor,
                d.contrato, d.status_do_contrato, d.depto_de_compras,
                d.departamento, d.gestao, d.curva, d.numero_processo
            ].join(' ').toLowerCase();
            if (!texto.includes(busca)) return false;
        }

        if (periodoInicio || periodoFim) {
            const data = parseDataFiscal(d.data_fiscal);
            if (!data) return false;
            if (periodoInicio && data < periodoInicio) return false;
            if (periodoFim && data > periodoFim) return false;
        }

        return true;
    });
}

function agruparContratosComFornecedor(registros) {
    const mapa = {};
    registros.forEach(d => {
        const contrato = d.contrato || 'Não informado';
        if (contrato === 'Não informado') return;
        if (!mapa[contrato]) mapa[contrato] = { valor: 0, fornecedores: {} };
        mapa[contrato].valor += d.preco_total_linha;
        const forn = d.descricao_fornecedor || 'Não informado';
        mapa[contrato].fornecedores[forn] = (mapa[contrato].fornecedores[forn] || 0) + d.preco_total_linha;
    });

    return Object.entries(mapa).map(([contrato, info]) => {
        const fornecedor = Object.entries(info.fornecedores).sort((a, b) => b[1] - a[1])[0][0];
        return { contrato, fornecedor, valor: info.valor };
    }).sort((a, b) => b.valor - a.valor);
}

function obterMesesNoPeriodo(registros) {
    const meses = new Set();
    registros.forEach(d => {
        const data = parseDataFiscal(d.data_fiscal);
        if (!data) return;
        meses.add(`${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}`);
    });
    return meses.size || 1;
}

function obterRefPeriodo(registros) {
    const datas = registros.map(d => parseDataFiscal(d.data_fiscal)).filter(Boolean).sort((a, b) => b - a);
    if (!datas.length) return '—';
    const ref = datas[0];
    const mes = ref.toLocaleString('pt-BR', { month: 'long', year: 'numeric' });
    return `ref:${mes}`;
}

function formatarMoedaCompacta(v) {
    return 'R$ ' + Math.round(v).toLocaleString('pt-BR');
}

function calcularParetoFornecedores(registros) {
    const mapa = {};
    registros.forEach(d => {
        const forn = d.descricao_fornecedor || d.pn_fornecedor || '';
        if (!forn) return;
        mapa[forn] = (mapa[forn] || 0) + d.preco_total_linha;
    });

    const fornecedores = Object.values(mapa).sort((a, b) => b - a);
    const totalFornecedores = fornecedores.length;
    const faturamentoTotal = fornecedores.reduce((s, v) => s + v, 0);

    if (!totalFornecedores || faturamentoTotal <= 0) {
        return { totalFornecedores: 0, count80: 0, count20: 0 };
    }

    const limite80 = faturamentoTotal * 0.8;
    let acumulado = 0;
    let count80 = 0;

    for (const valor of fornecedores) {
        acumulado += valor;
        count80++;
        if (acumulado >= limite80) break;
    }

    return {
        totalFornecedores,
        count80,
        count20: totalFornecedores - count80
    };
}

function formatarParetoFornecedores(pareto) {
    if (!pareto.totalFornecedores) return 'Sem fornecedores no período filtrado.';

    const pct80 = ((pareto.count80 / pareto.totalFornecedores) * 100).toFixed(1);
    const pct20 = ((pareto.count20 / pareto.totalFornecedores) * 100).toFixed(1);

    return `De <strong>${pareto.totalFornecedores.toLocaleString('pt-BR')}</strong> fornecedores: `
        + `<strong>${pareto.count80.toLocaleString('pt-BR')}</strong> (${pct80}%) concentram 80% do faturamento · `
        + `<strong>${pareto.count20.toLocaleString('pt-BR')}</strong> (${pct20}%) compõem os 20% restantes`;
}

function obterDadosAnaliseDepartamento(dadosBase, departamento) {
    if (departamento === '__TODOS__') return dadosBase;
    return dadosBase.filter(d => d.departamento === departamento);
}

function atualizarAnalise() {
    const departamento = document.getElementById('filter-analise-departamento').value || '__TODOS__';
    const dadosBase = obterDadosBaseAnalise();
    const dadosDept = obterDadosAnaliseDepartamento(dadosBase, departamento);

    const valorTotalGeral = dadosBase.reduce((s, d) => s + d.preco_total_linha, 0);
    const valorDept = dadosDept.reduce((s, d) => s + d.preco_total_linha, 0);
    const pctTotal = valorTotalGeral > 0 ? (valorDept / valorTotalGeral) * 100 : 0;
    const qtdContratos = new Set(dadosDept.map(d => d.contrato).filter(Boolean)).size;
    const meses = obterMesesNoPeriodo(dadosDept);
    const valorMensal = valorDept / meses;
    const pareto = calcularParetoFornecedores(dadosDept);

    const titulo = departamento === '__TODOS__'
        ? 'REPORT GERAL'
        : `REPORT ${departamento}`;

    document.getElementById('analise-title').textContent = titulo;
    document.getElementById('analise-pct-total').textContent = `${Math.round(pctTotal)}%`;
    document.getElementById('analise-pareto-fornecedores').innerHTML = formatarParetoFornecedores(pareto);
    document.getElementById('analise-valor-total').textContent = formatarMoeda(valorMensal);
    document.getElementById('analise-qtd-contratos').textContent = qtdContratos.toLocaleString('pt-BR');
    document.getElementById('analise-ref').textContent = obterRefPeriodo(dadosDept);

    const contratos = agruparContratosComFornecedor(dadosDept);
    const top10 = contratos.slice(0, 10);
    const resto = contratos.slice(10).reduce((s, c) => s + c.valor, 0);

    const items = [...top10];
    if (resto > 0) {
        items.push({ contrato: 'OUTROS', fornecedor: `${contratos.length - 10} contratos restantes`, valor: resto });
    }

    const labels = items.map(i => i.contrato);
    const valores = items.map(i => i.valor);
    const total = valores.reduce((s, v) => s + v, 0);
    const cores = items.map((_, i) => CORES_BARRAS[i % CORES_BARRAS.length]);

    destruirChart('analiseContratos');
    const ctx = document.getElementById('chart-analise-contratos').getContext('2d');
    charts.analiseContratos = new Chart(ctx, {
        type: 'pie',
        data: { labels, datasets: [{ data: valores, backgroundColor: cores, borderWidth: 2, borderColor: '#fff' }] },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                datalabels: {
                    color: '#fff',
                    font: { weight: 'bold', size: 11 },
                    formatter: (v, ctx) => {
                        if (total <= 0) return '';
                        const pct = Math.round((v / total) * 100);
                        return `${formatarMoedaCompacta(v)} ; ${pct}%`;
                    },
                    display: ctx => ctx.dataset.data[ctx.dataIndex] > 0
                },
                tooltip: {
                    callbacks: {
                        label: ctx => {
                            const item = items[ctx.dataIndex];
                            const pct = total > 0 ? ((ctx.raw / total) * 100).toFixed(1) : 0;
                            return [
                                `${item.contrato} — ${item.fornecedor}`,
                                `${formatarMoeda(ctx.raw)} (${pct}%)`
                            ];
                        }
                    }
                }
            }
        }
    });

    const legendEl = document.getElementById('legend-analise-contratos');
    legendEl.innerHTML = items.map((item, i) => {
        const pct = total > 0 ? ((item.valor / total) * 100).toFixed(0) : 0;
        return `<div class="analise-legend-item">
            <span class="analise-legend-dot" style="background:${cores[i]}"></span>
            <div class="analise-legend-text">
                <span class="analise-legend-contrato">${esc(item.contrato)}</span>
                <span class="analise-legend-fornecedor">${esc(item.fornecedor)}</span>
            </div>
            <span class="analise-legend-valor">${formatarMoedaCompacta(item.valor)} (${pct}%)</span>
        </div>`;
    }).join('');
}

function formatarLabelMes(data) {
    const mes = data.toLocaleString('pt-BR', { month: 'short' })
        .replace('.', '')
        .trim()
        .slice(0, 3)
        .toLowerCase();
    const ano = String(data.getFullYear()).slice(-2);
    return `${mes}-${ano}`;
}

function obterMesesDoPeriodo(registros) {
    let inicio = periodoInicio;
    let fim = periodoFim;

    if (!inicio || !fim) {
        const datas = registros.map(d => parseDataFiscal(d.data_fiscal)).filter(Boolean).sort((a, b) => a - b);
        if (!datas.length) return [];
        inicio = inicio || datas[0];
        fim = fim || datas[datas.length - 1];
    }

    inicio = new Date(inicio.getFullYear(), inicio.getMonth(), 1);
    fim = new Date(fim.getFullYear(), fim.getMonth(), 1);

    const meses = [];
    let atual = new Date(inicio);
    while (atual <= fim) {
        const chave = `${atual.getFullYear()}-${String(atual.getMonth() + 1).padStart(2, '0')}`;
        meses.push({ chave, label: formatarLabelMes(atual), data: new Date(atual) });
        atual = new Date(atual.getFullYear(), atual.getMonth() + 1, 1);
    }
    return meses;
}

function obterLabelColunaTotal(meses) {
    if (!meses.length) return 'Total';
    const anos = [...new Set(meses.map(m => m.chave.split('-')[0]))];
    return anos.length === 1 ? anos[0] : 'Total';
}

function formatarValorCelula(valor) {
    if (!valor) return '-';
    return valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function escolherPrincipal(mapa) {
    const entrada = Object.entries(mapa).sort((a, b) => b[1] - a[1])[0];
    return entrada ? entrada[0] : '';
}

function montarDadosTabelaContratos(registros) {
    const meses = obterMesesDoPeriodo(registros);
    const mapa = {};

    registros.forEach(d => {
        const contrato = d.contrato;
        if (!contrato) return;

        const data = parseDataFiscal(d.data_fiscal);
        if (!data) return;

        const chaveMes = `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}`;
        if (!meses.some(m => m.chave === chaveMes)) return;

        if (!mapa[contrato]) {
            mapa[contrato] = {
                contrato,
                descricao_fornecedor: '',
                departamento: '',
                vencimento: '',
                meses: {},
                total: 0,
                fornecedorValor: {},
                departamentoValor: {},
                vencimentoValor: {}
            };
        }

        const linha = mapa[contrato];
        linha.meses[chaveMes] = (linha.meses[chaveMes] || 0) + d.preco_total_linha;
        linha.total += d.preco_total_linha;

        const forn = d.descricao_fornecedor || 'Não informado';
        linha.fornecedorValor[forn] = (linha.fornecedorValor[forn] || 0) + d.preco_total_linha;

        const dept = d.departamento || 'Não informado';
        linha.departamentoValor[dept] = (linha.departamentoValor[dept] || 0) + d.preco_total_linha;

        if (d.vencimento) {
            linha.vencimentoValor[d.vencimento] = (linha.vencimentoValor[d.vencimento] || 0) + 1;
        }
    });

    const linhas = Object.values(mapa).map(linha => {
        linha.descricao_fornecedor = escolherPrincipal(linha.fornecedorValor);
        linha.departamento = escolherPrincipal(linha.departamentoValor);
        linha.vencimento = formatarDataExibicao(escolherPrincipal(linha.vencimentoValor));
        delete linha.fornecedorValor;
        delete linha.departamentoValor;
        delete linha.vencimentoValor;
        return linha;
    }).sort((a, b) => b.total - a.total);

    const totaisMes = {};
    meses.forEach(m => { totaisMes[m.chave] = 0; });
    let totalGeral = 0;

    linhas.forEach(linha => {
        meses.forEach(m => {
            totaisMes[m.chave] += linha.meses[m.chave] || 0;
        });
        totalGeral += linha.total;
    });

    return { meses, linhas, totaisMes, totalGeral, labelTotal: obterLabelColunaTotal(meses) };
}

function formatarDataExibicao(valor) {
    if (!valor) return '';
    const data = parseDataFiscal(valor);
    return data ? data.toLocaleDateString('pt-BR') : valor;
}

function formatarPeriodoExibicao(meses) {
    if (!meses.length) return '—';
    const primeiro = meses[0].data.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    const ultimo = meses[meses.length - 1].data.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    return `${primeiro} a ${ultimo}`;
}

function atualizarTabelaContratos() {
    const thead = document.getElementById('tabela-contratos-head');
    const tbody = document.getElementById('tabela-contratos-body');
    const info = document.getElementById('tabela-periodo-info');
    const { meses, linhas, totaisMes, totalGeral, labelTotal } = montarDadosTabelaContratos(dadosFiltrados);

    info.textContent = `Período: ${formatarPeriodoExibicao(meses)}`;

    if (!meses.length) {
        thead.innerHTML = '';
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:32px;color:#64748b">Nenhum dado para o período selecionado</td></tr>';
        return;
    }

    const colsMes = meses.map(m =>
        `<th class="col-num">${esc(m.label)}</th>`
    ).join('');

    const totaisMesHtml = meses.map(m =>
        `<th class="col-num">${formatarValorCelula(totaisMes[m.chave])}</th>`
    ).join('');

    thead.innerHTML = `
        <tr class="tabela-total-row">
            <th class="col-fixa" colspan="4">TOTAL</th>
            ${totaisMesHtml}
            <th class="col-num col-total">${formatarValorCelula(totalGeral)}</th>
        </tr>
        <tr class="tabela-header-row">
            <th class="col-fixa">contrato</th>
            <th class="col-fixa-2">descricao_fornecedor</th>
            <th class="col-fixa-3">departamento</th>
            <th class="col-fixa-4">vencimento</th>
            ${colsMes}
            <th class="col-num">${esc(labelTotal)}</th>
        </tr>
    `;

    if (!linhas.length) {
        tbody.innerHTML = `<tr><td colspan="${meses.length + 5}" style="text-align:center;padding:32px;color:#64748b">Nenhum contrato encontrado</td></tr>`;
        return;
    }

    tbody.innerHTML = linhas.map(linha => {
        const cols = meses.map(m => {
            const valor = linha.meses[m.chave] || 0;
            const cls = valor ? 'col-num' : 'col-num col-vazio';
            return `<td class="${cls}">${formatarValorCelula(valor)}</td>`;
        }).join('');

        return `<tr>
            <td class="col-fixa">${esc(linha.contrato)}</td>
            <td class="col-fixa-2 col-fornecedor" title="${esc(linha.descricao_fornecedor)}">${esc(linha.descricao_fornecedor)}</td>
            <td class="col-fixa-3">${esc(linha.departamento)}</td>
            <td class="col-fixa-4 col-vencimento">${esc(linha.vencimento)}</td>
            ${cols}
            <td class="col-num col-total">${formatarValorCelula(linha.total)}</td>
        </tr>`;
    }).join('');
}

function exportarTabelaContratosXlsx() {
    const { meses, linhas, totaisMes, totalGeral, labelTotal } = montarDadosTabelaContratos(dadosFiltrados);
    if (!meses.length) return;

    const header = ['contrato', 'descricao_fornecedor', 'departamento', 'vencimento', ...meses.map(m => m.label), labelTotal];
    const totalRow = {
        contrato: 'TOTAL',
        descricao_fornecedor: '',
        departamento: '',
        vencimento: '',
        ...Object.fromEntries(meses.map(m => [m.label, totaisMes[m.chave] || 0])),
        [labelTotal]: totalGeral
    };

    const rows = linhas.map(linha => {
        const row = {
            contrato: linha.contrato,
            descricao_fornecedor: linha.descricao_fornecedor,
            departamento: linha.departamento,
            vencimento: linha.vencimento
        };
        meses.forEach(m => {
            row[m.label] = linha.meses[m.chave] || 0;
        });
        row[labelTotal] = linha.total;
        return row;
    });

    const ws = XLSX.utils.json_to_sheet([totalRow, ...rows], { header });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Contratos');
    XLSX.writeFile(wb, `tabela_contratos_${new Date().toISOString().split('T')[0]}.xlsx`);
}

const MESES_CALENDARIO = [
    'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
    'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'
];

function obterRegistrosSemFiltroPeriodo() {
    const estabelecimento = document.getElementById('filter-estabelecimento').value;
    const status = document.getElementById('filter-status').value;
    const departamento = document.getElementById('filter-departamento').value;
    const deptoCompras = document.getElementById('filter-depto-compras').value;
    const gestao = document.getElementById('filter-gestao').value;
    const curva = document.getElementById('filter-curva').value;
    const busca = document.getElementById('search-global').value.trim().toLowerCase();

    return dados.filter(d => {
        if (estabelecimento && d.estabelecimento !== estabelecimento) return false;
        if (status && d.status_do_contrato !== status) return false;
        if (departamento && d.departamento !== departamento) return false;
        if (deptoCompras && d.depto_de_compras !== deptoCompras) return false;
        if (gestao && d.gestao !== gestao) return false;
        if (curva && d.curva !== curva) return false;

        if (busca) {
            const texto = [
                d.nota_fiscal, d.estabelecimento, d.descricao_fornecedor,
                d.contrato, d.status_do_contrato, d.depto_de_compras,
                d.departamento, d.gestao, d.curva, d.numero_processo
            ].join(' ').toLowerCase();
            if (!texto.includes(busca)) return false;
        }

        return true;
    });
}

function isContratoAtivo(status) {
    return Boolean(status && String(status).toLowerCase().includes('ativo'));
}

function calcularValorMedioMensalContrato(registros) {
    if (!registros.length) return 0;
    const total = registros.reduce((s, d) => s + d.preco_total_linha, 0);
    const meses = new Set();
    registros.forEach(d => {
        const data = parseDataFiscal(d.data_fiscal);
        if (data) meses.add(`${data.getFullYear()}-${data.getMonth()}`);
    });
    return meses.size ? total / meses.size : 0;
}

function montarMapaValorMedioMensal(registros) {
    const mapa = {};
    registros.forEach(d => {
        if (!d.contrato) return;
        if (!mapa[d.contrato]) mapa[d.contrato] = [];
        mapa[d.contrato].push(d);
    });

    const resultado = {};
    Object.entries(mapa).forEach(([contrato, linhas]) => {
        resultado[contrato] = calcularValorMedioMensalContrato(linhas);
    });
    return resultado;
}

function montarPerfisContratosCalendario(registros) {
    const mapa = {};

    registros.forEach(d => {
        if (!d.contrato) return;

        if (!mapa[d.contrato]) {
            mapa[d.contrato] = { vencimentoValor: {}, statusValor: {}, fornecedorValor: {} };
        }

        if (d.vencimento) {
            mapa[d.contrato].vencimentoValor[d.vencimento] =
                (mapa[d.contrato].vencimentoValor[d.vencimento] || 0) + 1;
        }
        if (d.status_do_contrato) {
            mapa[d.contrato].statusValor[d.status_do_contrato] =
                (mapa[d.contrato].statusValor[d.status_do_contrato] || 0) + 1;
        }
        const forn = d.descricao_fornecedor || 'Não informado';
        mapa[d.contrato].fornecedorValor[forn] =
            (mapa[d.contrato].fornecedorValor[forn] || 0) + 1;
    });

    return Object.entries(mapa).map(([contrato, info]) => ({
        contrato,
        vencimento: parseDataFiscal(escolherPrincipal(info.vencimentoValor)),
        vencimentoExibicao: formatarDataExibicao(escolherPrincipal(info.vencimentoValor)),
        nome: escolherPrincipal(info.fornecedorValor),
        status: escolherPrincipal(info.statusValor)
    }));
}

function obterAnosVencimentoDisponiveis(perfis) {
    const anos = new Set();
    perfis.forEach(p => {
        if (p.vencimento && isContratoAtivo(p.status)) {
            anos.add(p.vencimento.getFullYear());
        }
    });
    return [...anos].sort((a, b) => b - a);
}

function montarDadosCalendario(ano) {
    const base = obterRegistrosSemFiltroPeriodo();
    const perfis = montarPerfisContratosCalendario(base);
    const valorMedioMap = montarMapaValorMedioMensal(dadosFiltrados);

    const meses = MESES_CALENDARIO.map((nome, idx) => ({
        nome,
        mes: idx,
        contratos: 0,
        valor: 0
    }));

    perfis.forEach(perfil => {
        if (!isContratoAtivo(perfil.status)) return;
        if (!perfil.vencimento) return;
        if (ano !== CALENDARIO_ANO_TODOS && perfil.vencimento.getFullYear() !== ano) return;

        const slot = meses[perfil.vencimento.getMonth()];
        slot.contratos += 1;
        slot.valor += valorMedioMap[perfil.contrato] || 0;
    });

    const totalContratos = meses.reduce((s, m) => s + m.contratos, 0);
    const totalValor = meses.reduce((s, m) => s + m.valor, 0);

    return { meses, totalContratos, totalValor };
}

function obterContratosCalendarioMes(ano, mesIndex) {
    const base = obterRegistrosSemFiltroPeriodo();
    const perfis = montarPerfisContratosCalendario(base);
    const valorMedioMap = montarMapaValorMedioMensal(dadosFiltrados);

    return perfis
        .filter(perfil => {
            if (!isContratoAtivo(perfil.status)) return false;
            if (!perfil.vencimento || perfil.vencimento.getMonth() !== mesIndex) return false;
            if (ano !== CALENDARIO_ANO_TODOS && perfil.vencimento.getFullYear() !== ano) return false;
            return true;
        })
        .map(perfil => ({
            contrato: perfil.contrato,
            nome: perfil.nome,
            vencimento: perfil.vencimentoExibicao,
            vencimentoData: perfil.vencimento,
            valorMedio: valorMedioMap[perfil.contrato] || 0
        }))
        .sort((a, b) => {
            if (calendarioOrdenacao === 'valor-desc') {
                const cmp = b.valorMedio - a.valorMedio;
                return cmp !== 0 ? cmp : a.contrato.localeCompare(b.contrato, 'pt-BR');
            }
            const ta = a.vencimentoData ? a.vencimentoData.getTime() : 0;
            const tb = b.vencimentoData ? b.vencimentoData.getTime() : 0;
            const cmp = ta - tb;
            return cmp !== 0 ? cmp : a.contrato.localeCompare(b.contrato, 'pt-BR');
        });
}

function renderizarBlocoMes(mes, selecionado) {
    const classe = selecionado ? 'calendario-mes-card calendario-mes-card-selected' : 'calendario-mes-card';
    return `<button type="button" class="${classe}" data-mes="${mes.mes}" aria-pressed="${selecionado}">
        <h3 class="calendario-mes-title">${esc(mes.nome)}</h3>
        <div class="calendario-mes-stats">
            <div class="calendario-mes-stat">
                <span class="calendario-mes-stat-label">Contratos</span>
                <span class="calendario-mes-stat-value">${mes.contratos.toLocaleString('pt-BR')}</span>
            </div>
            <div class="calendario-mes-stat">
                <span class="calendario-mes-stat-label">Valor</span>
                <span class="calendario-mes-stat-value calendario-mes-valor">${formatarValorCalendario(mes.valor)}</span>
            </div>
        </div>
    </button>`;
}

function renderizarTotalCalendario(totalContratos, totalValor) {
    return `<article class="calendario-total-card">
        <h3 class="calendario-mes-title calendario-total-title">Total</h3>
        <div class="calendario-mes-stats">
            <div class="calendario-mes-stat">
                <span class="calendario-mes-stat-label">Contratos</span>
                <span class="calendario-mes-stat-value">${totalContratos.toLocaleString('pt-BR')}</span>
            </div>
            <div class="calendario-mes-stat">
                <span class="calendario-mes-stat-label">Valor</span>
                <span class="calendario-mes-stat-value calendario-mes-valor">${formatarValorCalendario(totalValor)}</span>
            </div>
        </div>
    </article>`;
}

function obterTituloMesCalendario(ano, mesIndex) {
    const nomeMes = MESES_CALENDARIO[mesIndex];
    if (ano === CALENDARIO_ANO_TODOS) {
        return `Contratos em ${nomeMes} (todos os anos)`;
    }
    return `Contratos em ${nomeMes} de ${ano}`;
}

function renderizarListaContratosCalendario(ano, mesIndex) {
    const secao = document.getElementById('calendario-contratos');
    const titulo = document.getElementById('calendario-contratos-titulo');
    const tbody = document.getElementById('calendario-contratos-body');
    if (!secao || !titulo || !tbody) return;

    if (mesIndex === null || mesIndex === undefined) {
        secao.classList.add('hidden');
        tbody.innerHTML = '';
        return;
    }

    const selectOrdenacao = document.getElementById('calendario-ordenacao');
    if (selectOrdenacao) selectOrdenacao.value = calendarioOrdenacao;

    const contratos = obterContratosCalendarioMes(ano, mesIndex);
    titulo.textContent = obterTituloMesCalendario(ano, mesIndex);

    if (!contratos.length) {
        tbody.innerHTML = `<tr><td colspan="4" class="calendario-contratos-empty">Nenhum contrato encontrado para esta seleção.</td></tr>`;
    } else {
        tbody.innerHTML = contratos.map(c => `
            <tr>
                <td><strong>${esc(c.contrato)}</strong></td>
                <td>${esc(c.nome)}</td>
                <td>${esc(c.vencimento)}</td>
                <td class="valor-cell">${formatarValorCalendario(c.valorMedio)}</td>
            </tr>
        `).join('');
    }

    secao.classList.remove('hidden');
}

function atualizarCalendario() {
    const grid = document.getElementById('calendario-grid');
    const totalWrap = document.getElementById('calendario-total-wrap');
    const selectAno = document.getElementById('calendario-ano');
    if (!grid || !totalWrap || !selectAno) return;

    const anoAnterior = selectAno.value;
    const base = obterRegistrosSemFiltroPeriodo();
    const perfis = montarPerfisContratosCalendario(base);
    const anos = obterAnosVencimentoDisponiveis(perfis);

    const opcoesAno = [`<option value="${CALENDARIO_ANO_TODOS}">Todos os anos</option>`];
    if (anos.length) {
        opcoesAno.push(...anos.map(ano => `<option value="${ano}">${ano}</option>`));
    } else {
        opcoesAno.push(`<option value="${new Date().getFullYear()}">${new Date().getFullYear()}</option>`);
    }
    selectAno.innerHTML = opcoesAno.join('');

    const anoValido = anoAnterior === CALENDARIO_ANO_TODOS || anos.includes(Number(anoAnterior));
    const anoSelecionado = anoValido
        ? anoAnterior
        : (anos.length ? String(anos[0]) : CALENDARIO_ANO_TODOS);
    selectAno.value = anoSelecionado;

    const ano = anoSelecionado === CALENDARIO_ANO_TODOS
        ? CALENDARIO_ANO_TODOS
        : Number(anoSelecionado);

    const { meses, totalContratos, totalValor } = montarDadosCalendario(ano);

    grid.innerHTML = meses.map(mes =>
        renderizarBlocoMes(mes, calendarioMesSelecionado === mes.mes)
    ).join('');
    totalWrap.innerHTML = renderizarTotalCalendario(totalContratos, totalValor);

    renderizarListaContratosCalendario(ano, calendarioMesSelecionado);
}

function formatarValorCalendario(valor) {
    return Number(valor || 0).toLocaleString('pt-BR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

function exportarXlsx() {
    const rows = dadosFiltrados.map(d => {
        const data = parseDataFiscal(d.data_fiscal);
        return {
            'Data Fiscal': data ? data.toLocaleDateString('pt-BR') : d.data_fiscal,
            'Nota Fiscal': d.nota_fiscal,
            'Estabelecimento': d.estabelecimento,
            'Fornecedor': d.descricao_fornecedor,
            'Contrato': d.contrato,
            'Status': d.status_do_contrato,
            'Depto Compras': d.depto_de_compras,
            'Departamento': d.departamento,
            'Gestão': d.gestao,
            'Família': d.familia,
            'Curva': d.curva,
            'Valor': d.preco_total_linha
        };
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Lançamentos');
    XLSX.writeFile(wb, `contratos_metagal_${new Date().toISOString().split('T')[0]}.xlsx`);
}

function parsePrazoPagamento(cond) {
    if (!cond) return null;
    const texto = String(cond).trim().toUpperCase();
    if (!texto) return null;
    if (texto.includes('VISTA')) return 0;

    const numeros = texto.match(/\d+/g);
    if (!numeros?.length) return null;

    const dias = numeros.map(Number);
    return dias.reduce((s, n) => s + n, 0) / dias.length;
}

function calcularPrazoMedioPonderado(registros) {
    let somaPonderada = 0;
    let somaValor = 0;

    registros.forEach(d => {
        const prazo = parsePrazoPagamento(d.cond_pagamento);
        const valor = d.preco_total_linha;
        if (prazo === null || valor <= 0) return;
        somaPonderada += prazo * valor;
        somaValor += valor;
    });

    return somaValor > 0 ? somaPonderada / somaValor : null;
}

function formatarPrazo(dias) {
    if (dias === null) return '—';
    const valor = new Intl.NumberFormat('pt-BR', {
        maximumFractionDigits: 1,
        minimumFractionDigits: Number.isInteger(dias) ? 0 : 1
    }).format(dias);
    const unidade = Math.round(dias) === 1 ? 'dia' : 'dias';
    return `${valor} ${unidade}`;
}

function formatarMoeda(v) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
}

function esc(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
}
