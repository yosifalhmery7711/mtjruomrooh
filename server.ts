/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from 'express';
import path from 'path';
import dotenv from 'dotenv';
import pg from 'pg';
import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ override: true });

function cleanEnv(val: string | undefined): string {
  if (!val) return '';
  let s = val.trim();
  if (s.startsWith('"') && s.endsWith('"')) {
    s = s.substring(1, s.length - 1);
  }
  if (s.startsWith("'") && s.endsWith("'")) {
    s = s.substring(1, s.length - 1);
  }
  return s.trim();
}

async function generateContentWithRetry(apiKey: string, contents: any, systemInstruction: string) {
  // Use ultra-robust models list
  const modelsToTry = ['gemini-3.5-flash', 'gemini-3.1-pro-preview'];
  let lastError: any = null;

  for (const model of modelsToTry) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        console.log(`[Gemini REST] Attempting content generation using model: ${model} (attempt ${attempt}/2)`);
        
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              contents,
              systemInstruction: {
                parts: [{ text: systemInstruction }]
              },
              generationConfig: {
                temperature: 0.7,
              }
            })
          }
        );

        if (!response.ok) {
          const errText = await response.text();
          throw new Error(`HTTP ${response.status}: ${errText}`);
        }

        const data = await response.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        
        if (!text) {
          throw new Error('Empty response or invalid JSON structure from Gemini REST API');
        }

        return { text };
      } catch (error: any) {
        lastError = error;
        const errMsg = error?.message || String(error);
        console.warn(`[Gemini REST] Model ${model} failed on attempt ${attempt}:`, errMsg);

        // Check if API key is invalid to fail fast
        if (errMsg.includes('API_KEY_INVALID') || errMsg.includes('key is invalid') || errMsg.includes('400')) {
          throw error;
        }

        // Wait with backoff
        const delay = 1000 * attempt + Math.floor(Math.random() * 500);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError || new Error('All Gemini model fallbacks and retry attempts failed');
}

function getFallbackAdvisorResponse(userMessage: string, products: any[]): string {
  const msg = (userMessage || '').toLowerCase();
  
  // Find products that match keywords
  let matchedProducts: any[] = [];
  
  if (products && products.length > 0) {
    if (msg.includes('منزل') || msg.includes('مطبخ') || msg.includes('أدوات') || msg.includes('أواني') || msg.includes('بيت')) {
      matchedProducts = products.filter(p => 
        (p.categoryName || '').includes('منزل') || 
        (p.categoryName || '').includes('مطبخ') || 
        (p.categoryName || '').includes('أدوات') ||
        (p.name || '').includes('أدوات') || 
        (p.name || '').includes('مطبخ') || 
        (p.name || '').includes('بيت')
      );
    } else if (msg.includes('ملابس') || msg.includes('فساتين') || msg.includes('لبس') || msg.includes('أناقة') || msg.includes('بنات') || msg.includes('أولاد')) {
      matchedProducts = products.filter(p => 
        (p.categoryName || '').includes('ملابس') || 
        (p.categoryName || '').includes('أناقة') ||
        (p.name || '').includes('ملابس') || 
        (p.name || '').includes('فستان') || 
        (p.name || '').includes('لبس')
      );
    } else if (msg.includes('ألعاب') || msg.includes('لعبة') || msg.includes('أطفال') || msg.includes('طفل')) {
      matchedProducts = products.filter(p => 
        (p.categoryName || '').includes('ألعاب') || 
        (p.categoryName || '').includes('أطفال') ||
        (p.name || '').includes('لعبة') || 
        (p.name || '').includes('ألعاب') || 
        (p.name || '').includes('طفل')
      );
    } else if (msg.includes('تجميل') || msg.includes('مكياج') || msg.includes('عناية') || msg.includes('بشرة') || msg.includes('عطور')) {
      matchedProducts = products.filter(p => 
        (p.categoryName || '').includes('تجميل') || 
        (p.categoryName || '').includes('مكياج') || 
        (p.categoryName || '').includes('عناية') ||
        (p.name || '').includes('تجميل') || 
        (p.name || '').includes('مكياج') || 
        (p.name || '').includes('عطر')
      );
    } else if (msg.includes('عرض') || msg.includes('عروض') || msg.includes('خصم') || msg.includes('تخفيض')) {
      matchedProducts = products.filter(p => 
        (p.description || '').includes('عرض') || 
        (p.description || '').includes('تخفيض') || 
        (p.description || '').includes('خصم')
      );
    }
    
    // If no specific match, or match list is empty, pick up to 3 random or first products
    if (matchedProducts.length === 0) {
      matchedProducts = products.slice(0, 3);
    }
  }

  // Limit to max 3 recommendations
  const recs = matchedProducts.slice(0, 3);
  
  let productListMarkdown = '';
  if (recs.length > 0) {
    productListMarkdown = `إليكِ بعض المنتجات المميزة المتاحة في الكتالوج حالياً والتي قد تنال إعجابكِ يا جميلة: 🥰👇\n\n` + 
      recs.map(p => `✨ **${p.name}**\n  - السعر: ${p.priceYERNew} ريال يمني جديد\n  - القسم: ${p.categoryName || 'غير محدد'}`).join('\n\n');
  }

  return productListMarkdown;
}

