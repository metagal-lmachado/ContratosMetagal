const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { exec } = require('child_process');

const PORTA_INICIAL = 4173;
const RAIZ = __dirname;
const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.csv': 'text/csv; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.ico': 'image/x-icon',
    '.svg': 'image/svg+xml',
    '.json': 'application/json; charset=utf-8'
};

function usuarioWindows() {
    try {
        return String(os.userInfo().username || process.env.USERNAME || '').trim();
    } catch (_) {
        return String(process.env.USERNAME || '').trim();
    }
}

function gravarIdentidadeWindows() {
    const usuario = usuarioWindows();
    const dominio = String(process.env.USERDOMAIN || '').trim();
    const conteudo = [
        `window.USUARIO_WINDOWS = ${JSON.stringify(usuario)};`,
        `window.USUARIO_WINDOWS_DOMINIO = ${JSON.stringify(dominio)};`,
        ''
    ].join('\n');
    fs.writeFileSync(path.join(RAIZ, 'usuario-windows.js'), conteudo, 'utf8');
}

function caminhoSeguro(pathname) {
    const relativo = decodeURIComponent(pathname === '/' ? '/index.html' : pathname);
    const absoluto = path.normalize(path.join(RAIZ, relativo));
    const raiz = path.normalize(RAIZ + path.sep);
    if (absoluto !== path.normalize(RAIZ) && !absoluto.startsWith(raiz)) return null;
    return absoluto;
}

const servidor = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');

    if (url.pathname === '/api/whoami') {
        res.writeHead(200, {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store'
        });
        res.end(JSON.stringify({
            usuario: usuarioWindows(),
            dominio: String(process.env.USERDOMAIN || '').trim()
        }));
        return;
    }

    const arquivo = caminhoSeguro(url.pathname);
    if (!arquivo) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
    }

    fs.readFile(arquivo, (erro, dados) => {
        if (erro) {
            res.writeHead(404);
            res.end('Not found');
            return;
        }
        const ext = path.extname(arquivo).toLowerCase();
        res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
        res.end(dados);
    });
});

function abrirNavegador(endereco) {
    exec(`start "" "${endereco}"`);
}

function iniciar(porta) {
    servidor.once('error', erro => {
        if (erro.code === 'EADDRINUSE') {
            iniciar(porta + 1);
            return;
        }
        console.error(erro);
        process.exit(1);
    });

    servidor.listen(porta, '127.0.0.1', () => {
        gravarIdentidadeWindows();
        const endereco = `http://127.0.0.1:${porta}/`;
        console.log('Painel Contratos Metagal');
        console.log(`Endereco: ${endereco}`);
        console.log(`Usuario Windows: ${usuarioWindows()}`);
        console.log('Nao feche esta janela enquanto estiver usando o painel.');
        abrirNavegador(endereco);
    });
}

gravarIdentidadeWindows();
iniciar(PORTA_INICIAL);
