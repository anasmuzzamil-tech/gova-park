// Point d'entrée Render. Lance le vrai serveur (API + site). Si le serveur complet
// ne peut pas démarrer, le site statique reste en ligne pour que le déploiement ne tombe jamais.
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

process.env.NODE_ENV = process.env.NODE_ENV || 'production';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const bundle = path.join(__dirname, 'dist', 'server', 'boot.js');

async function startStaticOnly(reason) {
  console.error('[GOVAPARK] Mode site seul (sans API). Raison :', reason);
  const app = express();
  const pub = path.join(__dirname, 'dist', 'public');
  app.get('/health', (_req, res) => res.status(200).json({ status: 'ok', mode: 'static' }));
  app.use(express.static(pub));
  app.get('*', (_req, res) => res.sendFile(path.join(pub, 'index.html')));
  app.listen(process.env.PORT || 10000, '0.0.0.0', () => console.log('GOVAPARK (site seul) en ligne'));
}

if (!fs.existsSync(path.join(__dirname, 'dist', 'public', 'index.html'))) {
  console.error('[GOVAPARK] dist/public/index.html introuvable : le build du site a échoué.');
  process.exit(1);
}
if (!fs.existsSync(bundle)) {
  await startStaticOnly('dist/server/boot.js absent');
} else {
  try {
    process.env.PORT = process.env.PORT || '10000';
    await import(bundle);
  } catch (e) {
    await startStaticOnly(e && e.message ? e.message : String(e));
  }
}