const app = express();
const PORT = 3000;

// Enable JSON request body parsing up to 50MB for image base64 uploads
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// API Route: AI Advisor Chatbot proxy
app.post('/api/advisor/chat', async (req, res) => {
  try {
    const { messages = [], products = [] } = req.body || {};
    
    // Robust arrays check
    const msgs = Array.isArray(messages) ? messages : [];
    const prods = Array.isArray(products) ? products : [];

    const apiKey = cleanEnv(process.env.GEMINI_API_KEY);
    if (!apiKey) {
      console.warn('[Advisor Rouh] GEMINI_API_KEY is not defined. Using fallback rule-based response.');
      const lastUserMessage = msgs.length > 0 ? msgs[msgs.length - 1]?.text : '';
      const fallbackResponse = getFallbackAdvisorResponse(lastUserMessage, prods);
      return res.json({ text: fallbackResponse });
    }

    // Format catalog to guide Ruh
    const catalogText = prods.length > 0 
      ? prods.map((p: any) => 
          `- المنتج: ${p.name}\n  رمز الإدارة السري: ${p.code}\n  القسم: ${p.categoryName}\n  الوصف: ${p.description}\n  السعر: ${p.priceYERNew} ريال يمني جديد\n  الخيارات المتوفرة: ${p.properties ? p.properties.map((pr: any) => `${pr.name} (${pr.options.join(', ')})`).join(' | ') : ''}`
        ).join('\n\n')
      : 'الكتالوج فارغ حالياً';

    const systemInstruction = `أنتِ "المستشارة روح" - مستشارة تسوق ذكية، أنيقة ولطيفة للغاية، تتحدثين بلهجة يمنية وعربية مهذبة ومرحبة جداً وتستخدمين إيموجيات ملائمة باستمرار (مثل 🌸✨🛍️💖).
تعملين في "متجر أم روح للأدوات المنزلية والملابس والألعاب ومستحضرات التجميل" تحت إشراف "أم روح".
مهمتكِ هي مساعدة المتسوقات والرد على تساؤلاتهن حول المنتجات المتوفرة، وتقديم نصائح تسوق ممتازة، واقتراح هدايا رائعة بناءً على الكتالوج المتاح وميزانيتهن المفضلة.

إليكِ كتالوج المنتجات الكامل والنشط في المتجر حالياً، استخدميه لترشيح سلع محددة وتوضيح أسعارها ومقاساتها وألوانها بدقة للعميل:
${catalogText}

قواعد هامة جداً تلتزمين بها:
1. كوني متعاونة، دافئة وودودة جداً كصديقة مقربة ومستشارة مخلصة.
2. لا تخترعي منتجات أو أسعار غير حقيقية أو غير موجودة في الكتالوج أعلاه! إذا سألتكِ العميلة عن صنف غير متوفر، قولي لها بلطف شديد أنك ستقترحين هذا الصنف على "أم روح" لتوفيره قريباً بالمتجر.
3. خاطبي العملاء بصيغة التأنيث دائماً وبكل لباقة يمنية دافئة (مثل: تفضلي يا عزيزتي، يسعدني خدمتكِ، من عيوني يا غالية 🌸).
4. استخدمي تنسيق Markdown منسق جداً، واجعلي الردود على شكل نقاط منظمة ومريحة للعين لتسهيل القراءة.
5. إذا استفسرت العميلة عن كيفية شحن رصيد المحفظة، وضحِي لها بلطف أنها تستطيع الذهاب لتبويب المحفظة في حسابها والتحويل لأحد حسابات المتجر البنكية المعتمدة (مثل بنك الكريمي أو غيره) ثم رفع صورة السند ليقوم الإدارة بتفعيله فوراً.
6. إذا استفسرت العميلة عن مسابقة أم روح الكبرى والتصويت، وضحِي لها أنها تستطيع المشاركة في المسابقة لتصبح متسابقة رسمية، ومشاركة رابط تصويتها مع صديقاتها لجمع أصوات التأييد 👍 لتربح جوائز قيمة جداً!`;

    // Filter and map messages to ensure:
    // 1. Starts with 'user' message
    // 2. Roles alternate correctly (user -> model -> user -> model)
    let filteredMessages = [...msgs];
    while (filteredMessages.length > 0 && filteredMessages[0].role !== 'user') {
      filteredMessages.shift();
    }

    const contents: any[] = [];
    let expectedRole = 'user';
    for (const m of filteredMessages) {
      const mappedRole = m.role === 'user' ? 'user' : 'model';
      if (mappedRole === expectedRole) {
        contents.push({
          role: mappedRole,
          parts: [{ text: m.text || '' }]
        });
        expectedRole = expectedRole === 'user' ? 'model' : 'user';
      } else {
        if (contents.length > 0) {
          contents[contents.length - 1].parts[0].text += '\n' + (m.text || '');
        }
      }
    }

    // Call Gemini model using robust retry and fallback helper
    try {
      if (contents.length === 0) {
        throw new Error('No valid content sequence to send to Gemini API');
      }
      const response = await generateContentWithRetry(apiKey, contents, systemInstruction);
      res.json({ text: response.text });
    } catch (error: any) {
      console.log('[Gemini REST] Handled fallback to rule-based advisor response successfully:', error?.message || error);
      const lastUserMessage = msgs.length > 0 ? msgs[msgs.length - 1]?.text : '';
      const fallbackResponse = getFallbackAdvisorResponse(lastUserMessage, prods);
      res.json({ text: fallbackResponse });
    }
  } catch (error: any) {
    console.error('Advisor chat error:', error);
    // Bulletproof: If anything fails in the outer scope, STILL return a successful JSON with fallback text
    const lastUserMessage = req.body && req.body.messages && req.body.messages.length > 0
      ? req.body.messages[req.body.messages.length - 1]?.text
      : '';
    const fallbackResponse = getFallbackAdvisorResponse(lastUserMessage, (req.body && req.body.products) || []);
    res.json({ text: fallbackResponse });
  }
});

