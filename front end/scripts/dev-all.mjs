import path from "node:path";
import process from "node:process";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { createServer as createViteServer } from "vite";
import { spawn } from "node:child_process";

// Utiliser fileURLToPath pour gérer correctement les chemins avec espaces
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const PATH_FALLBACK = "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin";

const stopFns = [];
const childProcesses = [];

process.on("SIGINT", async () => {
  await stopAll();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await stopAll();
  process.exit(0);
});

async function stopAll() {
  console.log("[dev-all] Arrêt de tous les processus...");
  
  // Arrêter tous les processus enfants
  for (const child of childProcesses) {
    try {
      if (child && !child.killed) {
        child.kill('SIGTERM');
        // Attendre un peu pour que le processus se termine proprement
        await new Promise((resolve) => setTimeout(resolve, 500));
        if (!child.killed) {
          child.kill('SIGKILL');
        }
      }
    } catch (e) {
      // ignore
    }
  }
  
  // Exécuter les fonctions d'arrêt
  for (const fn of stopFns) {
    try {
      await fn();
    } catch (e) {
      // ignore
    }
  }
}

function findStripeCLI() {
  const possiblePaths = [
    '/usr/local/bin/stripe',
    '/opt/homebrew/bin/stripe',
    '/usr/bin/stripe',
    'stripe', // Dans le PATH
  ];
  
  for (const stripePath of possiblePaths) {
    try {
      if (fs.existsSync(stripePath) || stripePath === 'stripe') {
        return stripePath;
      }
    } catch (e) {
      // continue
    }
  }
  
  return null;
}

