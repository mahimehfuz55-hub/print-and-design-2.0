  {
    "name": "print-house-app",
    "version": "1.0.0",
    "private": true,
    "scripts": {
      "dev": "next dev",
      "build": "next build",
      "start": "next start"
    },
    "dependencies": {
      "next": "^14.2.5",
      "react": "^18.3.1",
      "react-dom": "^18.3.1",
      "zod": "^3.23.8"
    },
    "devDependencies": {
      "@types/node": "^20.14.0",
      "@types/react": "^18.3.3",
      "@types/react-dom": "^18.3.0",
      "typescript": "^5.5.0"
    }
  }

  tsconfig.json

  {
    "compilerOptions": {
      "lib": ["dom", "dom.iterable", "esnext"],
      "allowJs": true,
      "skipLibCheck": true,
      "strict": true,
      "noEmit": true,
      "esModuleInterop": true,
      "module": "esnext",
      "moduleResolution": "bundler",
      "resolveJsonModule": true,
      "isolatedModules": true,
      "jsx": "preserve",
      "incremental": true,
      "plugins": [{ "name": "next" }],
      "paths": { "@/*": ["./src/*"] }
    },
    "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
    "exclude": ["node_modules"]
  }

  next.config.js

  /** @type {import('next').NextConfig} */
  const nextConfig = {};
  module.exports = nextConfig;

  src/middleware.ts

  import { NextRequest, NextResponse } from 'next/server';

  const RATE_LIMIT_WINDOW = 60_000; // 1 minute
  const RATE_LIMIT_MAX = 30;

  const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

  function getRateLimitKey(request: NextRequest): string {
    return request.ip ?? request.headers.get('x-forwarded-for') ?? 'unknown';
  }

  function isRateLimited(key: string): boolean {
    const now = Date.now();
    const record = rateLimitMap.get(key);

    if (!record || now > record.resetTime) {
      rateLimitMap.set(key, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
      return false;
    }

    if (record.count >= RATE_LIMIT_MAX) {
      return true;
    }

    record.count += 1;
    return false;
  }

  const securityHeaders = {
    'X-DNS-Prefetch-Control': 'preconnect',
    'X-Frame-Options': 'DENY',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'X-XSS-Protection': '1; mode=block',
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
    'Content-Security-Policy':
      "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https://*.google-analytics.com;",
  };

  export function middleware(request: NextRequest) {
    const response = NextResponse.next();

    if (request.nextUrl.pathname.startsWith('/api/')) {
      const rateLimitKey = getRateLimitKey(request);

      if (isRateLimited(rateLimitKey)) {
        return new NextResponse('Too Many Requests', { status: 429 });
      }

      if (request.method === 'POST') {
        const contentType = request.headers.get('content-type');
        if (!contentType?.includes('application/json')) {
          return new NextResponse('Invalid Content-Type', { status: 415 });
        }
      }
    }

    Object.entries(securityHeaders).forEach(([key, value]) => {
      response.headers.set(key, value);
    });

    return response;
  }

  export const config = {
    matcher: ['/api/:path*', '/((?!_next/static|_next/image|favicon.ico).*)'],
  };

  src/lib/validation/schemas.ts

  import { z } from 'zod';

  export const contactFormSchema = z.object({
    name: z
      .string()
      .min(2, 'Name must be at least 2 characters')
      .max(100, 'Name must be less than 100 characters')
      .regex(
        /^[a-zA-Z\s'-]+$/,
        "Name can only contain letters, spaces, hyphens, and apostrophes"
      )
      .transform((val) => val.trim()),

    email: z
      .string()
      .email('Please enter a valid email address')
      .max(255, 'Email must be less than 255 characters'),

    phone: z.string().regex(/^\+?[1-9]\d{1,14}$/, 'Please enter a valid phone number').optional(),

    company: z
      .string()
      .max(100, 'Company name must be less than 100 characters')
      .transform((val) => val.trim())
      .optional(),

    message: z
      .string()
      .min(10, 'Message must be at least 10 characters')
      .max(5000, 'Message must be less than 5000 characters')
      .transform((val) => val.trim()),
  }).refine((data) => data.email || data.phone, {
    message: 'Please provide at least one contact method (email or phone)',
    path: ['email'],
  });

  export const quoteRequestSchema = z.object({
    step1: z.object({
      serviceType: z.enum(
        ['signage', 'stickers', 'branding', 'packaging', 'vehicle-wraps', 'large-format'],
        { required_error: 'Please select a service type' }
      ),
      projectType: z.enum(['personal', 'business', 'corporate', 'event'], {
        required_error: 'Please select a project type',
      }),
    }),

    step2: z.object({
      dimensions: z.object({
        width: z.number().positive('Width must be positive').max(100, 'Maximum width is 100m'),
        height: z.number().positive('Height must be positive').max(100, 'Maximum height is 100m'),
        unit: z.enum(['cm', 'm', 'ft']),
      }),
      quantity: z
        .number()
        .int()
        .positive('Quantity must be at least 1')
        .max(10000, 'Maximum quantity is 10,000'),
      material: z.string().min(1, 'Please select a material').max(200, 'Material name too long'),
      colors: z.string().min(1, 'Please specify color requirements').max(500, 'Color description too long'),
    }),

    step3: z.object({
      fileUpload: z.any().optional(),
      customDesign: z.boolean().optional(),
      brandGuidelines: z.string().url('Please enter a valid URL').optional().or(z.literal('')),
      specialInstructions: z.string().max(2000, 'Instructions are too long').optional(),
    }),

    step4: z.object({
      preferredDate: z.string().min(1, 'Please select a delivery date'),
      installationNeeded: z.boolean().optional(),
      budgetRange: z.enum(
        ['0-500', '500-1000', '1000-5000', '5000-10000', '10000+'],
        { required_error: 'Please select a budget range' }
      ),
      priority: z.enum(['low', 'medium', 'high', 'urgent'], {
        required_error: 'Please select a priority level',
      }),
    }),

    step5: z.object({
      name: z.string().min(2, 'Name must be at least 2 characters').max(100, 'Name too long'),
      email: z.string().email('Please enter a valid email address'),
      phone: z.string().regex(/^\+?[1-9]\d{1,14}$/, 'Please enter a valid phone number'),
      company: z.string().max(100, 'Company name too long').optional(),
      termsAccepted: z.literal(true, {
        errorMap: () => ({ message: 'You must accept the terms and conditions' }),
      }),
    }),
  });

  export const rateLimitSchema = z.object({
    ip: z.string().ip('Invalid IP address'),
    path: z.string().url('Invalid URL path'),
    method: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']),
    timestamp: z.number().positive('Timestamp must be positive'),
  });

  src/app/api/contact/route.ts

  import { NextRequest, NextResponse } from 'next/server';
  import { contactFormSchema } from '@/lib/validation/schemas';

  export async function POST(request: NextRequest) {
    try {
      const body = await request.json();
      const validated = contactFormSchema.parse(body);

      return NextResponse.json(
        { success: true, message: 'Message received successfully', data: validated },
        { status: 201 }
      );
    } catch (error) {
      if (error instanceof Error) {
        return NextResponse.json({ success: false, message: error.message }, { status: 400 });
      }
      return NextResponse.json(
        { success: false, message: 'Internal server error' },
        { status: 500 }
      );
    }
  }

  src/app/api/quote/route.ts

  import { NextRequest, NextResponse } from 'next/server';
  import { quoteRequestSchema } from '@/lib/validation/schemas';

  export async function POST(request: NextRequest) {
    try {
      const body = await request.json();
      const validated = quoteRequestSchema.parse(body);

      return NextResponse.json(
        { success: true, message: 'Quote request received successfully', data: validated },
        { status: 201 }
      );
    } catch (error) {
      if (error instanceof Error) {
        return NextResponse.json({ success: false, message: error.message }, { status: 400 });
      }
      return NextResponse.json(
        { success: false, message: 'Internal server error' },
        { status: 500 }
      );
    }
  }

  src/app/globals.css

  @tailwind base;
  @tailwind components;
  @tailwind utilities;

  :root {
    --primary: #1a1a2e;
    --secondary: #16213e;
    --accent: #e94560;
    --accent-hover: #c73a52;
    --bg: #0f0f1a;
    --card: #1a1a2e;
    --text: #e0e0e0;
    --text-muted: #a0a0b0;
    --success: #2ecc71;
    --error: #e74c3c;
    --border: #2a2a4a;
    --radius: 12px;
  }

  * {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }

  html {
    scroll-behavior: smooth;
  }

  body {
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    background: var(--bg);
    color: var(--text);
    line-height: 1.6;
    min-height: 100vh;
  }

  /* ── Layout ──────────────────────────── */
  .app {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
  }

  main {
    flex: 1;
    max-width: 1200px;
    margin: 0 auto;
    padding: 2rem 1.5rem;
    width: 100%;
  }

  /* ── Header ──────────────────────────── */
  .header {
    background: var(--card);
    border-bottom: 1px solid var(--border);
    padding: 1rem 1.5rem;
    position: sticky;
    top: 0;
    z-index: 100;
    backdrop-filter: blur(10px);
  }

  .header-inner {
    max-width: 1200px;
    margin: 0 auto;
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 1rem;
  }

  .logo {
    font-size: 1.5rem;
    font-weight: 800;
    color: var(--accent);
    letter-spacing: -0.5px;
  }

  .logo span {
    color: var(--text);
  }

  .nav {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .nav a {
    color: var(--text-muted);
    text-decoration: none;
    padding: 0.5rem 1rem;
    border-radius: 8px;
    transition: all 0.2s;
    font-size: 0.9rem;
  }

  .nav a:hover {
    color: var(--text);
    background: rgba(233, 69, 96, 0.1);
  }

  /* ── Hero ────────────────────────────── */
  .hero {
    text-align: center;
    padding: 4rem 1rem;
    background: linear-gradient(135deg, var(--primary) 0%, var(--secondary) 100%);
    border-radius: var(--radius);
    margin-bottom: 3rem;
    position: relative;
    overflow: hidden;
  }

  .hero::before {
    content: '';
    position: absolute;
    top: -50%;
    left: -50%;
    width: 200%;
    height: 200%;
    background: radial-gradient(circle, rgba(233, 69, 96, 0.1) 0%, transparent 50%);
    animation: pulse 4s ease-in-out infinite;
  }

  @keyframes pulse {
    0%, 100% { transform: scale(1); opacity: 0.5; }
    50% { transform: scale(1.1); opacity: 0.8; }
  }

  .hero h1 {
    font-size: clamp(2rem, 5vw, 3.5rem);
    font-weight: 800;
    margin-bottom: 1rem;
    position: relative;
    line-height: 1.2;
  }

  .hero h1 .highlight {
    color: var(--accent);
  }

  .hero p {
    font-size: 1.15rem;
    color: var(--text-muted);
    max