// API Route: serve Android assetlinks.json dynamically for TWA/APK package verification to hide address bar
app.get('/.well-known/assetlinks.json', async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  try {
    const supabaseUrl = cleanEnv(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL);
    const supabaseAnonKey = cleanEnv(process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY);
    if (supabaseUrl && supabaseAnonKey) {
      const client = createClient(supabaseUrl, supabaseAnonKey);
      const { data } = await client.from('settings').select('*').eq('id', 'admin').maybeSingle();
      if (data && data.data) {
        const adminSettings = data.data;
        const sha256 = adminSettings.sha256Fingerprint || '33:4B:9C:E3:6B:42:0E:64:1B:11:D3:FC:B5:72:0D:20:9B:6C:EE:80:C2:5E:28:FE:8B:D8:1A:1D:95:C7:E2:E8';
        const packageName = adminSettings.packageName || 'com.ruh.store';
        return res.json([
          {
            "relation": ["delegate_permission/common.handle_all_urls"],
            "target": {
              "namespace": "android_app",
              "package_name": packageName,
              "sha256_cert_fingerprints": [sha256]
            }
          }
        ]);
      }
    }
  } catch (err) {
    console.error('Error serving assetlinks.json dynamically:', err);
  }

  // Fallback to default
  const defaultSha256 = '33:4B:9C:E3:6B:42:0E:64:1B:11:D3:FC:B5:72:0D:20:9B:6C:EE:80:C2:5E:28:FE:8B:D8:1A:1D:95:C7:E2:E8';
  res.json([
    {
      "relation": ["delegate_permission/common.handle_all_urls"],
      "target": {
        "namespace": "android_app",
        "package_name": "com.ruh.store",
        "sha256_cert_fingerprints": [defaultSha256]
      }
    }
  ]);
});

