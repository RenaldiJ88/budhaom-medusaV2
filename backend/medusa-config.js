import { loadEnv, Modules, defineConfig } from '@medusajs/utils';
import path from 'path';

// Cargamos las variables de entorno
loadEnv(process.env.NODE_ENV, process.cwd());

// --- CONFIGURACIÓN DE RUTAS ---
// Simplificamos: Asumimos que la estructura siempre requiere entrar a 'src'
// o que el compilador mantuvo la carpeta 'src' dentro del build.
const BASE_DIR = "src";

// Función helper para resolver rutas absolutas de forma segura
const resolveModule = (relativePath) => path.resolve(process.cwd(), BASE_DIR, relativePath);

console.log(`[Medusa Config] CWD: ${process.cwd()}`);
console.log(`[Medusa Config] Resolving modules relative to: ${path.resolve(process.cwd(), BASE_DIR)}`);
// -----------------------------

const medusaConfig = {
  projectConfig: {
    databaseUrl: process.env.DATABASE_URL,
    databaseLogging: false,
    redisUrl: process.env.REDIS_URL,
    workerMode: process.env.WORKER_MODE || "shared",
    http: {
      adminCors: process.env.ADMIN_CORS,
      authCors: process.env.AUTH_CORS,
      storeCors: process.env.STORE_CORS,
      jwtSecret: process.env.JWT_SECRET || "supersecret",
      cookieSecret: process.env.COOKIE_SECRET || "supersecret"
    },
    build: {
      rollupOptions: {
        external: ["@medusajs/dashboard"]
      }
    }
  },
  admin: {
    backendUrl: process.env.BACKEND_URL || "https://budhaom-production.up.railway.app",
    disable: process.env.SHOULD_DISABLE_ADMIN === "true",
  },
  modules: [
    // 1. Módulo de Archivos (MinIO o Local)
    {
      key: Modules.FILE,
      resolve: '@medusajs/file',
      options: {
        providers: [
          ...(process.env.MINIO_ENDPOINT && process.env.MINIO_ACCESS_KEY && process.env.MINIO_SECRET_KEY ? [{
            // Resolvemos hacia ./src/modules/minio-file
            resolve: resolveModule('modules/minio-file'),
            id: 'minio',
            options: {
              endPoint: process.env.MINIO_ENDPOINT,
              accessKey: process.env.MINIO_ACCESS_KEY,
              secretKey: process.env.MINIO_SECRET_KEY,
              bucket: process.env.MINIO_BUCKET 
            }
          }] : [{
            resolve: '@medusajs/file-local',
            id: 'local',
            options: {
              upload_dir: 'static',
              backend_url: `${process.env.BACKEND_URL || "http://localhost:9000"}/static`
            }
          }])
        ]
      }
    },
    // 2. Redis
    ...(process.env.REDIS_URL ? [{
      key: Modules.EVENT_BUS,
      resolve: '@medusajs/event-bus-redis',
      options: {
        redisUrl: process.env.REDIS_URL
      }
    },
    {
      key: Modules.WORKFLOW_ENGINE,
      resolve: '@medusajs/workflow-engine-redis',
      options: {
        redis: {
          url: process.env.REDIS_URL,
        }
      }
    }] : []),
    // 3. Notificaciones
    ...(process.env.SENDGRID_API_KEY || process.env.RESEND_API_KEY ? [{
      key: Modules.NOTIFICATION,
      resolve: '@medusajs/notification',
      options: {
        providers: [
          ...(process.env.SENDGRID_API_KEY ? [{
            resolve: '@medusajs/notification-sendgrid',
            id: 'sendgrid',
            options: {
              channels: ['email'],
              api_key: process.env.SENDGRID_API_KEY,
              from: process.env.SENDGRID_FROM_EMAIL,
            }
          }] : []),
          ...(process.env.RESEND_API_KEY ? [{
            // Resolvemos hacia ./src/modules/email-notifications
            resolve: resolveModule('modules/email-notifications'),
            id: 'resend',
            options: {
              channels: ['email'],
              api_key: process.env.RESEND_API_KEY,
              from: process.env.RESEND_FROM_EMAIL,
            },
          }] : []),
        ]
      }
    }] : []),
    
    // 4. PAGOS (MercadoPago + Stripe)
    {
      key: Modules.PAYMENT,
      resolve: '@medusajs/payment',
      options: {
        providers: [
          // MercadoPago
          {
            // Resolvemos hacia ./src/services/mercadopago-provider
            resolve: resolveModule('services/mercadopago-provider'),
            id: "mercadopago",
            options: {
              access_token: process.env.MERCADOPAGO_ACCESS_TOKEN,
              public_key: process.env.MERCADOPAGO_PUBLIC_KEY,
            },
          },
          // Stripe
          ...(process.env.STRIPE_API_KEY ? [{
            resolve: '@medusajs/payment-stripe',
            id: 'stripe',
            options: {
              apiKey: process.env.STRIPE_API_KEY,
              webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
            },
          }] : []),
        ],
      },
    }
  ],
  plugins: [
  ...(process.env.MEILISEARCH_HOST ? [{
      resolve: '@rokmohar/medusa-plugin-meilisearch',
      options: {
        config: {
          host: process.env.MEILISEARCH_HOST,
          apiKey: process.env.MEILISEARCH_ADMIN_KEY
        },
        settings: {
          products: {
            type: 'products',
            enabled: true,
            fields: ['id', 'title', 'description', 'handle', 'variant_sku', 'thumbnail'],
            indexSettings: {
              searchableAttributes: ['title', 'description', 'variant_sku'],
              displayedAttributes: ['id', 'handle', 'title', 'description', 'variant_sku', 'thumbnail'],
              filterableAttributes: ['id', 'handle'],
            },
            primaryKey: 'id',
          }
        }
      }
    }] : [])
  ]
};

console.log(JSON.stringify(medusaConfig, null, 2));
export default defineConfig(medusaConfig);