Chart.register(ChartDataLabels);

const PAGE_SIZE = 20;
const CSV_PATH = 'DADOS.csv';

const CORES_STATUS = {
    'Ativo': '#388e3c',
    'Concluído': '#1976d2',
    'Concluido': '#1976d2'
};
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

let dados = [];
let dadosFiltrados = [];
let dadosTabela = [];
let paginaAtual = 1;
let statusMode = 'quantidade';
let periodoInicio = null;
let periodoFim = null;
let charts = {};

document.addEventListener('DOMContentLoaded', async () => {
    inicializarEventos();
    await carregarDados();
});

function inicializarEventos() {
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', e => {
            e.preventDefault();
            mudarPagina(item.dataset.page);
        });
    });

    document.getElementById('btn-collapse-sidebar').addEventListener('click', () => {
        document.getElementById('sidebar').classList.toggle('collapsed');
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
    document.getElementById('btn-prev').addEventListener('click', () => mudarPaginaTabela(-1));
    document.getElementById('btn-next').addEventListener('click', () => mudarPaginaTabela(1));
}

async function carregarDados() {
    const badge = document.getElementById('loading-badge');
    badge.classList.remove('hidden');
    badge.textContent = 'Carregando...';

    try {
        const response = await fetch(CSV_PATH);
        if (!response.ok) {
            throw new Error(`Não foi possível carregar ${CSV_PATH}. Use um servidor local ou o botão CSV.`);
        }

        const buffer = await response.arrayBuffer();
        const texto = decodificarCsv(buffer);
        processarCsv(texto);
    } catch (erro) {
        console.error(erro);
        if (!dados.length) {
            alert(`${erro.message}\n\nDica: execute "npx serve ." na pasta do projeto ou use o botão CSV.`);
        }
    } finally {
        badge.classList.add('hidden');
        badge.textContent = 'Carregando...';
    }
}

function carregarCsvArquivo(file) {
    const badge = document.getElementById('loading-badge');
    badge.classList.remove('hidden');
    badge.textContent = 'Carregando...';

    const reader = new FileReader();
    reader.onload = e => {
        try {
            const texto = decodificarCsv(e.target.result);
            processarCsv(texto);
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

    dados = linhas.slice(1).map(linha => normalizarRegistro(parseCsvLinha(linha), mapa));
    dadosFiltrados = [...dados];
    dadosTabela = [...dados];

    console.log(`${dados.length} registros carregados de DADOS.csv`);
    preencherFiltros();
    definirPeriodoPadrao();
    aplicarFiltros();
}

function mapearColunas(cabecalho) {
    const normalizar = s => String(s || '').trim().toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    const idx = {};
    cabecalho.forEach((col, i) => {
        idx[normalizar(col)] = i;
    });

    const buscar = (...nomes) => {
        for (const nome of nomes) {
            const chave = normalizar(nome);
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
        depto_de_compras: buscar('depto_de_compras'),
        quantidade_unidade_estoque: buscar('quantidade_unidade_estoque'),
        preco_total_linha: buscar('preco_total_linha'),
        cond_pagamento: buscar('cond.pagamento', 'cond_pagamento'),
        departamento: buscar('departamento'),
        familia: buscar('família', 'familia'),
        gestao: buscar('gestão', 'gestao'),
        curva: buscar('curva')
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
        depto_de_compras: valorColuna(partes, mapa.depto_de_compras),
        quantidade_unidade_estoque: parseNumero(valorColuna(partes, mapa.quantidade_unidade_estoque)),
        preco_total_linha: parseNumero(valorColuna(partes, mapa.preco_total_linha)),
        cond_pagamento: valorColuna(partes, mapa.cond_pagamento),
        departamento: valorColuna(partes, mapa.departamento),
        familia: valorColuna(partes, mapa.familia),
        gestao: valorColuna(partes, mapa.gestao),
        curva: valorColuna(partes, mapa.curva)
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
    atualizarGraficoPizza('status', 'status_do_contrato', 'chart-status', 'legend-status', 'filter-status', CORES_STATUS);
    atualizarGraficoPizza('estabelecimento', 'estabelecimento', 'chart-estabelecimento', 'legend-estabelecimento', 'filter-estabelecimento', CORES_ESTABELECIMENTO);
    atualizarGraficoBarras('departamentos', 'departamento', 'chart-departamentos', 10, 'filter-departamento');
    atualizarGraficoBarras('deptoCompras', 'depto_de_compras', 'chart-depto-compras', 10, 'filter-depto-compras');
    atualizarGraficoBarras('gestao', 'gestao', 'chart-gestao', 10, 'filter-gestao');
    atualizarGraficoBarras('curva', 'curva', 'chart-curva', 10, 'filter-curva');
    atualizarGraficoMensal();
}

function atualizarKpis() {
    const total = dadosFiltrados.reduce((s, d) => s + d.preco_total_linha, 0);
    const qtd = dadosFiltrados.length;
    const contratosDistintos = new Set(
        dadosFiltrados.map(d => d.contrato).filter(c => c)
    ).size;
    const ticket = qtd > 0 ? total / qtd : 0;

    document.getElementById('total-valor').textContent = formatarMoeda(total);
    document.getElementById('total-contratos').textContent = contratosDistintos.toLocaleString('pt-BR');
    document.getElementById('ticket-medio').textContent = formatarMoeda(ticket);

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
    const agrupado = agruparPor(campo).slice(0, limite);
    const labels = agrupado.map(([k]) => k);
    const valores = agrupado.map(([, v]) => v);
    const cores = labels.map((_, i) => CORES_BARRAS[i % CORES_BARRAS.length]);

    destruirChart(chave);
    const canvas = document.getElementById(canvasId);
    const altura = Math.max(260, labels.length * 28);
    canvas.parentElement.style.height = altura + 'px';

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
        meses[chave] = (meses[chave] || 0) + d.preco_total_linha;
    });

    const chaves = Object.keys(meses).sort();
    const labels = chaves.map(k => {
        const [ano, mes] = k.split('-');
        const nome = new Date(+ano, +mes - 1).toLocaleString('pt-BR', { month: 'short', year: 'numeric' });
        return nome.charAt(0).toUpperCase() + nome.slice(1);
    });
    const valores = chaves.map(k => meses[k]);

    destruirChart('mensal');
    charts.mensal = new Chart(document.getElementById('chart-mensal').getContext('2d'), {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: 'Valor',
                data: valores,
                borderColor: '#1b3d1b',
                backgroundColor: 'rgba(76, 175, 80, 0.15)',
                borderWidth: 3,
                fill: true,
                tension: 0.35,
                pointRadius: 5,
                pointBackgroundColor: '#1b3d1b',
                pointBorderColor: '#fff',
                pointBorderWidth: 2,
                pointHoverRadius: 7
            }]
        },
        options: {
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
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: v => 'R$ ' + Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 0 })
                    },
                    grid: { color: 'rgba(0,0,0,0.05)' }
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
    document.getElementById('page-dashboard').classList.toggle('active', pagina === 'dashboard');
    document.getElementById('page-lancamentos').classList.toggle('active', pagina === 'lancamentos');
    if (pagina === 'lancamentos') atualizarTabela();
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

function formatarMoeda(v) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
}

function esc(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
}