// API Route: Get Supabase database status, table checks and size in MB with real metadata queries and fallback
app.get('/api/supabase/status', async (req, res) => {
  try {
    const connectionString = cleanEnv(process.env.DATABASE_URL || process.env.VITE_SUPABASE_DB_URL);
    const supabaseUrl = cleanEnv(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL);
    const supabaseServiceKey = cleanEnv(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY);

    const expectedTables = [
      'settings', 'ticker_texts', 'locations', 'categories', 
      'users', 'products', 'orders', 'gifts', 'recharges', 
      'phone_requests', 'notifications', 'targeted_notifications', 
      'targeted_gifts', 'targeted_gift_logs', 'contestants', 'vote_logs'
    ];

    const arabicNames: Record<string, string> = {
      users: 'المستخدمين والزوار',
      contestants: 'المتسابقين المشتركين',
      products: 'الأصناف والمنتجات',
      categories: 'فئات المنتجات',
      notifications: 'سجل الإشعارات العام',
      orders: 'طلبات الشراء',
      recharges: 'عمليات شحن الرصيد',
      gifts: 'الهدايا والمكافآت',
      phone_requests: 'طلبات التحقق والهواتف',
      vote_logs: 'سجل الأصوات والتصويت',
      settings: 'الإعدادات العامة',
      ticker_texts: 'شريط الأخبار المتحرك',
      locations: 'مواقع التوصيل',
      targeted_notifications: 'الإشعارات المستهدفة',
      targeted_gifts: 'الهدايا المستهدفة',
      targeted_gift_logs: 'سجل استلام الهدايا'
    };

    let pgConnected = false;
    let databaseSizeMB = '0.00 MB';
    let schemaBreakdown: any[] = [];
    let recordCounts: Record<string, number> = {};
    let tablesExist: Record<string, boolean> = {};
    let activeConnections = 3;

    // Helper to generate a graceful estimate in case PG direct port is blocked (so frontend never breaks)
    const generateFallbackStats = (counts: Record<string, number>, exists: Record<string, boolean>) => {
      let totalMB = 0;
      const breakdown = expectedTables.map(tab => {
        const rowCount = counts[tab] || 0;
        const tableExists = exists[tab] || false;
        
        // Base overhead of table metadata if exists
        const baseSize = tableExists ? 0.016 : 0;
        const dataSize = baseSize + (rowCount * 0.0012);
        const indexSize = tableExists ? (0.016 + (rowCount * 0.0008)) : 0;
        const totalSize = dataSize + indexSize;
        totalMB += totalSize;

        return {
          tableName: tab,
          arabicName: arabicNames[tab] || tab,
          rowCount,
          dataSizeMB: parseFloat(dataSize.toFixed(4)),
          indexSizeMB: parseFloat(indexSize.toFixed(4)),
          totalSizeMB: parseFloat(totalSize.toFixed(4))
        };
      });

      return {
        databaseSizeMB: totalMB.toFixed(2) + ' MB',
        schemaBreakdown: breakdown
      };
    };

    // 1. First, attempt Direct PG connection if connection string exists (allows Live system catalog queries)
    if (connectionString) {
      try {
        const pgModule = pg as any;
        const ClientConstructor = pgModule?.Client || pgModule?.default?.Client;
        if (ClientConstructor) {
          const client = new ClientConstructor({
            connectionString,
            connectionTimeoutMillis: 1500,
            ssl: { rejectUnauthorized: false }
          });
          
          await client.connect();
          pgConnected = true;

          // Database Auto-Patch: Remove UNIQUE constraint from users.phone and add "currency" to recharges if missing
          try {
            console.log('[Supabase DB Status] Running schema auto-patch...');
            await client.query('ALTER TABLE users DROP CONSTRAINT IF EXISTS users_phone_key;');
            await client.query('ALTER TABLE recharges ADD COLUMN IF NOT EXISTS "currency" VARCHAR(50) DEFAULT \'YER_NEW\';');
            console.log('[Supabase DB Status] Schema auto-patched successfully!');
          } catch (patchErr: any) {
            console.warn('[Supabase DB Status] Non-blocking schema auto-patch error:', patchErr.message || patchErr);
          }

          // Fetch Active Connections
          try {
            const connRes = await client.query("SELECT count(*) FROM pg_stat_activity;");
            activeConnections = parseInt(connRes.rows[0]?.count || '3', 10);
          } catch (e) {}

          // Query table sizes and row counts directly from Postgres catalogs
          const metadataQuery = `
            SELECT 
              relname AS table_name,
              COALESCE(pg_stat_get_live_tuples(c.oid), 0) AS row_count,
              (pg_relation_size(c.oid) / 1024.0 / 1024.0) AS data_size_mb,
              (pg_indexes_size(c.oid) / 1024.0 / 1024.0) AS index_size_mb,
              (pg_total_relation_size(c.oid) / 1024.0 / 1024.0) AS total_size_mb
            FROM 
              pg_class c
            JOIN 
              pg_namespace n ON n.oid = c.relnamespace
            WHERE 
              nspname = 'public' AND relkind = 'r';
          `;
          const metaRes = await client.query(metadataQuery);
          const pgRows = metaRes.rows;

          // Determine total DB size in pretty format
          const sizeQuery = `SELECT pg_size_pretty(pg_database_size(current_database())) as size;`;
          const sizeRes = await client.query(sizeQuery);
          databaseSizeMB = sizeRes.rows[0]?.size || '0.00 MB';

          // Compile stats
          expectedTables.forEach(tab => {
            const row = pgRows.find(r => r.table_name === tab);
            if (row) {
              tablesExist[tab] = true;
              const rCount = parseInt(row.row_count, 10);
              recordCounts[tab] = rCount;
              schemaBreakdown.push({
                tableName: tab,
                arabicName: arabicNames[tab] || tab,
                rowCount: rCount,
                dataSizeMB: parseFloat(parseFloat(row.data_size_mb || 0).toFixed(4)),
                indexSizeMB: parseFloat(parseFloat(row.index_size_mb || 0).toFixed(4)),
                totalSizeMB: parseFloat(parseFloat(row.total_size_mb || 0).toFixed(4))
              });
            } else {
              tablesExist[tab] = false;
              recordCounts[tab] = 0;
              schemaBreakdown.push({
                tableName: tab,
                arabicName: arabicNames[tab] || tab,
                rowCount: 0,
                dataSizeMB: 0,
                indexSizeMB: 0,
                totalSizeMB: 0
              });
            }
          });

          await client.end();

          return res.json({
            pgConnected: true,
            databaseSizeMB,
            tablesCount: schemaBreakdown.filter(t => t.rowCount > 0 || tablesExist[t.tableName]).length,
            tablesExist,
            recordCounts,
            activeConnections,
            schemaBreakdown,
            supabaseUrl: supabaseUrl || 'غير معرّف'
          });
        }
      } catch (err: any) {
        console.warn('[Supabase DB Status] Direct PG connection failed, trying HTTPS API fallback...', err?.message || err);
      }
    }

    // 2. HTTPS Proxy Fallback (Highly reliable, fast, bypasses port blocks)
    if (supabaseUrl && supabaseServiceKey) {
      try {
        const sClient = createClient(supabaseUrl, supabaseServiceKey);
        let existingTablesCount = 0;

        await Promise.all(expectedTables.map(async (tab) => {
          try {
            const { count, error } = await sClient
              .from(tab)
              .select('*', { count: 'exact', head: true });

            if (error) {
              const isNotExist = error.code === '42P01' || error.code === 'PGRST116' || error.message?.includes('does not exist') || error.message?.includes('not found');
              if (isNotExist) {
                tablesExist[tab] = false;
                recordCounts[tab] = 0;
              } else {
                tablesExist[tab] = true;
                recordCounts[tab] = 0;
                existingTablesCount++;
              }
            } else {
              tablesExist[tab] = true;
              recordCounts[tab] = count || 0;
              existingTablesCount++;
            }
          } catch (e) {
            tablesExist[tab] = false;
            recordCounts[tab] = 0;
          }
        }));

        const stats = generateFallbackStats(recordCounts, tablesExist);

        return res.json({
          pgConnected: true,
          viaHttpProxy: true,
          databaseSizeMB: stats.databaseSizeMB,
          tablesCount: existingTablesCount,
          tablesExist,
          recordCounts,
          activeConnections,
          schemaBreakdown: stats.schemaBreakdown,
          supabaseUrl: supabaseUrl
        });
      } catch (fallbackErr: any) {
        console.error('[Supabase DB Status] HTTPS Client fallback also failed:', fallbackErr?.message || fallbackErr);
      }
    }

    // Default error response if both failed
    res.json({
      pgConnected: false,
      databaseSizeMB: '0.00 MB',
      tablesCount: 0,
      activeConnections: 0,
      schemaBreakdown: expectedTables.map(t => ({ tableName: t, arabicName: arabicNames[t] || t, rowCount: 0, dataSizeMB: 0, indexSizeMB: 0, totalSizeMB: 0 })),
      error: 'تعذر الاتصال بـ Supabase بشتى الطرق المتاحة. يرجى التحقق من مفاتيح البيئة.'
    });

  } catch (outerErr: any) {
    console.error('[Supabase DB Status] Unhandled error:', outerErr);
    res.json({
      pgConnected: false,
      error: `خطأ داخلي في الخادم: ${outerErr.message || String(outerErr)}`
    });
  }
});