function startStripeListen() {
  return new Promise((resolve, reject) => {
    const stripePath = findStripeCLI();
    
    if (!stripePath) {
      console.warn("[dev-all] ⚠️  Stripe CLI non trouvé. Les webhooks ne fonctionneront pas.");
      console.warn("[dev-all]    Installez Stripe CLI: https://stripe.com/docs/stripe-cli");
      resolve(null);
      return;
    }
    
    console.log("[dev-all] 🔄 Démarrage de Stripe CLI (stripe listen)...");
    
    const stripeListen = spawn(stripePath, [
      'listen',
      '--forward-to',
      'localhost:5174/api/stripe/webhook',
    ], {
      env: {
        ...process.env,
        PATH: `${PATH_FALLBACK}:${process.env.PATH || ''}`,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    
    childProcesses.push(stripeListen);
    
    let webhookSecret = null;
    let hasStarted = false;
    
    stripeListen.stdout.on('data', (data) => {
      const output = data.toString();
      process.stdout.write(`[stripe] ${output}`);
      
      // Extraire le webhook secret depuis la sortie de stripe listen
      const secretMatch = output.match(/whsec_[a-zA-Z0-9]+/);
      if (secretMatch && !webhookSecret) {
        webhookSecret = secretMatch[0];
        console.log(`[dev-all] 🔑 Webhook secret détecté: ${webhookSecret.substring(0, 20)}...`);
        console.log(`[dev-all] ⚠️  Assurez-vous que STRIPE_WEBHOOK_SECRET dans .env.local correspond à ce secret`);
      }
      
      // Détecter quand stripe listen est prêt
      if (output.includes('Ready') || output.includes('ready') || output.includes('Listening')) {
        if (!hasStarted) {
          hasStarted = true;
          console.log("[dev-all] ✅ Stripe CLI est prêt et écoute les webhooks");
          resolve(stripeListen);
        }
      }
    });
    
    stripeListen.stderr.on('data', (data) => {
      const output = data.toString();
      process.stderr.write(`[stripe] ${output}`);
      
      // Détecter les erreurs d'authentification
      if (output.includes('not authenticated') || output.includes('login')) {
        console.error("[dev-all] ❌ Stripe CLI n'est pas authentifié");
        console.error("[dev-all]    Exécutez: stripe login");
        reject(new Error('Stripe CLI not authenticated'));
      }
    });
    
    stripeListen.on('error', (err) => {
      console.error("[dev-all] ❌ Erreur lors du lancement de Stripe CLI:", err.message);
      reject(err);
    });
    
    stripeListen.on('exit', (code, signal) => {
      if (code !== null && code !== 0) {
        console.warn(`[dev-all] ⚠️  Stripe CLI s'est arrêté avec le code ${code}`);
      } else if (signal) {
        console.log(`[dev-all] Stripe CLI arrêté (signal: ${signal})`);
      }
    });
    
    // Timeout pour détecter si stripe listen démarre
    setTimeout(() => {
      if (!hasStarted) {
        console.warn("[dev-all] ⚠️  Stripe CLI semble démarrer mais n'a pas confirmé qu'il est prêt");
        console.warn("[dev-all]    Vérifiez manuellement que stripe listen fonctionne");
        // On résout quand même pour ne pas bloquer le démarrage
        resolve(stripeListen);
      }
    }, 5000);
  });
}

(async () => {
  // AI proxy (inclut Stripe + analyse bordereaux) dans le même process
  console.log("[dev-all] Starting AI proxy (Stripe + OCR) on port 5174...");
  await import("../server/ai-proxy.js");
  
  // Attendre que le serveur backend soit complètement prêt
  console.log("[dev-all] Attente que le backend soit prêt...");
  await new Promise((resolve) => setTimeout(resolve, 2000)); // Augmenter à 2 secondes
  
  // Lancer Stripe CLI en arrière-plan pour les webhooks
  try {
    await startStripeListen();
  } catch (err) {
    console.warn("[dev-all] ⚠️  Impossible de lancer Stripe CLI:", err.message);
    console.warn("[dev-all]    Les webhooks ne fonctionneront pas. Lancez manuellement:");
    console.warn("[dev-all]    stripe listen --forward-to localhost:5174/api/stripe/webhook");
  }
  
  // Vérifier que le backend répond avec plusieurs tentatives
  let backendReady = false;
  for (let i = 0; i < 5; i++) {
    try {
      const testResponse = await fetch("http://localhost:5174/api/test");
      if (testResponse.ok) {
        const data = await testResponse.json();
        console.log("[dev-all] ✅ Backend vérifié et prêt (tentative", i + 1, ")");
        backendReady = true;
        break;
      } else {
        console.warn("[dev-all] ⚠️ Backend répond mais avec erreur:", testResponse.status, "(tentative", i + 1, ")");
      }
    } catch (err) {
      console.warn("[dev-all] ⚠️ Tentative", i + 1, "échouée:", err.message);
      if (i < 4) {
        await new Promise((resolve) => setTimeout(resolve, 500)); // Attendre 500ms avant de réessayer
      }
    }
  }
  
  if (!backendReady) {
    console.warn("[dev-all] ⚠️ Backend non accessible après 5 tentatives, continuer quand même...");
  }

  // Vite dev server via API (évite spawn npm)
  console.log("[dev-all] Starting Vite dev server on port 8080...");
  console.log("[dev-all] Project root:", projectRoot);
  
  // Laisser Vite charger la configuration depuis vite.config.ts
  // qui contient déjà la configuration du proxy
  const vite = await createViteServer({
    root: projectRoot,
    // Vite chargera automatiquement vite.config.ts depuis projectRoot
    // qui contient déjà la configuration du proxy /api -> http://localhost:5174
    server: {
      // S'assurer que le proxy est bien configuré
      proxy: {
        "/api": {
          target: "http://localhost:5174",
          changeOrigin: true,
          secure: false,
          ws: true,
        },
        "/auth": {
          target: "http://localhost:5174",
          changeOrigin: true,
          secure: false,
        },
        "/stripe": {
          target: "http://localhost:5174",
          changeOrigin: true,
          secure: false,
        },
        "/webhooks": {
          target: "http://localhost:5174",
          changeOrigin: true,
          secure: false,
        },
      },
    },
  });
  await vite.listen();
  stopFns.push(() => vite.close());

  const info = vite.resolvedUrls?.local?.[0] || "http://localhost:8080";
  console.log(`[dev-all] Vite ready on ${info}`);
  console.log(`[dev-all] ✅ Proxy configuré: /api -> http://localhost:5174`);
})().catch((err) => {
  console.error("[dev-all] bootstrap error", err);
  process.exit(1);
});