// API Route: Automatically build database schema, triggers, and storage buckets
app.post('/api/supabase/setup-schema', async (req, res) => {
  try {
    const connectionString = cleanEnv(process.env.DATABASE_URL || process.env.VITE_SUPABASE_DB_URL);
    if (!connectionString) {
      return res.status(400).json({
        success: false,
        error: 'لم يتم العثور على DATABASE_URL في متغيرات البيئة.'
      });
    }

    const pgModule = pg as any;
    const ClientConstructor = pgModule?.Client || pgModule?.default?.Client;
    if (!ClientConstructor) {
      throw new Error('تعذر تحميل مكتبة pg (node-postgres) بشكل صحيح على هذا الخادم.');
    }

    const client = new ClientConstructor({
      connectionString,
      ssl: { rejectUnauthorized: false }
    });
    client.on('error', (err: any) => {
      console.error('[Supabase DB Setup] PG Client internal error:', err);
    });

    try {
      await client.connect();
      
      // Read the schema SQL file from workspace root
      const sqlPath = path.join(process.cwd(), 'supabase-schema.sql');
      if (!fs.existsSync(sqlPath)) {
        throw new Error('ملف الهيكلة supabase-schema.sql غير موجود في جذر التطبيق!');
      }
      const sqlScript = fs.readFileSync(sqlPath, 'utf8');

      console.log('[Supabase DB Setup] Executing schema SQL script...');
      await client.query(sqlScript);
      console.log('[Supabase DB Setup] Schema created successfully!');

      await client.end();
      res.json({
        success: true,
        message: 'تم بناء وهيكلة قاعدة بيانات Supabase والسياسات والحاويات بنجاح تلقائياً! 🎉'
      });

    } catch (err: any) {
      console.error('[Supabase DB Setup] Setup failed:', err);
      try { await client.end(); } catch (e) {}
      res.status(500).json({
        success: false,
        error: err.message || String(err)
      });
    }
  } catch (outerErr: any) {
    console.error('[Supabase DB Setup] Unhandled error:', outerErr);
    res.status(500).json({
      success: false,
      error: `خطأ داخلي في الخادم: ${outerErr.message || String(outerErr)}`
    });
  }
});

// Mount Vite middleware for development or serve built SPA for production
async function runStartupSchemaPatch() {
  const connectionString = cleanEnv(process.env.DATABASE_URL || process.env.VITE_SUPABASE_DB_URL);
  if (!connectionString) {
    console.log('[Startup Patch] No database connection string found. Skipping startup patch.');
    return;
  }
  try {
    const pgModule = pg as any;
    const ClientConstructor = pgModule?.Client || pgModule?.default?.Client;
    if (!ClientConstructor) {
      console.warn('[Startup Patch] pg module Client constructor not found.');
      return;
    }
    const client = new ClientConstructor({
      connectionString,
      connectionTimeoutMillis: 10000,
      ssl: { rejectUnauthorized: false }
    });
    await client.connect();
    console.log('[Startup Patch] Connected to PostgreSQL. Checking table setup in public schema...');
    
    // Check existing table count
    const tableCountRes = await client.query(`
      SELECT COUNT(*) as count 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE';
    `);
    const tableCount = parseInt(tableCountRes.rows[0]?.count || '0', 10);
    console.log(`[Startup Patch] Found ${tableCount} existing tables.`);

    if (tableCount === 0) {
      console.log('[Startup Patch] Database is completely blank. Executing full initialization from supabase-schema.sql...');
      const sqlPath = path.join(process.cwd(), 'supabase-schema.sql');
      if (fs.existsSync(sqlPath)) {
        const sqlScript = fs.readFileSync(sqlPath, 'utf8');
        await client.query(sqlScript);
        console.log('[Startup Patch] Database tables, policies, and storage initialized successfully from script!');
      } else {
        console.warn('[Startup Patch] Warning: supabase-schema.sql not found at root path.');
      }
    } else {
      console.log('[Startup Patch] Database already exists with some tables. Running safe CREATE TABLE IF NOT EXISTS queries...');
      
      // 1. settings
      await client.query(`
        CREATE TABLE IF NOT EXISTS settings (
          id VARCHAR(255) PRIMARY KEY,
          data JSONB NOT NULL,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // 2. active_carts
      await client.query(`
        CREATE TABLE IF NOT EXISTS active_carts (
          id VARCHAR(255) PRIMARY KEY,
          items JSONB DEFAULT '[]'::jsonb,
          "userId" VARCHAR(255),
          "updatedAt" VARCHAR(100),
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // 3. ticker_texts
      await client.query(`
        CREATE TABLE IF NOT EXISTS ticker_texts (
          id VARCHAR(255) PRIMARY KEY,
          text TEXT NOT NULL,
          "sortOrder" INT DEFAULT 0,
          "createdAt" VARCHAR(100),
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // 4. locations
      await client.query(`
        CREATE TABLE IF NOT EXISTS locations (
          id VARCHAR(255) PRIMARY KEY,
          name VARCHAR(255) NOT NULL UNIQUE,
          "deliveryFee" NUMERIC NOT NULL DEFAULT 0,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // 5. categories
      await client.query(`
        CREATE TABLE IF NOT EXISTS categories (
          id VARCHAR(255) PRIMARY KEY,
          name VARCHAR(255) NOT NULL UNIQUE,
          image TEXT NOT NULL,
          "productCount" INT DEFAULT 0,
          "sortOrder" INT DEFAULT 0,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // 6. users
      await client.query(`
        CREATE TABLE IF NOT EXISTS users (
          id VARCHAR(255) PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          phone VARCHAR(255) NOT NULL,
          address TEXT DEFAULT '',
          currency VARCHAR(50) DEFAULT 'YER_NEW',
          balance NUMERIC DEFAULT 0,
          "giftBalance" NUMERIC DEFAULT 0,
          favorites JSONB DEFAULT '[]'::jsonb,
          "joinDate" VARCHAR(50),
          "isRegistered" BOOLEAN DEFAULT false,
          "deviceId" VARCHAR(255),
          "balanceCurrency" VARCHAR(50) DEFAULT 'YER_NEW',
          "giftBalanceCurrency" VARCHAR(50) DEFAULT 'YER_NEW',
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // 7. targeted_notifications
      await client.query(`
        CREATE TABLE IF NOT EXISTS targeted_notifications (
          id VARCHAR(255) PRIMARY KEY,
          title VARCHAR(255) NOT NULL,
          message TEXT NOT NULL,
          "createdAt" VARCHAR(100) NOT NULL,
          "expiryAt" VARCHAR(100) NOT NULL,
          "targetType" VARCHAR(100) NOT NULL,
          "targetValue" VARCHAR(255) NOT NULL,
          "isPopup" BOOLEAN DEFAULT false,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // 8. targeted_gifts
      await client.query(`
        CREATE TABLE IF NOT EXISTS targeted_gifts (
          id VARCHAR(255) PRIMARY KEY,
          title VARCHAR(255) NOT NULL,
          amount NUMERIC NOT NULL,
          "createdAt" VARCHAR(100) NOT NULL,
          "expiryAt" VARCHAR(100) NOT NULL,
          "targetType" VARCHAR(100) NOT NULL,
          "targetValue" VARCHAR(255) NOT NULL,
          "daysToUse" INT DEFAULT 7,
          "claimedUserIds" JSONB DEFAULT '[]'::jsonb,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // 9. products
      await client.query(`
        CREATE TABLE IF NOT EXISTS products (
          id VARCHAR(255) PRIMARY KEY,
          code VARCHAR(255) NOT NULL UNIQUE,
          name VARCHAR(255) NOT NULL,
          "categoryId" VARCHAR(255) NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
          "categoryName" VARCHAR(255) NOT NULL,
          "subCategoryIds" JSONB DEFAULT '[]'::jsonb,
          description TEXT,
          "priceYERNew" NUMERIC NOT NULL DEFAULT 0,
          images JSONB DEFAULT '[]'::jsonb,
          properties JSONB DEFAULT '[]'::jsonb,
          "isOnOffer" BOOLEAN DEFAULT false,
          "offerPriceNew" NUMERIC,
          "offerOldPrice" NUMERIC,
          rating NUMERIC DEFAULT 5,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // 10. orders
      await client.query(`
        CREATE TABLE IF NOT EXISTS orders (
          id VARCHAR(255) PRIMARY KEY,
          "userId" VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          "userName" VARCHAR(255) NOT NULL,
          "userPhone" VARCHAR(255) NOT NULL,
          address TEXT NOT NULL,
          "deliveryFee" NUMERIC DEFAULT 0,
          items JSONB NOT NULL,
          "senderName" VARCHAR(255),
          "senderAccount" VARCHAR(255),
          "receiptImage" TEXT,
          "totalAmount" NUMERIC NOT NULL,
          currency VARCHAR(50) NOT NULL,
          "createdAt" VARCHAR(100) NOT NULL,
          status VARCHAR(50) DEFAULT 'pending',
          "paymentMethod" VARCHAR(100) NOT NULL,
          "checkoutVia" VARCHAR(100) DEFAULT 'app',
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // 11. gifts
      await client.query(`
        CREATE TABLE IF NOT EXISTS gifts (
          id VARCHAR(255) PRIMARY KEY,
          "userId" VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          "userName" VARCHAR(255) NOT NULL,
          "userPhone" VARCHAR(255) NOT NULL,
          amount NUMERIC NOT NULL,
          "createdAt" VARCHAR(100) NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // 12. recharges
      await client.query(`
        CREATE TABLE IF NOT EXISTS recharges (
          id VARCHAR(255) PRIMARY KEY,
          "userId" VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          "userName" VARCHAR(255) NOT NULL,
          "userPhone" VARCHAR(255) NOT NULL,
          "senderName" VARCHAR(255),
          "senderAccount" VARCHAR(255),
          amount NUMERIC NOT NULL,
          "currency" VARCHAR(50) DEFAULT 'YER_NEW',
          "receiptImage" TEXT,
          "createdAt" VARCHAR(100) NOT NULL,
          status VARCHAR(50) DEFAULT 'pending',
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // 13. phone_requests
      await client.query(`
        CREATE TABLE IF NOT EXISTS phone_requests (
          id VARCHAR(255) PRIMARY KEY,
          "userId" VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          "userName" VARCHAR(255) NOT NULL,
          "oldPhone" VARCHAR(255) NOT NULL,
          "newPhone" VARCHAR(255) NOT NULL,
          "newName" VARCHAR(255),
          "createdAt" VARCHAR(100) NOT NULL,
          status VARCHAR(50) DEFAULT 'pending',
          type VARCHAR(50) DEFAULT 'change_phone',
          "newDeviceId" VARCHAR(255),
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // 14. notifications
      await client.query(`
        CREATE TABLE IF NOT EXISTS notifications (
          id VARCHAR(255) PRIMARY KEY,
          "userId" VARCHAR(255) REFERENCES users(id) ON DELETE CASCADE,
          title VARCHAR(255) NOT NULL,
          message TEXT NOT NULL,
          "createdAt" VARCHAR(100) NOT NULL,
          "isRead" BOOLEAN DEFAULT false,
          image TEXT,
          "productId" VARCHAR(255) REFERENCES products(id) ON DELETE SET NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // 15. targeted_gift_logs
      await client.query(`
        CREATE TABLE IF NOT EXISTS targeted_gift_logs (
          id VARCHAR(255) PRIMARY KEY,
          "userId" VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          "userName" VARCHAR(255) NOT NULL,
          "userPhone" VARCHAR(255) NOT NULL,
          amount NUMERIC NOT NULL,
          "giftCampaignId" VARCHAR(255) NOT NULL REFERENCES targeted_gifts(id) ON DELETE CASCADE,
          "giftCampaignTitle" VARCHAR(255) NOT NULL,
          "createdAt" VARCHAR(100) NOT NULL,
          "expiryAt" VARCHAR(100) NOT NULL,
          status VARCHAR(50) DEFAULT 'active',
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // 16. archived_events
      await client.query(`
        CREATE TABLE IF NOT EXISTS archived_events (
          id VARCHAR(255) PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          date VARCHAR(100) NOT NULL,
          "winnerName" VARCHAR(255) NOT NULL,
          "giftAmount" NUMERIC NOT NULL,
          "giftCurrency" VARCHAR(50) NOT NULL,
          "deliveryProofImage" TEXT,
          "showInSlider" BOOLEAN DEFAULT false,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // 17. contestants
      await client.query(`
        CREATE TABLE IF NOT EXISTS contestants (
          id VARCHAR(255) PRIMARY KEY,
          "userId" VARCHAR(255),
          name VARCHAR(255) NOT NULL,
          phone VARCHAR(255) NOT NULL,
          "deviceId" VARCHAR(255),
          "createdAt" VARCHAR(100) NOT NULL,
          "greenVotes" INT DEFAULT 0,
          "redVotes" INT DEFAULT 0,
          votes INT DEFAULT 0,
          "imageUrl" TEXT,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // 18. vote_logs
      await client.query(`
        CREATE TABLE IF NOT EXISTS vote_logs (
          id VARCHAR(255) PRIMARY KEY,
          "contestantId" VARCHAR(255) REFERENCES contestants(id) ON DELETE CASCADE,
          "voterUserId" VARCHAR(255),
          "voterDeviceId" VARCHAR(255) NOT NULL,
          "voterType" VARCHAR(50) DEFAULT 'green',
          "createdAt" VARCHAR(100) NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // 19. app_notifications
      await client.query(`
        CREATE TABLE IF NOT EXISTS app_notifications (
          id VARCHAR(255) PRIMARY KEY,
          title VARCHAR(255) NOT NULL,
          message TEXT NOT NULL,
          "createdAt" VARCHAR(100) NOT NULL,
          "expiryAt" VARCHAR(100) NOT NULL,
          image TEXT,
          "productId" VARCHAR(255) REFERENCES products(id) ON DELETE SET NULL,
          frequency INTEGER,
          "durationHours" INTEGER,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // Safe Indexes Creation
      await client.query('CREATE INDEX IF NOT EXISTS idx_products_category ON products("categoryId");');
      await client.query('CREATE INDEX IF NOT EXISTS idx_orders_user ON orders("userId");');
      await client.query('CREATE INDEX IF NOT EXISTS idx_gifts_user ON gifts("userId");');
      await client.query('CREATE INDEX IF NOT EXISTS idx_recharges_user ON recharges("userId");');
      await client.query('CREATE INDEX IF NOT EXISTS idx_phone_req_user ON phone_requests("userId");');
      await client.query('CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications("userId");');
      await client.query('CREATE INDEX IF NOT EXISTS idx_gift_logs_user ON targeted_gift_logs("userId");');
      await client.query('CREATE INDEX IF NOT EXISTS idx_gift_logs_campaign ON targeted_gift_logs("giftCampaignId");');
      await client.query('CREATE INDEX IF NOT EXISTS idx_contestants_user ON contestants("userId");');
      await client.query('CREATE INDEX IF NOT EXISTS idx_vote_logs_contestant ON vote_logs("contestantId");');

      // Setup Row-Level Security on all public tables
      await client.query(`
        DO $$
        DECLARE
          tab RECORD;
        BEGIN
          FOR tab IN 
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
              AND table_type = 'BASE TABLE'
          LOOP
            EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', tab.table_name);
            EXECUTE format('DROP POLICY IF EXISTS "Permissive Select Policy" ON %I;', tab.table_name);
            EXECUTE format('DROP POLICY IF EXISTS "Permissive Insert Policy" ON %I;', tab.table_name);
            EXECUTE format('DROP POLICY IF EXISTS "Permissive Update Policy" ON %I;', tab.table_name);
            EXECUTE format('DROP POLICY IF EXISTS "Permissive Delete Policy" ON %I;', tab.table_name);
            
            EXECUTE format('CREATE POLICY "Permissive Select Policy" ON %I FOR SELECT USING (true);', tab.table_name);
            EXECUTE format('CREATE POLICY "Permissive Insert Policy" ON %I FOR INSERT WITH CHECK (true);', tab.table_name);
            EXECUTE format('CREATE POLICY "Permissive Update Policy" ON %I FOR UPDATE USING (true) WITH CHECK (true);', tab.table_name);
            EXECUTE format('CREATE POLICY "Permissive Delete Policy" ON %I FOR DELETE USING (true);', tab.table_name);
          END LOOP;
        END $$;
      `);

      // Setup Public Storage bucket
      try {
        await client.query(`
          INSERT INTO storage.buckets (id, name, public) 
          VALUES ('amrwh-storage', 'amrwh-storage', true)
          ON CONFLICT (id) DO NOTHING;
        `);
        await client.query(`
          DROP POLICY IF EXISTS "Public Storage Access" ON storage.objects;
          CREATE POLICY "Public Storage Access" ON storage.objects FOR ALL USING (bucket_id = 'amrwh-storage') WITH CHECK (bucket_id = 'amrwh-storage');
        `);
      } catch (e: any) {
        console.warn('[Startup Patch] Non-blocking storage bucket setup failed:', e.message || e);
      }

      // Check users constraint unique drop and recharges currency addition
      await client.query('ALTER TABLE users DROP CONSTRAINT IF EXISTS users_phone_key;');
      await client.query('ALTER TABLE recharges ADD COLUMN IF NOT EXISTS "currency" VARCHAR(50) DEFAULT \'YER_NEW\';');
    }

    console.log('[Startup Patch] Auto-setup and table verification completed successfully!');
    await client.end();
  } catch (err: any) {
    console.error('[Startup Patch] Auto-setup failed on error:', err.message || err);
  }
}

async function startServer() {
  // Run auto-patch on startup
  await runStartupSchemaPatch().catch(e => console.error('[Startup Patch] Unhandled error:', e));

  if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
    const viteModuleName = 'vite';
    const { createServer: createViteServer } = await import(viteModuleName);
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else if (!process.env.VERCEL) {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Only listen on port if not running as a serverless function on Vercel
  if (!process.env.VERCEL) {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`[Um Rouh Store Server] listening on http://0.0.0.0:${PORT}`);
    });
  }
}

startServer().catch((err) => {
  console.error('Error starting server:', err);
});

export default app;
