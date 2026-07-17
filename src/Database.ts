/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { 
  User, 
  Category, 
  Product, 
  Order, 
  ExchangeRate, 
  Gift, 
  RechargeRequest, 
  AdvisorSettings, 
  AdminSettings,
  PhoneChangeRequest,
  Notification,
  DeliveryLocation,
  TargetedNotification,
  TargetedGift,
  UserTargetedGiftLog,
  Currency,
  ArchivedEvent,
  Contestant,
  VoteLog,
  AppNotification,
  OrderItem,
  OrderStatus
} from './types';
import { db, COLLECTIONS, auth } from './firebase';
import { collection, doc, getDoc, getDocs, setDoc as originalSetDoc, updateDoc as originalUpdateDoc, deleteDoc as originalDeleteDoc, query, where } from 'firebase/firestore';
import { supabase, isSupabaseConfigured, switchToProxy, switchToDirect, isProxyActive } from './supabase';

// دوال مغلفة لعمليات تعديل فايربيس لتجنب استهلاك كوتا الاستهلاك عند تفعيل وضع جوجل شيتس
function setDoc(reference: any, data: any, options?: any): Promise<void> {
  const isBackupMode = typeof window !== 'undefined' && localStorage.getItem('amrwh_use_google_backup') !== 'false';
  if (isBackupMode) {
    console.log('Database Write Bypass: Bypassing Firestore setDoc in Google Sheets mode.');
    return Promise.resolve();
  }
  return originalSetDoc(reference, data, options);
}

function updateDoc(reference: any, data: any): Promise<void> {
  const isBackupMode = typeof window !== 'undefined' && localStorage.getItem('amrwh_use_google_backup') !== 'false';
  if (isBackupMode) {
    console.log('Database Write Bypass: Bypassing Firestore updateDoc in Google Sheets mode.');
    return Promise.resolve();
  }
  return originalUpdateDoc(reference, data);
}

function deleteDoc(reference: any): Promise<void> {
  const isBackupMode = typeof window !== 'undefined' && localStorage.getItem('amrwh_use_google_backup') !== 'false';
  if (isBackupMode) {
    console.log('Database Write Bypass: Bypassing Firestore deleteDoc in Google Sheets mode.');
    return Promise.resolve();
  }
  return originalDeleteDoc(reference);
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth?.currentUser?.uid || null,
      email: auth?.currentUser?.email || null,
      emailVerified: auth?.currentUser?.emailVerified || null,
      isAnonymous: auth?.currentUser?.isAnonymous || null,
      tenantId: auth?.currentUser?.tenantId || null,
      providerInfo: auth?.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  const stringified = JSON.stringify(errInfo);
  const isOfflineOrNetwork = errInfo.error.toLowerCase().includes('offline') || 
                             errInfo.error.toLowerCase().includes('network') ||
                             errInfo.error.toLowerCase().includes('failed to get document') ||
                             errInfo.error.toLowerCase().includes('could not reach') ||
                             errInfo.error.toLowerCase().includes('timeout') ||
                             errInfo.error.toLowerCase().includes('unreachable') ||
                             errInfo.error.toLowerCase().includes('unavailable') ||
                             errInfo.error.toLowerCase().includes('connection');
  
  if (isOfflineOrNetwork) {
    console.warn('Firestore Connection/Offline Fallback Warning: ', stringified);
  } else {
    console.error('Firestore Error: ', stringified);
    throw new Error(stringified);
  }
}

function handleSupabaseError(error: any, tableName: string, operation: string) {
  if (!error) return;
  const stringified = JSON.stringify(error);
  console.error(`Supabase ${tableName} ${operation} error:`, stringified);
  
  let friendlyMsg = `فشل حفظ البيانات في Supabase للجدول ${tableName}.`;
  if (error.code === '42P01' || error.code === 'PGRST205') {
    friendlyMsg = `⚠️ تنبيه هام لمتجر أم روح: جدول "${tableName}" غير موجود في قاعدة بيانات Supabase الخاصة بكِ! يرجى الذهاب إلى لوحة تحكم Supabase، ثم فتح (SQL Editor)، ونسخ محتويات ملف "supabase-schema.sql" بالكامل ولصقها هناك والنقر على (Run) لإنشاء الجداول وسياسات الأمان بنجاح.`;
    if (typeof window !== 'undefined') {
      window.alert(friendlyMsg);
    }
  } else if (error.code === '23505') {
    friendlyMsg = `⚠️ خطأ: الاسم أو المعرّف الذي أدخلتيه مكرر وموجود بالفعل في جدول "${tableName}". يرجى اختيار اسم أو رمز فريد.`;
    if (typeof window !== 'undefined') {
      window.alert(friendlyMsg);
    }
  } else if (error.message) {
    friendlyMsg = `⚠️ خطأ في Supabase: ${error.message}`;
    if (typeof window !== 'undefined') {
      console.warn("Supabase Error Details:", friendlyMsg);
    }
  }
}

export function generateSecureDefaultUserID(): string {
  const prefix = "9";
  // توليد 8 أرقام عشوائية تماماً لتشكل مع الـ 9 معرفاً من 9 خانات
  const remainingDigits = Math.floor(10000000 + Math.random() * 90000000).toString();
  return prefix + remainingDigits;
}


// Helper to safely load JSON from localStorage
function loadFromStorage<T>(key: string, defaultValue: T): T {
  const data = localStorage.getItem(key);
  if (!data) return defaultValue;
  try {
    return JSON.parse(data) as T;
  } catch (e) {
    return defaultValue;
  }
}

// Helper to save JSON to localStorage
function saveToStorage<T>(key: string, data: T): void {
  localStorage.setItem(key, JSON.stringify(data));
}

// Seed Initial Data
const DEFAULT_USER: User = {
  id: 'USER_DEFAULT',
  name: 'زائر كريم',
  phone: '777111222',
  address: '', // empty address initially, let them skip
  currency: 'YER_NEW',
  balance: 0, // Changed to 0 as requested
  giftBalance: 0, // Changed to 0 as requested
  favorites: [],
  joinDate: '2026-06',
  isRegistered: false
};

const DEFAULT_CATEGORIES: Category[] = [
  { id: 'cat_housewares', name: 'أدوات منزلية 🏠', image: 'https://images.unsplash.com/photo-1513519245088-0e12902e5a38?auto=format&fit=crop&q=80&w=400', productCount: 3, sortOrder: 1 },
  { id: 'cat_clothing', name: 'ملابس وأزياء 👗', image: 'https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&q=80&w=400', productCount: 2, sortOrder: 2 },
  { id: 'cat_cosmetics', name: 'مستحضرات تجميل 💄', image: 'https://images.unsplash.com/photo-1596462502278-27bfdc403348?auto=format&fit=crop&q=80&w=400', productCount: 2, sortOrder: 3 },
  { id: 'cat_toys', name: 'ألعاب أطفال 🧸', image: 'https://images.unsplash.com/photo-1531346878377-a5be20888e57?auto=format&fit=crop&q=80&w=400', productCount: 2, sortOrder: 4 }
];

const DEFAULT_PRODUCTS: Product[] = [
  {
    id: 'prod_fallback_1',
    code: 'HW-01',
    name: 'طقم فناجين قهوة تركي فاخر ☕',
    categoryId: 'cat_housewares',
    categoryName: 'أدوات منزلية 🏠',
    description: 'طقم فناجين قهوة بورسلان فاخر مع قاعدة ذهبية جذابة، مناسب للضيافة الراقية والمناسبات السعيدة.',
    priceYERNew: 12000,
    images: ['https://images.unsplash.com/photo-1517256064527-09c53b2d0ec6?auto=format&fit=crop&q=80&w=600'],
    properties: [
      { name: 'اللون', options: ['ذهبي', 'فضي', 'أبيض'] }
    ],
    isOnOffer: true,
    offerPriceNew: 9500,
    offerOldPrice: 12000,
    rating: 5,
    isFeatured: true
  },
  {
    id: 'prod_fallback_2',
    code: 'HW-02',
    name: 'منظم مكياج أكريليك دوار 360 درجة ✨',
    categoryId: 'cat_cosmetics',
    categoryName: 'مستحضرات تجميل 💄',
    description: 'منظم مكياج أكريليك شفاف دوار يوفر مساحة تخزين كبيرة لجميع مستحضرات التجميل وأدوات التزيين الخاصة بكِ.',
    priceYERNew: 6500,
    images: ['https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?auto=format&fit=crop&q=80&w=600'],
    properties: [],
    isOnOffer: false,
    rating: 4.8,
    isFeatured: true
  },
  {
    id: 'prod_fallback_3',
    code: 'CL-01',
    name: 'فستان صيفي بناتي ناعم 🌸',
    categoryId: 'cat_clothing',
    categoryName: 'ملابس وأزياء 👗',
    description: 'فستان صيفي قطني بناتي بنقشات زهور جميلة وألوان زاهية، مريح ولطيف جداً للبشرة.',
    priceYERNew: 8500,
    images: ['https://images.unsplash.com/photo-1518831959646-742c3a14ebf7?auto=format&fit=crop&q=80&w=600'],
    properties: [
      { name: 'المقاس', options: ['2-3 سنوات', '4-5 سنوات', '6-7 سنوات'] }
    ],
    isOnOffer: true,
    offerPriceNew: 7000,
    offerOldPrice: 8500,
    rating: 4.9,
    isFeatured: true
  }
];

const DEFAULT_EXCHANGE_RATE: ExchangeRate = {
  yerOldFactor: 2.9, // Price_Old = Price_New / 2.9 (round to higher 100)
  sarFactor: 410,    // Price_SAR = Price_New / 410 (round to higher integer)
};

const DEFAULT_ADVISOR_SETTINGS: AdvisorSettings = {
  image: 'https://images.unsplash.com/photo-1503919545889-aef636e10ad4?auto=format&fit=crop&q=80&w=400', // A beautiful, heartwarming little girl avatar
  name: 'رُوْح',
  title: 'مستشارة العملاء الموثوقة',
};

const DEFAULT_ADMIN_SETTINGS: AdminSettings = {
  code: '1234',
  workerCode: '1111',
  bankAccounts: [
    { currency: 'YER_NEW', bankName: 'الكريمي المميز (ريال يمني جديد)', accountNumber: '967739563915', accountName: 'متجر أم روح' },
    { currency: 'YER_OLD', bankName: 'الكريمي المميز (ريال يمني قديم)', accountNumber: '967739563915', accountName: 'متجر أم روح' },
    { currency: 'SAR', bankName: 'الكريمي المميز (ريال سعودي)', accountNumber: '967739563915', accountName: 'متجر أم روح' }
  ],
  androidDownloadUrl: 'https://archive.org/download/ruh-store/RuhStore.apk',
  whatsappNumber: '967739563915',
  currentAppUrl: '',
  kuraimiAccountName: 'أم روح',
  kuraimiAccountNumber: '967739563915',
  najmReceiverName: 'روح أحمد علي',
  googleBackupActive: false, // معطل افتراضياً ليكون سوبابيز هو الفعال
  googleScriptUrl: "https://script.google.com/macros/s/AKfycbychcCW3ycX_Eptt_6iavMzPnq5_lLQIpAaOUOAHR4ZhKDMemPAFeRavrLuEvkwq8jj/exec"
};

const DEFAULT_OFFERS_IMAGES: string[] = [];

const DEFAULT_NOTIFICATIONS: Notification[] = [
  {
    id: 'NOTIF_1',
    title: 'مرحباً بك في متجر أم روح 🌸',
    message: 'يسعدنا انضمامك إلينا! استكشفي أقسامنا المتنوعة واستمتعي بتخفيضات وعروض حصرية على الأدوات المنزلية، الملابس، الألعاب، ومستحضرات التجميل.',
    createdAt: new Date().toISOString(),
    isRead: false
  },
  {
    id: 'NOTIF_2',
    title: 'أهلاً بكِ في متجرنا 🌸',
    message: 'لقد تم إنشاء حسابكِ بنجاح! يمكنكِ الآن البدء بالتسوق وإتمام طلباتكِ عبر الواتساب بكل سهولة ويسر. تمنياتنا لكِ برحلة تسوق ممتعة! ✨',
    createdAt: new Date().toISOString(),
    isRead: false
  }
];

const DEFAULT_LOCATIONS: DeliveryLocation[] = [
  { id: 'LOC_1', name: 'صنعاء - الأمانة', deliveryFee: 1000 },
  { id: 'LOC_2', name: 'عدن - كريتر / المنصورة', deliveryFee: 2000 },
  { id: 'LOC_3', name: 'تعز - المدينة', deliveryFee: 1500 },
  { id: 'LOC_4', name: 'إب - المدينة', deliveryFee: 1500 },
  { id: 'LOC_5', name: 'الحديدة - المدينة', deliveryFee: 1800 }
];

// Database Class definition
export class Database {
  private static initialized = false;
  // --- Google Drive / Google Sheets Backup Config ---
  private static DEFAULT_GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbychcCW3ycX_Eptt_6iavMzPnq5_lLQIpAaOUOAHR4ZhKDMemPAFeRavrLuEvkwq8jj/exec";

  static isBackupMode(): boolean {
    if (typeof window === 'undefined') return false;
    // أولاً نتحقق من الإعدادات العامة المتزامنة لضمان التفعيل أو التعطيل التلقائي لجميع المستخدمين
    try {
      const adminSettings = loadFromStorage<AdminSettings>('amrwh_admin_settings', {} as AdminSettings);
      if (adminSettings && typeof adminSettings.googleBackupActive === 'boolean') {
        return adminSettings.googleBackupActive;
      }
    } catch (e) {
      console.warn("Error reading admin settings for backup mode:", e);
    }
    const value = localStorage.getItem('amrwh_use_google_backup');
    if (value === null) {
      // معطل افتراضياً ليكون سوبابيز هو الفعال افتراضياً لجميع المستخدمين
      return false;
    }
    return value === 'true';
  }

  static setBackupMode(status: boolean): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem('amrwh_use_google_backup', status ? 'true' : 'false');
    // تحديث وحفظ الإعدادات العامة لكي تتزامن في السيرفر وتصل لجميع المستخدمين تلقائياً
    try {
      const settings = this.getAdminSettings();
      if (settings.googleBackupActive !== status) {
        settings.googleBackupActive = status;
        this.saveAdminSettings(settings);
      }
    } catch (e) {
      console.error("Error setting backup mode in admin settings:", e);
    }
    console.log(`Database backup mode set to: ${status ? 'Google Sheets' : 'Supabase/Firestore'}`);
  }

  static getGoogleScriptUrl(): string {
    if (typeof window === 'undefined') return this.DEFAULT_GOOGLE_SCRIPT_URL;
    // نتحقق أولاً من رابط سكريبت جوجل المخزن في الإعدادات العامة المتزامنة لجميع المستخدمين
    try {
      const adminSettings = loadFromStorage<AdminSettings>('amrwh_admin_settings', {} as AdminSettings);
      if (adminSettings && adminSettings.googleScriptUrl) {
        return adminSettings.googleScriptUrl;
      }
    } catch (e) {
      console.warn("Error reading admin settings for Google script URL:", e);
    }
    return localStorage.getItem('amrwh_google_script_url') || this.DEFAULT_GOOGLE_SCRIPT_URL;
  }

  static setGoogleScriptUrl(url: string): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem('amrwh_google_script_url', url);
    // تحديث وحفظ الإعدادات العامة لكي تتزامن في السيرفر وتصل لجميع المستخدمين تلقائياً
    try {
      const settings = this.getAdminSettings();
      if (settings.googleScriptUrl !== url) {
        settings.googleScriptUrl = url;
        this.saveAdminSettings(settings);
      }
    } catch (e) {
      console.error("Error setting Google script URL in admin settings:", e);
    }
    console.log(`Google Script URL set to: ${url}`);
  }

  static getGoogleBackupStats() {
    if (typeof window === 'undefined') {
      return { status: 'غير مفحوص ⚪', productsCount: 0, categoriesCount: 0, ordersCount: 0, lastCheck: '', spreadsheetUrl: '' };
    }
    return {
      status: localStorage.getItem('amrwh_google_status') || 'غير مفحوص ⚪',
      productsCount: parseInt(localStorage.getItem('amrwh_google_products_count') || '0', 10),
      categoriesCount: parseInt(localStorage.getItem('amrwh_google_categories_count') || '0', 10),
      ordersCount: parseInt(localStorage.getItem('amrwh_google_orders_count') || '0', 10),
      lastCheck: localStorage.getItem('amrwh_google_last_check') || 'لم يتم الفحص بعد',
      spreadsheetUrl: localStorage.getItem('amrwh_google_spreadsheet_url') || ''
    };
  }

  static updateGoogleBackupStats(data: any, success = true, errorStr?: string): void {
    if (typeof window === 'undefined') return;
    if (success) {
      localStorage.setItem('amrwh_google_status', 'متصل ومستقر ✅');
      localStorage.setItem('amrwh_google_last_check', new Date().toLocaleString('ar-EG'));
      
      let pCount = 0;
      let cCount = 0;
      let oCount = 0;

      if (data) {
        if (data.spreadsheetUrl) {
          localStorage.setItem('amrwh_google_spreadsheet_url', data.spreadsheetUrl);
        }
        if (Array.isArray(data)) {
          pCount = data.length;
        } else {
          // Check standard structures in case script returns nested keys
          const prods = data.products || (data.data && data.data.products);
          const cats = data.categories || (data.data && data.data.categories);
          const ords = data.orders || (data.data && data.data.orders);

          if (Array.isArray(prods)) pCount = prods.length;
          else if (Array.isArray(data.data)) pCount = data.data.length;

          if (Array.isArray(cats)) cCount = cats.length;
          if (Array.isArray(ords)) oCount = ords.length;
        }
      }

      // Sync local counts if sheet didn't return any to maintain visual integrity
      if (pCount > 0) {
        localStorage.setItem('amrwh_google_products_count', String(pCount));
      } else {
        localStorage.setItem('amrwh_google_products_count', String(this.getProducts().length));
      }

      if (cCount > 0) {
        localStorage.setItem('amrwh_google_categories_count', String(cCount));
      } else {
        const localCats = loadFromStorage<any[]>('amrwh_categories', []).length;
        localStorage.setItem('amrwh_google_categories_count', String(localCats || 13));
      }

      if (oCount > 0) {
        localStorage.setItem('amrwh_google_orders_count', String(oCount));
      } else {
        localStorage.setItem('amrwh_google_orders_count', String(this.getOrders().length));
      }
    } else {
      localStorage.setItem('amrwh_google_status', `خطأ في الاتصال ❌ (${errorStr || 'غير معروف'})`);
      localStorage.setItem('amrwh_google_last_check', new Date().toLocaleString('ar-EG'));
    }
  }

  static async fetchFromGoogleScript(action: string, payload: any = {}): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const url = this.getGoogleScriptUrl();
      const response = await fetch(url, {
        method: 'POST',
        mode: 'cors',
        headers: {
          'Content-Type': 'text/plain',
        },
        body: JSON.stringify({ action, ...payload })
      });

      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const text = await response.text();
      let result;
      try {
        result = JSON.parse(text);
      } catch (e) {
        throw new Error(`Invalid JSON response: ${text.substring(0, 100)}`);
      }
      this.updateGoogleBackupStats(result, true);
      return { success: true, data: result };
    } catch (error: any) {
      console.error(`Google Script fetch error for ${action}:`, error);
      this.updateGoogleBackupStats(null, false, error.message || String(error));
      return { success: false, error: error.message || String(error) };
    }
  }

  static async syncEventToGoogleScript(action: string, payload: any = {}): Promise<void> {
    if (!this.isBackupMode()) return;
    try {
      const res = await this.fetchFromGoogleScript(action, payload);
      if (res.success) {
        console.log(`Successfully synced event '${action}' to Google Sheets.`);
      } else {
        console.warn(`Failed to sync event '${action}' to Google Sheets: ${res.error}`);
      }
    } catch (err) {
      console.error(`Error syncing event '${action}':`, err);
    }
  }

  static async syncAllDataToGoogleDrive(): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const products = this.getProducts();
      const categories = loadFromStorage<Category[]>(this.KEYS.CATEGORIES, []);
      const locations = loadFromStorage<DeliveryLocation[]>(this.KEYS.LOCATIONS, []);
      const orders = this.getOrders();
      const tickerTexts = this.getTickerTexts();
      const settings = this.getAdminSettings();
      const advisorSettings = this.getAdvisorSettings();
      const exchangeRate = this.getExchangeRate();
      const phoneRequests = this.getPhoneRequests();
      const notifications = loadFromStorage<Notification[]>(this.KEYS.NOTIFICATIONS, []);
      const targetedNotifications = this.getTargetedNotifications();
      const targetedGifts = this.getTargetedGifts();
      const userTargetedGiftLogs = this.getUserTargetedGiftLogs();
      const allUsers = loadFromStorage<User[]>('amrwh_all_users_list', []);

      const payload = {
        products,
        categories,
        locations,
        orders,
        tickerTexts,
        settings,
        advisorSettings,
        exchangeRate,
        phoneRequests,
        notifications,
        targetedNotifications,
        targetedGifts,
        userTargetedGiftLogs,
        allUsers
      };

      return await this.fetchFromGoogleScript('syncAllData', { allData: payload });
    } catch (err: any) {
      console.error("Full database export sync failed:", err);
      return { success: false, error: err.message || String(err) };
    }
  }

  // Initialize storage keys
  private static KEYS = {
    USER: 'amrwh_user',
    CATEGORIES: 'amrwh_categories',
    PRODUCTS: 'amrwh_products',
    ORDERS: 'amrwh_orders',
    EXCHANGE_RATE: 'amrwh_exchange_rate',
    ADVISOR: 'amrwh_advisor',
    ADMIN: 'amrwh_admin',
    GIFTS: 'amrwh_gifts',
    RECHARGES: 'amrwh_recharges',
    OFFERS: 'amrwh_offers',
    PHONE_REQUESTS: 'amrwh_phone_requests',
    NOTIFICATIONS: 'amrwh_notifications',
    LOCATIONS: 'amrwh_locations',
    TARGETED_NOTIFICATIONS: 'amrwh_targeted_notifications',
    TARGETED_GIFTS: 'amrwh_targeted_gifts',
    TARGETED_GIFT_LOGS: 'amrwh_targeted_gift_logs',
    TICKER_TEXTS: 'amrwh_ticker_texts',
    ARCHIVED_EVENTS: 'amrwh_archived_events',
    CONTESTANTS: 'amrwh_contestants',
    VOTE_LOGS: 'amrwh_vote_logs',
    APP_NOTIFICATIONS: 'amrwh_app_notifications'
  };

  static initialize(): void {
    if (this.initialized) return;
    this.initialized = true;

    if (typeof window !== 'undefined') {
      let devId = localStorage.getItem('amrwh_device_id');
      if (!devId) {
        devId = 'DEV-' + Math.floor(1000000 + Math.random() * 9000000);
        localStorage.setItem('amrwh_device_id', devId);
      }
    }

    if (!localStorage.getItem(this.KEYS.USER)) {
      const randomId = generateSecureDefaultUserID();
      const randomPhone = generateSecureDefaultUserID();
      const randomNameSuffix = Math.floor(100 + Math.random() * 900);
      const devId = typeof window !== 'undefined' ? localStorage.getItem('amrwh_device_id') || '' : '';

      const uniqueUser: User = {
        id: randomId,
        name: `عميل_جديد_${randomNameSuffix}`,
        phone: randomPhone,
        address: '',
        currency: 'YER_NEW',
        balance: 0,
        giftBalance: 0,
        favorites: [],
        joinDate: new Date().toISOString().substring(0, 7),
        isRegistered: false,
        deviceId: devId
      };
      saveToStorage(this.KEYS.USER, uniqueUser);
    }
    if (!localStorage.getItem(this.KEYS.CATEGORIES)) saveToStorage(this.KEYS.CATEGORIES, []);
    if (!localStorage.getItem(this.KEYS.PRODUCTS)) saveToStorage(this.KEYS.PRODUCTS, []);
    if (!localStorage.getItem(this.KEYS.ORDERS)) saveToStorage(this.KEYS.ORDERS, []);
    if (!localStorage.getItem(this.KEYS.EXCHANGE_RATE)) saveToStorage(this.KEYS.EXCHANGE_RATE, DEFAULT_EXCHANGE_RATE);
    if (!localStorage.getItem(this.KEYS.ADVISOR)) saveToStorage(this.KEYS.ADVISOR, DEFAULT_ADVISOR_SETTINGS);
    if (!localStorage.getItem(this.KEYS.ADMIN)) saveToStorage(this.KEYS.ADMIN, DEFAULT_ADMIN_SETTINGS);
    if (!localStorage.getItem(this.KEYS.GIFTS)) saveToStorage(this.KEYS.GIFTS, []);
    if (!localStorage.getItem(this.KEYS.RECHARGES)) saveToStorage(this.KEYS.RECHARGES, []);
    if (!localStorage.getItem(this.KEYS.OFFERS)) saveToStorage(this.KEYS.OFFERS, DEFAULT_OFFERS_IMAGES);
    if (!localStorage.getItem(this.KEYS.PHONE_REQUESTS)) saveToStorage(this.KEYS.PHONE_REQUESTS, []);
    if (!localStorage.getItem(this.KEYS.NOTIFICATIONS)) saveToStorage(this.KEYS.NOTIFICATIONS, DEFAULT_NOTIFICATIONS);
    if (!localStorage.getItem(this.KEYS.LOCATIONS)) saveToStorage(this.KEYS.LOCATIONS, DEFAULT_LOCATIONS);
    if (!localStorage.getItem(this.KEYS.TARGETED_NOTIFICATIONS)) saveToStorage(this.KEYS.TARGETED_NOTIFICATIONS, []);
    if (!localStorage.getItem(this.KEYS.TARGETED_GIFTS)) saveToStorage(this.KEYS.TARGETED_GIFTS, []);
    if (!localStorage.getItem(this.KEYS.TARGETED_GIFT_LOGS)) saveToStorage(this.KEYS.TARGETED_GIFT_LOGS, []);
    if (!localStorage.getItem(this.KEYS.TICKER_TEXTS)) {
      saveToStorage(this.KEYS.TICKER_TEXTS, [
        'مرحباً بكم في متجر أم روح 🌸 منصتكم الأولى للتسوق للأسر المنتجة باليمن!',
        'توصيل سريع ومضمون لكافة المحافظات اليمنية 🚚',
        'خصومات وعروض مميزة مستمرة على كافة الأقسام 🌟'
      ]);
    }
    if (!localStorage.getItem(this.KEYS.CONTESTANTS)) saveToStorage(this.KEYS.CONTESTANTS, []);
    if (!localStorage.getItem(this.KEYS.VOTE_LOGS)) saveToStorage(this.KEYS.VOTE_LOGS, []);
    if (!localStorage.getItem(this.KEYS.APP_NOTIFICATIONS)) saveToStorage(this.KEYS.APP_NOTIFICATIONS, []);
    
    // Automatically clean up expired app notifications on load
    try {
      this.flushExpiredAppNotifications();
    } catch (e: any) {
      console.error("Error flushing expired app notifications:", e?.message || String(e));
    }

    try {
      this.migrateUserIDs();
    } catch (e: any) {
      console.error("Error running user ID migration:", e);
    }
  }

  static migrateUserIDs(): void {
    // 1. Active User Migration (guest/unregistered users whose ID or Phone starts with '7')
    const userStr = localStorage.getItem(this.KEYS.USER);
    let activeUserOldId: string | null = null;
    let activeUserNewId: string | null = null;
    let activeUserObj: User | null = null;

    if (userStr) {
      try {
        const u = JSON.parse(userStr) as User;
        if (u && !u.isRegistered) {
          let updated = false;
          if (u.id && u.id.startsWith('7')) {
            activeUserOldId = u.id;
            activeUserNewId = generateSecureDefaultUserID();
            u.id = activeUserNewId;
            updated = true;
          }
          if (u.phone && u.phone.startsWith('7')) {
            u.phone = generateSecureDefaultUserID();
            updated = true;
          }
          if (updated) {
            activeUserObj = u;
            saveToStorage(this.KEYS.USER, u);
            console.log(`[ID/Phone Migration] Migrated active user to ID: ${u.id}, Phone: ${u.phone}`);
          }
        }
      } catch (e) {
        console.warn("Active user parse failed during ID migration:", e);
      }
    }

    // 2. Entire list migration
    const allUsers = this.getAllUsers();
    let changed = false;
    const migrationsToPerform: { oldId: string; newUser: User }[] = [];

    const updatedUsers = allUsers.map(u => {
      if (u && !u.isRegistered) {
        let updated = false;
        const oldId = u.id;
        let newId = u.id;
        let newPhone = u.phone;
        
        if (u.id && u.id.startsWith('7')) {
          newId = oldId === activeUserOldId && activeUserNewId ? activeUserNewId : generateSecureDefaultUserID();
          updated = true;
        }
        if (u.phone && u.phone.startsWith('7')) {
          newPhone = generateSecureDefaultUserID();
          updated = true;
        }
        
        if (updated) {
          const newUserObj = { ...u, id: newId, phone: newPhone };
          migrationsToPerform.push({ oldId, newUser: newUserObj });
          changed = true;
          return newUserObj;
        }
      }
      return u;
    });

    if (changed) {
      saveToStorage('amrwh_all_users_list', updatedUsers);
      
      // Perform database operations to update them in the remote DB (Supabase/Firestore)
      migrationsToPerform.forEach(({ oldId, newUser }) => {
        if (isSupabaseConfigured()) {
          supabase!.from('users').delete().eq('id', oldId).then(() => {
            const compositeDeviceId = newUser.deviceId ? (newUser.ip ? `${newUser.deviceId}|IP:${newUser.ip}` : newUser.deviceId) : '';
            supabase!.from('users').insert({
              id: newUser.id,
              name: newUser.name,
              phone: newUser.phone,
              address: newUser.address,
              currency: newUser.currency,
              balance: newUser.balance,
              giftBalance: newUser.giftBalance ?? 0,
              favorites: newUser.favorites || [],
              joinDate: newUser.joinDate || '',
              isRegistered: !!newUser.isRegistered,
              deviceId: compositeDeviceId
            }).then(undefined, () => {});
          });
        } else {
          deleteDoc(doc(db, COLLECTIONS.USERS, oldId)).then(() => {
            setDoc(doc(db, COLLECTIONS.USERS, newUser.id), newUser).catch(() => {});
          });
        }
      });
    } else if (activeUserOldId && activeUserNewId && activeUserObj) {
      // If active user was migrated but not found in the list, still upsert them
      if (isSupabaseConfigured()) {
        supabase!.from('users').delete().eq('id', activeUserOldId).then(() => {
          const compositeDeviceId = activeUserObj!.deviceId ? (activeUserObj!.ip ? `${activeUserObj!.deviceId}|IP:${activeUserObj!.ip}` : activeUserObj!.deviceId) : '';
          supabase!.from('users').insert({
            id: activeUserObj!.id,
            name: activeUserObj!.name,
            phone: activeUserObj!.phone,
            address: activeUserObj!.address,
            currency: activeUserObj!.currency,
            balance: activeUserObj!.balance,
            giftBalance: activeUserObj!.giftBalance ?? 0,
            favorites: activeUserObj!.favorites || [],
            joinDate: activeUserObj!.joinDate || '',
            isRegistered: !!activeUserObj!.isRegistered,
            deviceId: compositeDeviceId
          }).then(undefined, () => {});
        });
      } else {
        deleteDoc(doc(db, COLLECTIONS.USERS, activeUserOldId)).then(() => {
          setDoc(doc(db, COLLECTIONS.USERS, activeUserObj!.id), activeUserObj!).catch(() => {});
        });
      }
    }
  }

  static seed(): void {
    this.initialize();
  }

  static async fetchPublicIP(): Promise<string> {
    try {
      const res = await fetch('https://api.ipify.org?format=json');
      if (res.ok) {
        const data = await res.json();
        return data.ip || '';
      }
    } catch (e) {
      console.warn("Could not fetch public IP:", e);
    }
    return '';
  }

  static async syncFromFirestore(onSyncComplete?: () => void, force: boolean = false): Promise<void> {
    try {
      this.initialize();
      const currentIp = await this.fetchPublicIP();
      
      if (this.isBackupMode()) {
        console.log('Database Sync: Google Sheets Mode is Active. Fetching from Google Sheets...');
        // جلب كافة الجداول في اتصال واحد لضمان استقرار وسرعة التطبيق وتوفير حصص الاستهلاك
        const res = await this.fetchFromGoogleScript('getProducts');
        if (res.success && res.data) {
          const d = res.data;
          
          // Products (المنتجات)
          const products = Array.isArray(d) ? d : (d.products || []);
          if (products && products.length > 0) {
            saveToStorage(this.KEYS.PRODUCTS, products);
            console.log(`Database Sync: Successfully loaded ${products.length} products from Google Sheets.`);
          }
          
          // Categories (الأقسام)
          const categories = d.categories || [];
          if (categories && categories.length > 0) {
            saveToStorage(this.KEYS.CATEGORIES, categories);
          }
          
          // Locations (مناطق التوصيل)
          const locations = d.locations || [];
          if (locations && locations.length > 0) {
            saveToStorage(this.KEYS.LOCATIONS, locations);
          }
          
          // Orders (الطلبات)
          const orders = d.orders || [];
          if (orders && orders.length > 0) {
            saveToStorage(this.KEYS.ORDERS, orders);
          }
          
          // Ticker Texts (شريط الأخبار)
          const tickerTexts = d.tickerTexts || [];
          if (tickerTexts && tickerTexts.length > 0) {
            saveToStorage(this.KEYS.TICKER_TEXTS, tickerTexts);
          }
          
          // Settings (الإعدادات العامة والمنسق وأسعار الصرف وصور العروض)
          if (d.settings) saveToStorage(this.KEYS.ADMIN, d.settings);
          if (d.advisorSettings) saveToStorage(this.KEYS.ADVISOR, d.advisorSettings);
          if (d.exchangeRate) saveToStorage(this.KEYS.EXCHANGE_RATE, d.exchangeRate);
          if (d.offers) saveToStorage(this.KEYS.OFFERS, d.offers);
          
          // Users (المستخدمين والحسابات)
          const allUsers = d.allUsers || [];
          if (allUsers && allUsers.length > 0) {
            const parsedUsers = allUsers.map((u: any) => {
              let rawDevId = u.deviceId || '';
              let parsedDevId = rawDevId;
              let parsedIp = u.ip || '';
              if (rawDevId.includes('|')) {
                const parts = rawDevId.split('|');
                parsedDevId = parts[0];
                if (parts[1] && parts[1].startsWith('IP:')) {
                  parsedIp = parts[1].replace('IP:', '');
                }
              }
              return {
                ...u,
                deviceId: parsedDevId,
                ip: parsedIp
              };
            });
            saveToStorage('amrwh_all_users_list', parsedUsers);
            const active = this.getUser();
            if (currentIp) {
              active.ip = currentIp;
              saveToStorage(this.KEYS.USER, active);
            }
            let found = parsedUsers.find(u => u.id === active.id);
            const currentDevId = typeof window !== 'undefined' ? localStorage.getItem('amrwh_device_id') || '' : '';
            if (!found && currentDevId) {
              found = parsedUsers.find(u => u.deviceId === currentDevId && u.isRegistered);
            }
            if (found) {
              saveToStorage(this.KEYS.USER, found);
            }
          }
          
          // Phone requests (طلبات الأرقام وفك الأجهزة)
          const phoneRequests = d.phoneRequests || [];
          if (phoneRequests && phoneRequests.length > 0) {
            saveToStorage(this.KEYS.PHONE_REQUESTS, phoneRequests);
          }
          
          // Notifications (الإشعارات العامة)
          const notifications = d.notifications || [];
          if (notifications && notifications.length > 0) {
            saveToStorage(this.KEYS.NOTIFICATIONS, notifications);
          }
          
          // Targeted Notifications (الإشعارات الموجهة)
          const targetedNotifications = d.targetedNotifications || [];
          if (targetedNotifications && targetedNotifications.length > 0) {
            saveToStorage(this.KEYS.TARGETED_NOTIFICATIONS, targetedNotifications);
          }
          
          // Targeted Gifts & Logs (الهدايا الموجهة وسجلاتها)
          const targetedGifts = d.targetedGifts || [];
          if (targetedGifts && targetedGifts.length > 0) {
            saveToStorage(this.KEYS.TARGETED_GIFTS, targetedGifts);
          }
          const userTargetedGiftLogs = d.userTargetedGiftLogs || [];
          if (userTargetedGiftLogs && userTargetedGiftLogs.length > 0) {
            saveToStorage(this.KEYS.TARGETED_GIFT_LOGS, userTargetedGiftLogs);
          }
          
          // Recharges & Gifts (طلبات الشحن وسجل الهدايا)
          const recharges = d.recharges || [];
          if (recharges && recharges.length > 0) {
            saveToStorage(this.KEYS.RECHARGES, recharges);
          }
          const gifts = d.gifts || [];
          if (gifts && gifts.length > 0) {
            saveToStorage(this.KEYS.GIFTS, gifts);
          }

          saveToStorage('amrwh_last_sync_success', 'true');
          saveToStorage('amrwh_last_sync_timestamp', new Date().toISOString());
        }
        if (onSyncComplete) onSyncComplete();
        return;
      }
      
      // Throttle background syncs to avoid exceeding free-tier Firestore quota
      if (!force) {
        const lastSync = this.getLastSyncTime();
        if (lastSync) {
          const diffMs = Date.now() - new Date(lastSync).getTime();
          if (diffMs < 5 * 60 * 1000) { // 5 minutes throttle
            console.log('Database Sync: Throttled background sync (last sync was less than 5 min ago)');
            if (onSyncComplete) onSyncComplete();
            return;
          }
        }
      }

      if (isSupabaseConfigured()) {
        console.log('Database Sync: Syncing from Supabase...');
        let advRes, admRes, genRes, catRes, prodRes, locRes, usersRes, orderRes, giftRes, rechRes, phoneRes, notifRes, tNotifRes, tGiftsRes, tLogsRes, tickerRes, archivedEventsRes, contestantsRes, voteLogsRes, appNotificationsRes;
        
        let results;
        let isFinished = false;

        const performFetch = () => Promise.all([
          supabase!.from('settings').select('*').eq('id', 'advisor').maybeSingle(),
          supabase!.from('settings').select('*').eq('id', 'admin').maybeSingle(),
          supabase!.from('settings').select('*').eq('id', 'general').maybeSingle(),
          supabase!.from('categories').select('*'),
          supabase!.from('products').select('*'),
          supabase!.from('locations').select('*'),
          supabase!.from('users').select('*'),
          supabase!.from('orders').select('*'),
          supabase!.from('gifts').select('*'),
          supabase!.from('recharges').select('*'),
          supabase!.from('phone_requests').select('*'),
          supabase!.from('notifications').select('*'),
          supabase!.from('targeted_notifications').select('*'),
          supabase!.from('targeted_gifts').select('*'),
          supabase!.from('targeted_gift_logs').select('*'),
          supabase!.from('ticker_texts').select('*'),
          supabase!.from('archived_events').select('*'),
          supabase!.from('contestants').select('*'),
          supabase!.from('vote_logs').select('*'),
          supabase!.from('app_notifications').select('*')
        ]);

        let directTimeoutId: any = null;
        const directTimeoutPromise = new Promise<never>((_, reject) => {
          directTimeoutId = setTimeout(() => {
            reject(new Error('TIMEOUT_DIRECT'));
          }, 4000);
        });

        try {
          console.log('Database Sync: Attempting direct connection...');
          results = await Promise.race([
            performFetch(),
            directTimeoutPromise
          ]);
          isFinished = true;
          if (directTimeoutId) clearTimeout(directTimeoutId);
          console.log("Database Sync: Direct connection succeeded within 4s.");
        } catch (e: any) {
          if (directTimeoutId) clearTimeout(directTimeoutId);
          console.warn("Database Sync: Direct connection failed or timed out (4s limit). Error:", e.message || e);

          if (!isProxyActive()) {
            console.log("Database Sync: Switching client to Proxy...");
            switchToProxy();
          }

          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('amrwh_network_slow', {
              detail: {
                hasCache: this.hasSyncedOnce()
              }
            }));
          }

          try {
            console.log("Database Sync: Retrying fetch via Vercel Proxy...");
            results = await performFetch();
            isFinished = true;
            console.log("Database Sync: Proxy connection succeeded!");
          } catch (proxyError: any) {
            console.error("Database Sync: Proxy connection also failed:", proxyError);
            if (typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('amrwh_network_slow', {
                detail: {
                  hasCache: this.hasSyncedOnce()
                }
              }));
            }
            if (onSyncComplete) onSyncComplete();
            return;
          }
        }

        [
          advRes,
          admRes,
          genRes,
          catRes,
          prodRes,
          locRes,
          usersRes,
          orderRes,
          giftRes,
          rechRes,
          phoneRes,
          notifRes,
          tNotifRes,
          tGiftsRes,
          tLogsRes,
          tickerRes,
          archivedEventsRes,
          contestantsRes,
          voteLogsRes,
          appNotificationsRes
        ] = results;

        if (catRes.error) console.warn("Supabase categories load error:", catRes.error);
        if (prodRes.error) console.warn("Supabase products load error:", prodRes.error);

        // Process Advisor Settings
        if (advRes.data) {
          saveToStorage(this.KEYS.ADVISOR, advRes.data.data);
        } else {
          supabase!.from('settings').insert({ id: 'advisor', data: DEFAULT_ADVISOR_SETTINGS }).then(undefined, () => {});
        }

        // Process Admin Settings
        if (admRes.data) {
          saveToStorage(this.KEYS.ADMIN, admRes.data.data);
        } else {
          supabase!.from('settings').insert({ id: 'admin', data: DEFAULT_ADMIN_SETTINGS }).then(undefined, () => {});
        }

        // Process General Settings
        if (genRes.data) {
          const genData = genRes.data.data;
          if (genData?.exchangeRate) {
            saveToStorage(this.KEYS.EXCHANGE_RATE, genData.exchangeRate);
          }
          if (genData?.offers) {
            saveToStorage(this.KEYS.OFFERS, genData.offers);
          }
          if (genData?.tickerTexts && Array.isArray(genData.tickerTexts) && genData.tickerTexts.length > 0) {
            saveToStorage(this.KEYS.TICKER_TEXTS, genData.tickerTexts);
          }
        } else {
          supabase!.from('settings').insert({ id: 'general', data: { exchangeRate: DEFAULT_EXCHANGE_RATE, offers: DEFAULT_OFFERS_IMAGES } }).then(undefined, () => {});
        }

        // Process News Ticker
        if (tickerRes.data && tickerRes.data.length > 0) {
          const sorted = [...tickerRes.data].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
          const texts = sorted.map(t => t.text).filter(Boolean);
          saveToStorage(this.KEYS.TICKER_TEXTS, texts);
        } else {
          const defaultTicker = [
            'مرحباً بكم في متجر أم روح 🌸 منصتكم الأولى للتسوق للأسر المنتجة باليمن!',
            'توصيل سريع ومضمون لكافة المحافظات اليمنية 🚚',
            'خصومات وعروض مميزة مستمرة على كافة الأقسام 🌟'
          ];
          defaultTicker.forEach((text, i) => {
            supabase!.from('ticker_texts').insert({ id: `ticker_${i}`, text, sortOrder: i, createdAt: new Date().toISOString() }).then(undefined, () => {});
          });
          saveToStorage(this.KEYS.TICKER_TEXTS, defaultTicker);
        }

        // Process Categories
        if (catRes.data && catRes.data.length > 0) {
          saveToStorage(this.KEYS.CATEGORIES, catRes.data);
        } else {
          DEFAULT_CATEGORIES.forEach(cat => {
            supabase!.from('categories').insert(cat).then(undefined, () => {});
          });
          saveToStorage(this.KEYS.CATEGORIES, DEFAULT_CATEGORIES);
        }

        // Process Products
        if (prodRes.data && prodRes.data.length > 0) {
          saveToStorage(this.KEYS.PRODUCTS, prodRes.data);
        } else {
          DEFAULT_PRODUCTS.forEach(prod => {
            supabase!.from('products').insert(prod).then(undefined, () => {});
          });
          saveToStorage(this.KEYS.PRODUCTS, DEFAULT_PRODUCTS);
        }

        // Process Locations
        if (locRes.data && locRes.data.length > 0) {
          saveToStorage(this.KEYS.LOCATIONS, locRes.data);
        } else {
          DEFAULT_LOCATIONS.forEach(loc => {
            supabase!.from('locations').insert(loc).then(undefined, () => {});
          });
          saveToStorage(this.KEYS.LOCATIONS, DEFAULT_LOCATIONS);
        }

        // Process Users
        const allUsers: User[] = (usersRes.data || []).map((u: any) => {
          let rawDevId = u.deviceId || '';
          let parsedDevId = rawDevId;
          let parsedIp = '';
          if (rawDevId.includes('|')) {
            const parts = rawDevId.split('|');
            parsedDevId = parts[0];
            if (parts[1] && parts[1].startsWith('IP:')) {
              parsedIp = parts[1].replace('IP:', '');
            }
          }
          return {
            id: u.id,
            name: u.name,
            phone: u.phone,
            address: u.address,
            currency: u.currency,
            balance: Number(u.balance || 0),
            giftBalance: Number(u.giftBalance || 0),
            favorites: u.favorites || [],
            joinDate: u.joinDate,
            isRegistered: !!u.isRegistered,
            deviceId: parsedDevId,
            ip: parsedIp,
            balanceCurrency: u.balanceCurrency || 'YER_NEW',
            giftBalanceCurrency: u.giftBalanceCurrency || 'YER_NEW'
          };
        });
        if (allUsers.length > 0) {
          saveToStorage('amrwh_all_users_list', allUsers);
          const active = this.getUser();
          if (currentIp) {
            active.ip = currentIp;
            saveToStorage(this.KEYS.USER, active);
          }
          let found = allUsers.find(u => u.id === active.id);
          const currentDevId = typeof window !== 'undefined' ? localStorage.getItem('amrwh_device_id') || '' : '';
          if (!found && currentDevId) {
            found = allUsers.find(u => u.deviceId === currentDevId && u.isRegistered);
          }
          if (found) {
            if (!found.deviceId && currentDevId) {
              found.deviceId = currentDevId;
            }
            if (currentIp) {
              found.ip = currentIp;
            }
            saveToStorage(this.KEYS.USER, found);
            const compositeDeviceId = found.deviceId ? (found.ip ? `${found.deviceId}|IP:${found.ip}` : found.deviceId) : '';
            supabase!.from('users').update({ deviceId: compositeDeviceId }).eq('id', found.id).then(undefined, () => {});
          } else {
            if (!active.deviceId && currentDevId) {
              active.deviceId = currentDevId;
            }
            const compositeDeviceId = active.deviceId ? (active.ip ? `${active.deviceId}|IP:${active.ip}` : active.deviceId) : '';
            supabase!.from('users').insert({
              id: active.id,
              name: active.name,
              phone: active.phone,
              address: active.address,
              currency: active.currency,
              balance: active.balance,
              giftBalance: active.giftBalance ?? 0,
              favorites: active.favorites || [],
              joinDate: active.joinDate || '',
              isRegistered: !!active.isRegistered,
              deviceId: compositeDeviceId
            }).then(undefined, () => {});
          }
        } else {
          const active = this.getUser();
          if (currentIp) {
            active.ip = currentIp;
          }
          const currentDevId = typeof window !== 'undefined' ? localStorage.getItem('amrwh_device_id') || '' : '';
          if (!active.deviceId && currentDevId) {
            active.deviceId = currentDevId;
          }
          const compositeDeviceId = active.deviceId ? (active.ip ? `${active.deviceId}|IP:${active.ip}` : active.deviceId) : '';
          supabase!.from('users').insert({
            id: active.id,
            name: active.name,
            phone: active.phone,
            address: active.address,
            currency: active.currency,
            balance: active.balance,
            giftBalance: active.giftBalance ?? 0,
            favorites: active.favorites || [],
            joinDate: active.joinDate || '',
            isRegistered: !!active.isRegistered,
            deviceId: compositeDeviceId
          }).then(undefined, () => {});
        }

        // Process Orders
        saveToStorage(this.KEYS.ORDERS, orderRes.data || []);

        // Process Gifts
        saveToStorage(this.KEYS.GIFTS, giftRes.data || []);

        // Process Recharges
        saveToStorage(this.KEYS.RECHARGES, rechRes.data || []);

        // Process Phone Requests
        saveToStorage(this.KEYS.PHONE_REQUESTS, phoneRes.data || []);

        // Process Notifications
        if (notifRes.data && notifRes.data.length > 0) {
          saveToStorage(this.KEYS.NOTIFICATIONS, notifRes.data);
        } else {
          DEFAULT_NOTIFICATIONS.forEach(n => {
            supabase!.from('notifications').insert(n).then(undefined, () => {});
          });
          saveToStorage(this.KEYS.NOTIFICATIONS, DEFAULT_NOTIFICATIONS);
        }

        // Process Targeted Notifications
        saveToStorage(this.KEYS.TARGETED_NOTIFICATIONS, tNotifRes.data || []);

        // Process Targeted Gifts
        saveToStorage(this.KEYS.TARGETED_GIFTS, tGiftsRes.data || []);

        // Process Targeted Gift Logs
        saveToStorage(this.KEYS.TARGETED_GIFT_LOGS, tLogsRes.data || []);

        // Process Archived Events, Contestants, Vote Logs, App Notifications
        saveToStorage(this.KEYS.ARCHIVED_EVENTS, archivedEventsRes.data || []);
        saveToStorage(this.KEYS.CONTESTANTS, contestantsRes.data || []);
        saveToStorage(this.KEYS.VOTE_LOGS, voteLogsRes.data || []);
        saveToStorage(this.KEYS.APP_NOTIFICATIONS, appNotificationsRes.data || []);

        // Save synchronization metadata
        saveToStorage('amrwh_last_sync_success', 'true');
        saveToStorage('amrwh_last_sync_timestamp', new Date().toISOString());

        if (onSyncComplete) onSyncComplete();
        return;
      }
      
      // Perform all read queries concurrently in parallel with a defensive 4000ms timeout
      // This protects the application from freezing or throwing 10s timeout warnings in limited networks
      // Perform all read queries concurrently in parallel with a defensive 4000ms timeout
      // This protects the application from freezing or throwing 10s timeout warnings in limited networks
      const [
        advDoc,
        admDoc,
        genDoc,
        catSnap,
        prodSnap,
        locSnap,
        usersSnap,
        orderSnap,
        giftSnap,
        rechSnap,
        phoneSnap,
        notifSnap,
        tNotifSnap,
        tGiftsSnap,
        tLogsSnap,
        tickerSnap,
        eventsSnap,
        contestantsSnap,
        votesSnap,
        appNotifsSnap
      ] = await Promise.race([
        Promise.all([
          getDoc(doc(db, COLLECTIONS.SETTINGS, 'advisor')).catch(() => null),
          getDoc(doc(db, COLLECTIONS.SETTINGS, 'admin')).catch(() => null),
          getDoc(doc(db, COLLECTIONS.SETTINGS, 'general')).catch(() => null),
          getDocs(collection(db, COLLECTIONS.CATEGORIES)).catch(() => null),
          getDocs(collection(db, COLLECTIONS.PRODUCTS)).catch(() => null),
          getDocs(collection(db, COLLECTIONS.LOCATIONS)).catch(() => null),
          getDocs(collection(db, COLLECTIONS.USERS)).catch(() => null),
          getDocs(collection(db, COLLECTIONS.ORDERS)).catch(() => null),
          getDocs(collection(db, COLLECTIONS.GIFTS)).catch(() => null),
          getDocs(collection(db, COLLECTIONS.RECHARGES)).catch(() => null),
          getDocs(collection(db, COLLECTIONS.PHONE_REQUESTS)).catch(() => null),
          getDocs(collection(db, COLLECTIONS.NOTIFICATIONS)).catch(() => null),
          getDocs(collection(db, COLLECTIONS.TARGETED_NOTIFICATIONS)).catch(() => null),
          getDocs(collection(db, COLLECTIONS.TARGETED_GIFTS)).catch(() => null),
          getDocs(collection(db, COLLECTIONS.TARGETED_GIFT_LOGS)).catch(() => null),
          getDocs(collection(db, COLLECTIONS.TICKER_TEXTS)).catch(() => null),
          getDocs(collection(db, COLLECTIONS.ARCHIVED_EVENTS)).catch(() => null),
          getDocs(collection(db, COLLECTIONS.CONTESTANTS)).catch(() => null),
          getDocs(collection(db, COLLECTIONS.VOTE_LOGS)).catch(() => null),
          getDocs(collection(db, COLLECTIONS.APP_NOTIFICATIONS)).catch(() => null)
        ]),
        new Promise<any[]>((_, reject) => 
          setTimeout(() => reject(new Error('Firestore operation timeout (4000ms)')), 4000)
        )
      ]);

      // 1. Process Settings (Advisor, Admin, General)
      if (advDoc && typeof advDoc.exists === 'function' && advDoc.exists()) {
        const advData = advDoc.data() as AdvisorSettings;
        saveToStorage(this.KEYS.ADVISOR, advData);
      } else if (advDoc) {
        setDoc(doc(db, COLLECTIONS.SETTINGS, 'advisor'), DEFAULT_ADVISOR_SETTINGS)
          .catch(err => console.warn('Non-blocking init write failed:', err));
      }

      if (admDoc && typeof admDoc.exists === 'function' && admDoc.exists()) {
        const admData = admDoc.data() as AdminSettings;
        saveToStorage(this.KEYS.ADMIN, admData);
      } else if (admDoc) {
        setDoc(doc(db, COLLECTIONS.SETTINGS, 'admin'), DEFAULT_ADMIN_SETTINGS)
          .catch(err => console.warn('Non-blocking init write failed:', err));
      }

      if (genDoc && typeof genDoc.exists === 'function' && genDoc.exists()) {
        const genData = genDoc.data();
        if (genData?.exchangeRate) {
          saveToStorage(this.KEYS.EXCHANGE_RATE, genData.exchangeRate);
        }
        if (genData?.offers) {
          saveToStorage(this.KEYS.OFFERS, genData.offers);
        }
        if (genData?.tickerTexts && Array.isArray(genData.tickerTexts) && genData.tickerTexts.length > 0) {
          saveToStorage(this.KEYS.TICKER_TEXTS, genData.tickerTexts);
        }
      } else if (genDoc) {
        setDoc(doc(db, COLLECTIONS.SETTINGS, 'general'), {
          exchangeRate: DEFAULT_EXCHANGE_RATE,
          offers: DEFAULT_OFFERS_IMAGES
        }).catch(err => console.warn('Non-blocking init write failed:', err));
      }

      // Process News Ticker Texts from the dedicated collection (table)
      if (tickerSnap && typeof tickerSnap.forEach === 'function') {
        if (!tickerSnap.empty) {
          const tickerList: any[] = [];
          tickerSnap.forEach(d => tickerList.push(d.data()));
          tickerList.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
          const texts = tickerList.map(item => item.text).filter(Boolean);
          if (texts.length > 0) {
            saveToStorage(this.KEYS.TICKER_TEXTS, texts);
          }
        } else {
          const defaultTicker = [
            'مرحباً بكم في متجر أم روح 🌸 منصتكم الأولى للتسوق للأسر المنتجة باليمن!',
            'توصيل سريع ومضمون لكافة المحافظات اليمنية 🚚',
            'خصومات وعروض مميز مستمرة على كافة الأقسام 🌟'
          ];
          defaultTicker.forEach((text, i) => {
            setDoc(doc(db, COLLECTIONS.TICKER_TEXTS, `ticker_${i}`), {
              id: `ticker_${i}`,
              text,
              sortOrder: i,
              createdAt: new Date().toISOString()
            }).catch(() => {});
          });
          saveToStorage(this.KEYS.TICKER_TEXTS, defaultTicker);
        }
      }

      // 2. Process Categories
      if (catSnap && typeof catSnap.forEach === 'function') {
        if (catSnap.empty) {
          DEFAULT_CATEGORIES.forEach(cat => {
            setDoc(doc(db, COLLECTIONS.CATEGORIES, cat.id), cat)
              .catch(err => console.warn('Non-blocking init write failed:', err));
          });
        } else {
          const cats: Category[] = [];
          catSnap.forEach(d => cats.push(d.data() as Category));
          saveToStorage(this.KEYS.CATEGORIES, cats);
        }
      }

      // 3. Process Products
      if (prodSnap && typeof prodSnap.forEach === 'function') {
        if (prodSnap.empty) {
          DEFAULT_PRODUCTS.forEach(prod => {
            setDoc(doc(db, COLLECTIONS.PRODUCTS, prod.id), prod)
              .catch(err => console.warn('Non-blocking init write failed:', err));
          });
        } else {
          const prods: Product[] = [];
          prodSnap.forEach(d => prods.push(d.data() as Product));
          saveToStorage(this.KEYS.PRODUCTS, prods);
        }
      }

      // 4. Process Locations
      if (locSnap && typeof locSnap.forEach === 'function') {
        if (locSnap.empty) {
          DEFAULT_LOCATIONS.forEach(loc => {
            setDoc(doc(db, COLLECTIONS.LOCATIONS, loc.id), loc)
              .catch(err => console.warn('Non-blocking init write failed:', err));
          });
        } else {
          const locs: DeliveryLocation[] = [];
          locSnap.forEach(d => locs.push(d.data() as DeliveryLocation));
          saveToStorage(this.KEYS.LOCATIONS, locs);
        }
      }

      // 5. Process Users
      if (usersSnap && typeof usersSnap.forEach === 'function') {
        const allUsers: User[] = [];
        usersSnap.forEach(d => allUsers.push(d.data() as User));
        if (allUsers.length > 0) {
          saveToStorage('amrwh_all_users_list', allUsers);
          const active = this.getUser();
          let found = allUsers.find(u => u.id === active.id);
          
          const currentDevId = typeof window !== 'undefined' ? localStorage.getItem('amrwh_device_id') || '' : '';
          if (!found && currentDevId) {
            found = allUsers.find(u => u.deviceId === currentDevId && u.isRegistered);
          } else if (found && !found.isRegistered && currentDevId) {
            const registeredDevUser = allUsers.find(u => u.deviceId === currentDevId && u.isRegistered);
            if (registeredDevUser) {
              found = registeredDevUser;
            }
          }

          if (found) {
            if (!found.deviceId && currentDevId) {
              found.deviceId = currentDevId;
              setDoc(doc(db, COLLECTIONS.USERS, found.id), found)
                .catch(err => console.warn('Non-blocking user update failed:', err));
            }
            saveToStorage(this.KEYS.USER, found);
          } else {
            if (!active.deviceId && currentDevId) {
              active.deviceId = currentDevId;
            }
            setDoc(doc(db, COLLECTIONS.USERS, active.id), active)
              .catch(err => console.warn('Non-blocking user save failed:', err));
          }
        } else {
          const active = this.getUser();
          const currentDevId = typeof window !== 'undefined' ? localStorage.getItem('amrwh_device_id') || '' : '';
          if (!active.deviceId && currentDevId) {
            active.deviceId = currentDevId;
          }
          setDoc(doc(db, COLLECTIONS.USERS, active.id), active)
            .catch(err => console.warn('Non-blocking user save failed:', err));
        }
      }

      // 6. Process Orders
      if (orderSnap && typeof orderSnap.forEach === 'function') {
        const orders: Order[] = [];
        orderSnap.forEach(d => orders.push(d.data() as Order));
        saveToStorage(this.KEYS.ORDERS, orders);
      }

      // 7. Process Gifts
      if (giftSnap && typeof giftSnap.forEach === 'function') {
        const gifts: Gift[] = [];
        giftSnap.forEach(d => gifts.push(d.data() as Gift));
        saveToStorage(this.KEYS.GIFTS, gifts);
      }

      // 8. Process Recharges
      if (rechSnap && typeof rechSnap.forEach === 'function') {
        const recharges: RechargeRequest[] = [];
        rechSnap.forEach(d => recharges.push(d.data() as RechargeRequest));
        saveToStorage(this.KEYS.RECHARGES, recharges);
      }

      // 9. Process Phone Requests
      if (phoneSnap && typeof phoneSnap.forEach === 'function') {
        const phoneReqs: PhoneChangeRequest[] = [];
        phoneSnap.forEach(d => phoneReqs.push(d.data() as PhoneChangeRequest));
        saveToStorage(this.KEYS.PHONE_REQUESTS, phoneReqs);
      }

      // 10. Process Notifications
      if (notifSnap && typeof notifSnap.forEach === 'function') {
        if (notifSnap.empty) {
          DEFAULT_NOTIFICATIONS.forEach(n => {
            setDoc(doc(db, COLLECTIONS.NOTIFICATIONS, n.id), n)
              .catch(err => console.warn('Non-blocking init write failed:', err));
          });
        } else {
          const notifications: Notification[] = [];
          notifSnap.forEach(d => notifications.push(d.data() as Notification));
          saveToStorage(this.KEYS.NOTIFICATIONS, notifications);
        }
      }

      // 11. Process Targeted Notifications
      if (tNotifSnap && typeof tNotifSnap.forEach === 'function') {
        const tNotifications: TargetedNotification[] = [];
        tNotifSnap.forEach(d => tNotifications.push(d.data() as TargetedNotification));
        saveToStorage(this.KEYS.TARGETED_NOTIFICATIONS, tNotifications);
      }

      // 12. Process Targeted Gifts
      if (tGiftsSnap && typeof tGiftsSnap.forEach === 'function') {
        const tGifts: TargetedGift[] = [];
        tGiftsSnap.forEach(d => tGifts.push(d.data() as TargetedGift));
        saveToStorage(this.KEYS.TARGETED_GIFTS, tGifts);
      }

      // 13. Process Targeted Gift Logs
      if (tLogsSnap && typeof tLogsSnap.forEach === 'function') {
        const tLogs: UserTargetedGiftLog[] = [];
        tLogsSnap.forEach(d => tLogs.push(d.data() as UserTargetedGiftLog));
        saveToStorage(this.KEYS.TARGETED_GIFT_LOGS, tLogs);
      }

      // 14. Process Archived Events
      if (eventsSnap && typeof eventsSnap.forEach === 'function') {
        const archivedEvents: ArchivedEvent[] = [];
        eventsSnap.forEach(d => archivedEvents.push(d.data() as ArchivedEvent));
        saveToStorage(this.KEYS.ARCHIVED_EVENTS, archivedEvents);
      }

      // 15. Process Contestants
      if (contestantsSnap && typeof contestantsSnap.forEach === 'function') {
        const contestants: Contestant[] = [];
        contestantsSnap.forEach(d => contestants.push(d.data() as Contestant));
        saveToStorage(this.KEYS.CONTESTANTS, contestants);
      }

      // 16. Process Vote Logs
      if (votesSnap && typeof votesSnap.forEach === 'function') {
        const voteLogs: VoteLog[] = [];
        votesSnap.forEach(d => voteLogs.push(d.data() as VoteLog));
        saveToStorage(this.KEYS.VOTE_LOGS, voteLogs);
      }

      // 17. Process App Notifications
      if (appNotifsSnap && typeof appNotifsSnap.forEach === 'function') {
        const appNotifs: AppNotification[] = [];
        appNotifsSnap.forEach(d => appNotifs.push(d.data() as AppNotification));
        saveToStorage(this.KEYS.APP_NOTIFICATIONS, appNotifs);
      }

      // Save synchronization metadata
      saveToStorage('amrwh_last_sync_success', 'true');
      saveToStorage('amrwh_last_sync_timestamp', new Date().toISOString());

      if (onSyncComplete) onSyncComplete();
    } catch (e) {
      console.warn("Failed to sync, trying Google Sheets backup fallback...", e);
      try {
        const res = await this.fetchFromGoogleScript('getProducts');
        if (res.success && res.data) {
          const products = Array.isArray(res.data) ? res.data : (res.data.products || []);
          if (products && products.length > 0) {
            saveToStorage(this.KEYS.PRODUCTS, products);
          }
          const categories = res.data.categories || [];
          if (categories && categories.length > 0) {
            saveToStorage(this.KEYS.CATEGORIES, categories);
          }
          saveToStorage('amrwh_last_sync_success', 'true');
          saveToStorage('amrwh_last_sync_timestamp', new Date().toISOString());
        }
      } catch (backupErr) {
        console.error("Google Sheets backup fallback also failed:", backupErr);
      }
      if (onSyncComplete) onSyncComplete();
    }
  }

  static hasSyncedOnce(): boolean {
    return localStorage.getItem('amrwh_last_sync_success') === 'true';
  }

  static getLastSyncTime(): string | null {
    return localStorage.getItem('amrwh_last_sync_timestamp');
  }

  static getDeviceId(): string {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('amrwh_device_id') || 'DEV-UNKNOWN';
    }
    return 'DEV-UNKNOWN';
  }

  static getAdminCode(): string {
    return this.getAdminSettings().code;
  }

  // --- USER OPERATIONS ---
  static getUser(): User {
    this.initialize();
    let u = localStorage.getItem(this.KEYS.USER);
    let userObj: User;
    if (!u) {
      // Generate a unique 9-digit random ID starting with '9'
      const randomId = '9' + Math.floor(10000000 + Math.random() * 90000000).toString();
      // Generate a unique 9-digit random default phone number starting with '9' (avoids conflicts with real numbers starting with 7)
      const randomPhone = '9' + Math.floor(10000000 + Math.random() * 90000000).toString();
      
      userObj = {
        id: randomId,
        name: 'زائر كريم',
        phone: randomPhone,
        address: '',
        currency: 'YER_NEW',
        balance: 0,
        giftBalance: 0,
        favorites: [],
        joinDate: new Date().toISOString().substring(0, 7),
        isRegistered: false,
        balanceCurrency: 'YER_NEW',
        giftBalanceCurrency: 'YER_NEW'
      };
      saveToStorage(this.KEYS.USER, userObj);
    } else {
      userObj = JSON.parse(u);
    }
    
    if (localStorage.getItem('amrwh_customer_registered') === 'true') {
      userObj.isRegistered = true;
    }
    if (typeof window !== 'undefined' && !userObj.deviceId) {
      userObj.deviceId = localStorage.getItem('amrwh_device_id') || '';
      saveToStorage(this.KEYS.USER, userObj);
    }
    return userObj;
  }

  static saveUser(user: User): User {
    if (user.isRegistered) {
      localStorage.setItem('amrwh_customer_registered', 'true');
    }
    const allUsers = this.getAllUsers();
    const existing = allUsers.find(u => u.phone === user.phone && u.id !== user.id);
    let userToSave = user;
    if (existing) {
      console.log(`Found existing user ${existing.id} with phone ${user.phone}. Switching ID from ${user.id} to ${existing.id} to avoid duplicate phone violation.`);
      userToSave = {
        ...existing,
        name: (user.name && !user.name.startsWith('عميل_جديد_')) ? user.name : existing.name,
        address: user.address || existing.address,
        currency: user.currency || existing.currency,
        deviceId: existing.deviceId || user.deviceId,
        ip: user.ip || existing.ip,
        isRegistered: user.isRegistered || existing.isRegistered,
        balance: Math.max(user.balance || 0, existing.balance || 0),
        giftBalance: Math.max(user.giftBalance ?? 0, existing.giftBalance ?? 0),
        favorites: Array.from(new Set([...(user.favorites || []), ...(existing.favorites || [])])),
        balanceCurrency: user.balanceCurrency || existing.balanceCurrency,
        giftBalanceCurrency: user.giftBalanceCurrency || existing.giftBalanceCurrency
      };
    }
    saveToStorage(this.KEYS.USER, userToSave);
    this.syncEventToGoogleScript('saveUser', { user: userToSave });
    if (isSupabaseConfigured()) {
      const compositeDeviceId = userToSave.deviceId ? (userToSave.ip ? `${userToSave.deviceId}|IP:${userToSave.ip}` : userToSave.deviceId) : '';
      supabase!.from('users').upsert({
        id: userToSave.id,
        name: userToSave.name,
        phone: userToSave.phone,
        address: userToSave.address,
        currency: userToSave.currency,
        balance: userToSave.balance,
        giftBalance: userToSave.giftBalance ?? 0,
        favorites: userToSave.favorites || [],
        joinDate: userToSave.joinDate || '',
        isRegistered: !!userToSave.isRegistered,
        deviceId: compositeDeviceId,
        balanceCurrency: userToSave.balanceCurrency || 'YER_NEW',
        giftBalanceCurrency: userToSave.giftBalanceCurrency || 'YER_NEW'
      }).then(({ error }) => {
        if (error) handleSupabaseError(error, 'users', 'save');
      });
    } else {
      setDoc(doc(db, COLLECTIONS.USERS, userToSave.id), userToSave).catch(e => {
        console.error("Firestore user save error:", e);
        handleFirestoreError(e, OperationType.WRITE, COLLECTIONS.USERS);
      });
    }
    return userToSave;
  }

  static async migrateUserIdsFrom7To9(): Promise<{ migratedCount: number }> {
    this.initialize();
    const allUsers = this.getAllUsers();
    let migratedCount = 0;
    
    const orders = this.getOrders();
    const gifts = this.getGifts();
    const recharges = this.getRechargeRequests();
    const notifications = loadFromStorage<Notification[]>(this.KEYS.NOTIFICATIONS, []);
    const phoneRequests = this.getPhoneRequests();
    const contestants = this.getContestants();
    
    let ordersChanged = false;
    let giftsChanged = false;
    let rechargesChanged = false;
    let notificationsChanged = false;
    let phoneRequestsChanged = false;
    let contestantsChanged = false;
    
    for (const u of allUsers) {
      if (u.id && u.id.startsWith('7')) {
        const oldId = u.id;
        const newId = '9' + oldId.substring(1);
        
        u.id = newId;
        migratedCount++;
        
        orders.forEach(o => {
          if (o.userId === oldId) {
            o.userId = newId;
            ordersChanged = true;
          }
        });
        
        gifts.forEach(g => {
          if (g.userId === oldId) {
            g.userId = newId;
            giftsChanged = true;
          }
        });
        
        recharges.forEach(r => {
          if (r.userId === oldId) {
            r.userId = newId;
            rechargesChanged = true;
          }
        });
        
        notifications.forEach(n => {
          if (n.userId === oldId) {
            n.userId = newId;
            notificationsChanged = true;
          }
        });
        
        phoneRequests.forEach(pr => {
          if (pr.userId === oldId) {
            pr.userId = newId;
            phoneRequestsChanged = true;
          }
        });
        
        contestants.forEach(c => {
          if (c.userId === oldId) {
            c.userId = newId;
            contestantsChanged = true;
          }
          if (c.id === oldId) {
            c.id = newId;
            contestantsChanged = true;
          }
        });
        
        const activeUser = this.getUser();
        if (activeUser.id === oldId) {
          activeUser.id = newId;
          saveToStorage(this.KEYS.USER, activeUser);
        }
        
        if (isSupabaseConfigured()) {
          try {
            const { data: dbUser } = await supabase!.from('users').select('*').eq('id', oldId).single();
            if (dbUser) {
              const updatedDbUser = { ...dbUser, id: newId };
              const { error: insErr } = await supabase!.from('users').insert(updatedDbUser);
              if (!insErr) {
                await supabase!.from('users').delete().eq('id', oldId);
                // Also update other tables remotely to preserve integrity
                await supabase!.from('orders').update({ userId: newId }).eq('userId', oldId);
                await supabase!.from('gifts').update({ userId: newId }).eq('userId', oldId);
                await supabase!.from('recharges').update({ userId: newId }).eq('userId', oldId);
                await supabase!.from('notifications').update({ userId: newId }).eq('userId', oldId);
                await supabase!.from('phone_requests').update({ userId: newId }).eq('userId', oldId);
                await supabase!.from('contestants').update({ id: newId, userId: newId }).eq('id', oldId);
              } else {
                console.error("Migration insert error:", insErr);
              }
            }
          } catch (e) {
            console.error("Migration sync error:", e);
          }
        }
      }
    }
    
    if (migratedCount > 0) {
      saveToStorage('amrwh_all_users_list', allUsers);
      if (ordersChanged) saveToStorage(this.KEYS.ORDERS, orders);
      if (giftsChanged) saveToStorage(this.KEYS.GIFTS, gifts);
      if (rechargesChanged) saveToStorage(this.KEYS.RECHARGES, recharges);
      if (notificationsChanged) saveToStorage(this.KEYS.NOTIFICATIONS, notifications);
      if (phoneRequestsChanged) saveToStorage(this.KEYS.PHONE_REQUESTS, phoneRequests);
      if (contestantsChanged) saveToStorage(this.KEYS.CONTESTANTS, contestants);
    }
    
    return { migratedCount };
  }

  static async ensureUserInSupabase(userId: string): Promise<void> {
    if (!isSupabaseConfigured() || !userId) return;
    try {
      const active = this.getUser();
      const allUsers = this.getAllUsers();
      let user = allUsers.find(u => u.id === userId) || (userId === active.id ? active : null);
      
      if (!user) {
        user = {
          id: userId,
          name: 'عميلة أم روح ' + userId.slice(-4),
          phone: '77' + Math.floor(10000000 + Math.random() * 90000000),
          address: 'اليمن',
          currency: 'YER_NEW',
          balance: 0,
          giftBalance: 0,
          favorites: [],
          joinDate: new Date().toLocaleDateString('ar-YE'),
          isRegistered: false
        };
      }

      const compositeDeviceId = user.deviceId ? (user.ip ? `${user.deviceId}|IP:${user.ip}` : user.deviceId) : '';
      await supabase!.from('users').upsert({
        id: user.id,
        name: user.name,
        phone: user.phone,
        address: user.address,
        currency: user.currency,
        balance: user.balance,
        giftBalance: user.giftBalance ?? 0,
        favorites: user.favorites || [],
        joinDate: user.joinDate || '',
        isRegistered: !!user.isRegistered,
        deviceId: compositeDeviceId
      });
    } catch (e) {
      console.error("Error ensuring user exists in Supabase:", e);
    }
  }

  static async checkIsDeviceBlocked(phone: string, currentDeviceId: string): Promise<boolean> {
    const activeUser = this.getUser();
    const userId = activeUser?.id;
    if (!userId && !phone) return false;
    try {
      if (this.isBackupMode()) {
        const allUsers = loadFromStorage<User[]>('amrwh_all_users_list', []);
        const existingUser = allUsers.find(u => u.id === userId || u.phone === phone);
        if (existingUser && existingUser.deviceId) {
          const cleanDbDevId = existingUser.deviceId.split('|IP:')[0];
          const cleanCurrentDevId = currentDeviceId.split('|IP:')[0];
          if (cleanDbDevId && cleanDbDevId !== cleanCurrentDevId) {
            return true;
          }
        }
        return false;
      }

      let existingUser: User | null = null;
      if (isSupabaseConfigured()) {
        if (userId) {
          const { data, error } = await supabase!.from('users').select('*').eq('id', userId).maybeSingle();
          if (!error && data) existingUser = data as User;
        }
        if (!existingUser && phone) {
          const { data, error } = await supabase!.from('users').select('*').eq('phone', phone).maybeSingle();
          if (!error && data) existingUser = data as User;
        }
      } else {
        if (userId) {
          const docSnap = await getDoc(doc(db, COLLECTIONS.USERS, userId));
          if (docSnap.exists()) existingUser = docSnap.data() as User;
        }
        if (!existingUser && phone) {
          const q = query(collection(db, COLLECTIONS.USERS), where("phone", "==", phone));
          const querySnapshot = await getDocs(q);
          if (!querySnapshot.empty) {
            existingUser = querySnapshot.docs[0].data() as User;
          }
        }
      }

      if (existingUser && existingUser.deviceId) {
        const cleanDbDevId = existingUser.deviceId.split('|IP:')[0];
        const cleanCurrentDevId = currentDeviceId.split('|IP:')[0];
        if (cleanDbDevId && cleanDbDevId !== cleanCurrentDevId) {
          return true; // Another device is registered
        }
      }
    } catch (e) {
      console.warn("Failed to check device block, ignoring for offline compatibility:", e);
    }
    return false;
  }

  static async checkPendingUnlockRequest(phone: string, currentDeviceId: string): Promise<boolean> {
    if (!phone || !currentDeviceId) return false;
    try {
      if (this.isBackupMode()) {
        // في وضع جوجل شيتس نتحقق من طلبات فك الأجهزة المزامنة محلياً
        const phoneRequests = loadFromStorage<any[]>('amrwh_phone_requests', []);
        return phoneRequests.some(r => r.oldPhone === phone && r.type === 'device_unlock' && r.status === 'pending');
      }

      if (isSupabaseConfigured()) {
        const { data, error } = await supabase!
          .from('phone_requests')
          .select('*')
          .eq('oldPhone', phone)
          .eq('type', 'device_unlock')
          .eq('status', 'pending');
        if (error) throw error;
        return data && data.length > 0;
      } else {
        const q = query(
          collection(db, COLLECTIONS.PHONE_REQUESTS),
          where("oldPhone", "==", phone),
          where("type", "==", "device_unlock"),
          where("status", "==", "pending")
        );
        const querySnapshot = await getDocs(q);
        return !querySnapshot.empty;
      }
    } catch (e) {
      console.warn("Failed to check pending device unlock requests:", e);
    }
    return false;
  }

  static getAllUsers(): User[] {
    // In local mode, we return a simulated list of users
    const active = this.getUser();
    const mockUsers: User[] = [
      active,
      { id: 'U1', name: 'منى الأهدل', phone: '771234567', address: 'صنعاء - الحصبة', currency: 'YER_NEW', balance: 0, giftBalance: 0, favorites: [], joinDate: '2026-01' },
      { id: 'U2', name: 'أروى الصبري', phone: '733987654', address: 'تعز - شارع جمال', currency: 'YER_OLD', balance: 0, giftBalance: 0, favorites: [], joinDate: '2026-02' },
      { id: 'U3', name: 'فاطمة الكبسي', phone: '711555666', address: 'عدن - المنصورة', currency: 'SAR', balance: 0, giftBalance: 0, favorites: [], joinDate: '2026-03' },
      { id: 'U4', name: 'بلقيس العبسي', phone: '770999888', address: 'صنعاء - السبعين', currency: 'YER_NEW', balance: 0, giftBalance: 0, favorites: [], joinDate: '2026-04' }
    ];
    // Return mock database users merged with the active user's storage
    const storedList = loadFromStorage<User[]>('amrwh_all_users_list', mockUsers);
    const index = storedList.findIndex(u => u.id === active.id);
    if (index >= 0) {
      storedList[index] = active;
    } else {
      storedList.unshift(active);
    }
    saveToStorage('amrwh_all_users_list', storedList);
    return storedList;
  }

  static deleteUser(userId: string): void {
    const allUsers = loadFromStorage<User[]>('amrwh_all_users_list', []);
    const userToDelete = allUsers.find(u => u.id === userId);
    
    // 1. Remove from all users list
    const filtered = allUsers.filter(u => u.id !== userId);
    saveToStorage('amrwh_all_users_list', filtered);
    
    // Sync with Google Sheets Script
    this.syncEventToGoogleScript('deleteUser', { userId });
    
    if (userToDelete) {
      const { deviceId, phone } = userToDelete;
      
      // 2. Remove from blocked devices list (device footprint)
      if (deviceId) {
        this.removeBlockedDevice(deviceId);
      }
      
      // 3. Delete associated orders
      const orders = this.getOrders();
      const filteredOrders = orders.filter(o => o.userId !== userId);
      saveToStorage(this.KEYS.ORDERS, filteredOrders);
      
      // 4. Delete associated recharge requests
      const recharges = this.getRechargeRequests();
      const filteredRecharges = recharges.filter(r => r.userId !== userId);
      saveToStorage(this.KEYS.RECHARGES, filteredRecharges);
      
      // 5. Delete associated phone activation requests
      const phoneReqs = this.getPhoneRequests();
      const filteredPhoneReqs = phoneReqs.filter(pr => 
        pr.userId !== userId && (!phone || (pr.oldPhone !== phone && pr.newPhone !== phone))
      );
      saveToStorage(this.KEYS.PHONE_REQUESTS, filteredPhoneReqs);
      
      // 6. Delete targeted notifications
      const tNotifs = loadFromStorage<any[]>('amrwh_targeted_notifications', []);
      const filteredTNotifs = tNotifs.filter(n => n.userId !== userId);
      saveToStorage('amrwh_targeted_notifications', filteredTNotifs);
      
      // 7. Delete targeted gift logs
      const tGiftLogs = loadFromStorage<any[]>('amrwh_targeted_gift_logs', []);
      const filteredTGiftLogs = tGiftLogs.filter(l => l.userId !== userId);
      saveToStorage('amrwh_targeted_gift_logs', filteredTGiftLogs);
      
      // 8. Delete app notifications
      const appNotifs = this.getAppNotifications();
      const filteredAppNotifs = appNotifs.filter((n: any) => 
        n.userId !== userId && (!deviceId || n.deviceId !== deviceId)
      );
      saveToStorage(this.KEYS.APP_NOTIFICATIONS, filteredAppNotifs);
      
      // 9. Contestants & Vote Logs Cleanup
      const contestants = this.getContestants();
      const voteLogs = this.getVoteLogs();
      
      // Recalculate/decrement vote counters for contestants voted BY this user
      const votesCastByUser = voteLogs.filter(v => 
        v.voterUserId === userId || (deviceId && v.voterDeviceId === deviceId)
      );
      votesCastByUser.forEach(vote => {
        const targetContestant = contestants.find(c => c.id === vote.contestantId);
        if (targetContestant) {
          if (vote.voterType === 'green') {
            targetContestant.greenVotes = Math.max(0, (targetContestant.greenVotes || 0) - 1);
          } else {
            targetContestant.redVotes = Math.max(0, (targetContestant.redVotes || 0) - 1);
          }
          targetContestant.votes = (targetContestant.greenVotes || 0) + (targetContestant.redVotes || 0);
        }
      });
      
      // Remove contestant profile belonging to this user
      const filteredContestants = contestants.filter(c => 
        c.id !== userId && (!phone || c.phone !== phone)
      );
      saveToStorage(this.KEYS.CONTESTANTS, filteredContestants);
      
      // Remove all vote logs cast BY or FOR this user
      const filteredVoteLogs = voteLogs.filter(v => 
        !((deviceId && v.voterDeviceId === deviceId) || v.voterUserId === userId) && 
        v.contestantId !== userId
      );
      saveToStorage(this.KEYS.VOTE_LOGS, filteredVoteLogs);
    }
    
    // Cloud deep wipe
    if (isSupabaseConfigured()) {
      const tableDeletes = [
        supabase!.from('users').delete().eq('id', userId),
        supabase!.from('orders').delete().eq('userId', userId),
        supabase!.from('recharges').delete().eq('userId', userId),
        supabase!.from('phone_requests').delete().eq('userId', userId),
        supabase!.from('targeted_notifications').delete().eq('userId', userId),
        supabase!.from('targeted_gift_logs').delete().eq('userId', userId),
        supabase!.from('app_notifications').delete().eq('userId', userId),
        supabase!.from('contestants').delete().eq('id', userId),
        supabase!.from('vote_logs').delete().eq('contestantId', userId),
        supabase!.from('vote_logs').delete().eq('voterUserId', userId)
      ];
      
      if (userToDelete?.phone) {
        tableDeletes.push(supabase!.from('phone_requests').delete().eq('oldPhone', userToDelete.phone));
        tableDeletes.push(supabase!.from('phone_requests').delete().eq('newPhone', userToDelete.phone));
        tableDeletes.push(supabase!.from('contestants').delete().eq('phone', userToDelete.phone));
      }
      if (userToDelete?.deviceId) {
        tableDeletes.push(supabase!.from('app_notifications').delete().eq('deviceId', userToDelete.deviceId));
        tableDeletes.push(supabase!.from('vote_logs').delete().eq('voterDeviceId', userToDelete.deviceId));
      }
      
      Promise.all(tableDeletes).then(() => {
        console.log("Supabase complete deep user wipe finished successfully");
      }).catch(err => {
        console.error("Supabase deep user wipe error:", err);
      });
    } else {
      deleteDoc(doc(db, COLLECTIONS.USERS, userId)).catch(e => {
        console.error("Firestore user delete error:", e);
      });
      deleteDoc(doc(db, COLLECTIONS.CONTESTANTS, userId)).catch(e => {});
    }
  }

  static updateUserBalanceInList(userId: string, balance: number) {
    const users = this.getAllUsers();
    const user = users.find(u => u.id === userId);
    if (user) {
      user.balance = balance;
      if (userId === this.getUser().id) {
        const active = this.getUser();
        active.balance = balance;
        saveToStorage(this.KEYS.USER, active);
      }
      saveToStorage('amrwh_all_users_list', users);
      if (isSupabaseConfigured()) {
        supabase!.from('users').update({ balance }).eq('id', userId).then(({ error }) => {
          if (error) console.error("Supabase user balance update error:", error);
        });
      } else {
        updateDoc(doc(db, COLLECTIONS.USERS, userId), { balance }).catch(e => console.error("Firestore balance save error:", e));
      }
    }
  }

  static updateUserBalances(userId: string, balance: number, giftBalance: number) {
    const users = this.getAllUsers();
    const user = users.find(u => u.id === userId);
    if (user) {
      user.balance = balance;
      user.giftBalance = giftBalance;
      if (userId === this.getUser().id) {
        const active = this.getUser();
        active.balance = balance;
        active.giftBalance = giftBalance;
        saveToStorage(this.KEYS.USER, active);
      }
      saveToStorage('amrwh_all_users_list', users);
      if (isSupabaseConfigured()) {
        supabase!.from('users').update({ balance, giftBalance }).eq('id', userId).then(({ error }) => {
          if (error) console.error("Supabase user balances update error:", error);
        });
      } else {
        updateDoc(doc(db, COLLECTIONS.USERS, userId), { balance, giftBalance }).catch(e => console.error("Firestore balances save error:", e));
      }
    }
  }

  // --- CATEGORIES ---
  static getCategories(): Category[] {
    this.initialize();
    const cats = loadFromStorage<Category[]>(this.KEYS.CATEGORIES, []);
    const prods = this.getProducts();
    // Recalculate product count dynamically
    return cats.map(c => ({
      ...c,
      productCount: prods.filter(p => p.categoryId === c.id).length
    })).sort((a, b) => (a.sortOrder ?? 9999) - (b.sortOrder ?? 9999));
  }

  static saveCategory(category: Category): void {
    const cats = this.getCategories();
    const idx = cats.findIndex(c => c.id === category.id);
    if (idx >= 0) {
      cats[idx] = category;
    } else {
      cats.push(category);
    }
    saveToStorage(this.KEYS.CATEGORIES, cats);
    this.syncEventToGoogleScript('saveCategory', { category });
    if (isSupabaseConfigured()) {
      const cleanCategory = {
        id: category.id,
        name: category.name,
        image: category.image || '',
        productCount: category.productCount ?? 0,
        sortOrder: category.sortOrder ?? 0
      };
      supabase!.from('categories').upsert(cleanCategory).then(({ error }) => {
        if (error) {
          handleSupabaseError(error, 'categories', 'save');
        }
      });
    } else {
      setDoc(doc(db, COLLECTIONS.CATEGORIES, category.id), category).catch(e => {
        console.error("Firestore category save error:", e);
        handleFirestoreError(e, OperationType.WRITE, COLLECTIONS.CATEGORIES);
      });
    }
  }

  static deleteCategory(categoryId: string): void {
    const cats = this.getCategories();
    const filtered = cats.filter(c => c.id !== categoryId);
    saveToStorage(this.KEYS.CATEGORIES, filtered);
    this.syncEventToGoogleScript('deleteCategory', { categoryId });
    if (isSupabaseConfigured()) {
      supabase!.from('categories').delete().eq('id', categoryId).then(({ error }) => {
        if (error) handleSupabaseError(error, 'categories', 'delete');
      });
    } else {
      deleteDoc(doc(db, COLLECTIONS.CATEGORIES, categoryId)).catch(e => {
        console.error("Firestore category delete error:", e);
        handleFirestoreError(e, OperationType.DELETE, COLLECTIONS.CATEGORIES);
      });
    }
  }

  // --- DELIVERY LOCATIONS ---
  static getLocations(): DeliveryLocation[] {
    this.initialize();
    return loadFromStorage<DeliveryLocation[]>(this.KEYS.LOCATIONS, DEFAULT_LOCATIONS);
  }

  static saveLocation(location: DeliveryLocation): void {
    const locs = this.getLocations();
    const idx = locs.findIndex(l => l.id === location.id);
    if (idx >= 0) {
      locs[idx] = location;
    } else {
      locs.push(location);
    }
    saveToStorage(this.KEYS.LOCATIONS, locs);
    this.syncEventToGoogleScript('saveLocation', { location });
    if (isSupabaseConfigured()) {
      supabase!.from('locations').upsert(location).then(({ error }) => {
        if (error) handleSupabaseError(error, 'locations', 'save');
      });
    } else {
      setDoc(doc(db, COLLECTIONS.LOCATIONS, location.id), location).catch(e => {
        console.error("Firestore location save error:", e);
        handleFirestoreError(e, OperationType.WRITE, COLLECTIONS.LOCATIONS);
      });
    }
  }

  static deleteLocation(id: string): void {
    const locs = this.getLocations();
    const filtered = locs.filter(l => l.id !== id);
    saveToStorage(this.KEYS.LOCATIONS, filtered);
    this.syncEventToGoogleScript('deleteLocation', { id });
    if (isSupabaseConfigured()) {
      supabase!.from('locations').delete().eq('id', id).then(({ error }) => {
        if (error) handleSupabaseError(error, 'locations', 'delete');
      });
    } else {
      deleteDoc(doc(db, COLLECTIONS.LOCATIONS, id)).catch(e => {
        console.error("Firestore location delete error:", e);
        handleFirestoreError(e, OperationType.DELETE, COLLECTIONS.LOCATIONS);
      });
    }
  }

  // --- PRODUCTS ---
  static getProducts(): Product[] {
    this.initialize();
    return loadFromStorage<Product[]>(this.KEYS.PRODUCTS, []);
  }

  static saveProduct(product: Product): void {
    const prods = this.getProducts();
    const idx = prods.findIndex(p => p.id === product.id);
    if (idx >= 0) {
      prods[idx] = product;
    } else {
      prods.push(product);
    }
    saveToStorage(this.KEYS.PRODUCTS, prods);
    this.syncEventToGoogleScript('saveProduct', { product });
    if (isSupabaseConfigured()) {
      const cleanProduct = {
        id: product.id,
        code: product.code || '',
        name: product.name || '',
        categoryId: product.categoryId || '',
        categoryName: product.categoryName || '',
        subCategoryIds: product.subCategoryIds || [],
        description: product.description || '',
        priceYERNew: product.priceYERNew ?? 0,
        images: product.images || [],
        properties: product.properties || [],
        isOnOffer: !!product.isOnOffer,
        offerPriceNew: product.offerPriceNew || null,
        offerOldPrice: product.offerOldPrice || null,
        rating: product.rating ?? 5
      };
      supabase!.from('products').upsert(cleanProduct).then(({ error }) => {
        if (error) handleSupabaseError(error, 'products', 'save');
      });
    } else {
      setDoc(doc(db, COLLECTIONS.PRODUCTS, product.id), product).catch(e => {
        console.error("Firestore product save error:", e);
        handleFirestoreError(e, OperationType.WRITE, COLLECTIONS.PRODUCTS);
      });
    }
  }

  static deleteProduct(productId: string): void {
    const prods = this.getProducts();
    const filtered = prods.filter(p => p.id !== productId);
    saveToStorage(this.KEYS.PRODUCTS, filtered);
    this.syncEventToGoogleScript('deleteProduct', { productId });
    if (isSupabaseConfigured()) {
      supabase!.from('products').delete().eq('id', productId).then(({ error }) => {
        if (error) handleSupabaseError(error, 'products', 'delete');
      });
    } else {
      deleteDoc(doc(db, COLLECTIONS.PRODUCTS, productId)).catch(e => {
        console.error("Firestore product delete error:", e);
        handleFirestoreError(e, OperationType.DELETE, COLLECTIONS.PRODUCTS);
      });
    }
  }

  // --- EXCHANGE RATES ---
  static getExchangeRate(): ExchangeRate {
    this.initialize();
    return loadFromStorage<ExchangeRate>(this.KEYS.EXCHANGE_RATE, DEFAULT_EXCHANGE_RATE);
  }

  static saveExchangeRate(rate: ExchangeRate): void {
    saveToStorage(this.KEYS.EXCHANGE_RATE, rate);
    this.syncEventToGoogleScript('saveExchangeRate', { rate });
    if (isSupabaseConfigured()) {
      supabase!.from('settings').upsert({ id: 'general', data: { exchangeRate: rate, offers: this.getOffersImages() } }).then(({ error }) => {
        if (error) console.error("Supabase exchangeRate save error:", error);
      });
    } else {
      setDoc(doc(db, COLLECTIONS.SETTINGS, 'general'), { exchangeRate: rate }, { merge: true }).catch(e => console.error("Firestore exchangeRate save error:", e));
    }
  }

  // --- ADVISOR & ADMIN SETTINGS ---
  static getAdvisorSettings(): AdvisorSettings {
    this.initialize();
    return loadFromStorage<AdvisorSettings>(this.KEYS.ADVISOR, DEFAULT_ADVISOR_SETTINGS);
  }

  static saveAdvisorSettings(settings: AdvisorSettings): void {
    saveToStorage(this.KEYS.ADVISOR, settings);
    this.syncEventToGoogleScript('saveAdvisorSettings', { settings });
    if (isSupabaseConfigured()) {
      supabase!.from('settings').upsert({ id: 'advisor', data: settings }).then(({ error }) => {
        if (error) console.error("Supabase advisor save error:", error);
      });
    } else {
      setDoc(doc(db, COLLECTIONS.SETTINGS, 'advisor'), settings).catch(e => console.error("Firestore advisor save error:", e));
    }
  }

  static getAdminSettings(): AdminSettings {
    this.initialize();
    return loadFromStorage<AdminSettings>(this.KEYS.ADMIN, DEFAULT_ADMIN_SETTINGS);
  }

  static getWorkerCode(): string {
    const settings = this.getAdminSettings();
    return settings.workerCode || '1111';
  }

  static saveAdminSettings(settings: AdminSettings): void {
    saveToStorage(this.KEYS.ADMIN, settings);
    this.syncEventToGoogleScript('saveAdminSettings', { settings });
    if (isSupabaseConfigured()) {
      supabase!.from('settings').upsert({ id: 'admin', data: settings }).then(({ error }) => {
        if (error) console.error("Supabase admin settings save error:", error);
      });
    } else {
      setDoc(doc(db, COLLECTIONS.SETTINGS, 'admin'), settings).catch(e => console.error("Firestore admin settings save error:", e));
    }
  }

  // --- OFFERS SLIDER ---
  static getOffersImages(): string[] {
    this.initialize();
    return loadFromStorage<string[]>(this.KEYS.OFFERS, DEFAULT_OFFERS_IMAGES);
  }

  static saveOffersImages(images: string[]): void {
    saveToStorage(this.KEYS.OFFERS, images);
    this.syncEventToGoogleScript('saveOffersImages', { images });
    if (isSupabaseConfigured()) {
      supabase!.from('settings').upsert({ id: 'general', data: { exchangeRate: this.getExchangeRate(), offers: images } }).then(({ error }) => {
        if (error) console.error("Supabase offers save error:", error);
      });
    } else {
      setDoc(doc(db, COLLECTIONS.SETTINGS, 'general'), { offers: images }, { merge: true }).catch(e => console.error("Firestore offers save error:", e));
    }
  }

  // --- NEWS TICKER TEXTS ---
  static getTickerTexts(): string[] {
    this.initialize();
    const texts = loadFromStorage<string[]>(this.KEYS.TICKER_TEXTS, []);
    if (!texts || texts.length === 0) {
      return [
        'مرحباً بكم في متجر أم روح 🌸 منصتكم الأولى للتسوق للأسر المنتجة باليمن!',
        'توصيل سريع ومضمون لكافة المحافظات اليمنية 🚚',
        'خصومات وعروض مميزة مستمرة على كافة الأقسام 🌟'
      ];
    }
    return texts;
  }

  static saveTickerTexts(texts: string[]): void {
    const oldLength = loadFromStorage<string[]>(this.KEYS.TICKER_TEXTS, []).length;
    saveToStorage(this.KEYS.TICKER_TEXTS, texts);
    this.syncEventToGoogleScript('saveTickerTexts', { texts });
    if (isSupabaseConfigured()) {
      supabase!.from('settings').upsert({ id: 'general', data: { exchangeRate: this.getExchangeRate(), offers: this.getOffersImages(), tickerTexts: texts } }).then(undefined, () => {});
      texts.forEach((text, i) => {
        supabase!.from('ticker_texts').upsert({ id: `ticker_${i}`, text, sortOrder: i, createdAt: new Date().toISOString() }).then(undefined, () => {});
      });
      if (oldLength > texts.length) {
        for (let i = texts.length; i < oldLength + 10; i++) {
          supabase!.from('ticker_texts').delete().eq('id', `ticker_${i}`).then(undefined, () => {});
        }
      }
    } else {
      setDoc(doc(db, COLLECTIONS.SETTINGS, 'general'), { tickerTexts: texts }, { merge: true })
        .catch(e => console.error("Firestore ticker texts save error:", e));

      // Save to dedicated ticker_texts collection/table
      try {
        texts.forEach((text, i) => {
          setDoc(doc(db, COLLECTIONS.TICKER_TEXTS, `ticker_${i}`), {
            id: `ticker_${i}`,
            text: text,
            sortOrder: i,
            createdAt: new Date().toISOString()
          }).catch(e => console.error("Error saving ticker doc:", e));
        });
        // Delete leftovers if list became smaller
        if (oldLength > texts.length) {
          for (let i = texts.length; i < oldLength + 10; i++) {
            deleteDoc(doc(db, COLLECTIONS.TICKER_TEXTS, `ticker_${i}`)).catch(() => {});
          }
        }
      } catch (e) {
        console.error("Firestore dedicated ticker collection write error:", e);
      }
    }
  }

  // --- GIFTS (UM ROUH GIFTS) ---
  static getGifts(): Gift[] {
    this.initialize();
    return loadFromStorage<Gift[]>(this.KEYS.GIFTS, []);
  }

  static sendGift(userId: string, userName: string, userPhone: string, amount: number, currency: Currency = 'YER_NEW'): void {
    const gifts = this.getGifts();
    const newGift: Gift = {
      id: 'GIFT_' + Date.now(),
      userId,
      userName,
      userPhone,
      amount,
      createdAt: new Date().toISOString(),
    };
    gifts.push(newGift);
    saveToStorage(this.KEYS.GIFTS, gifts);
    if (isSupabaseConfigured()) {
      this.ensureUserInSupabase(newGift.userId).then(() => {
        supabase!.from('gifts').insert(newGift).then(({ error }) => {
          if (error) console.error("Supabase gift send error:", error);
        });
      });
    } else {
      setDoc(doc(db, COLLECTIONS.GIFTS, newGift.id), newGift).catch(e => console.error("Firestore gift send error:", e));
    }

    // Update user's gift balance and its currency (ONLY ONCE!)
    const allUsers = this.getAllUsers();
    const target = allUsers.find(u => u.id === userId);
    if (target) {
      target.giftBalance = (target.giftBalance || 0) + amount;
      target.giftBalanceCurrency = currency;
      
      // Save updated list
      saveToStorage('amrwh_all_users_list', allUsers);
      
      // Update in Supabase/Firestore
      if (isSupabaseConfigured()) {
        supabase!.from('users').update({ 
          giftBalance: target.giftBalance, 
          giftBalanceCurrency: currency 
        }).eq('id', userId).then(({ error }) => {
          if (error) console.error("Supabase user giftBalance update error:", error);
        });
      } else {
        updateDoc(doc(db, COLLECTIONS.USERS, userId), { 
          giftBalance: target.giftBalance, 
          giftBalanceCurrency: currency 
        }).catch(e => console.error("Firestore giftBalance save error:", e));
      }

      // If this is the active user, update active user session too
      const activeUser = this.getUser();
      if (activeUser.id === userId) {
        activeUser.giftBalance = target.giftBalance;
        activeUser.giftBalanceCurrency = currency;
        saveToStorage(this.KEYS.USER, activeUser);
      }
    }

    const curNames = { YER_NEW: 'ريال يمني جديد', YER_OLD: 'ريال يمني قديم', SAR: 'ريال سعودي' };
    const curLabel = curNames[currency] || 'ريال يمني جديد';

    // Trigger notification
    this.addNotification({
      id: 'NOTIF_' + Date.now(),
      userId,
      title: 'رصيد هدية جديد من أم روح 🎁',
      message: `لقد تم منحكِ هدية رصيد بقيمة ${amount} ${curLabel} في حسابكِ! يرجى تبديل عملة الفاتورة في السلة إلى ${curLabel} لتفعيل السداد بالهدايا. شكراً لوفائكِ وثقتكِ بمتجرنا 🌸.`,
      createdAt: new Date().toISOString(),
      isRead: false
    });
  }

  // --- RECHARGE REQUESTS ---
  static getRechargeRequests(): RechargeRequest[] {
    this.initialize();
    return loadFromStorage<RechargeRequest[]>(this.KEYS.RECHARGES, []);
  }

  static submitRechargeRequest(req: Omit<RechargeRequest, 'id' | 'createdAt' | 'status'>): void {
    const list = this.getRechargeRequests();
    const newReq: RechargeRequest = {
      ...req,
      id: 'RECH_' + Date.now(),
      createdAt: new Date().toISOString(),
      status: 'pending',
    };
    list.push(newReq);
    saveToStorage(this.KEYS.RECHARGES, list);
    if (isSupabaseConfigured()) {
      this.ensureUserInSupabase(newReq.userId).then(() => {
        supabase!.from('recharges').insert(newReq).then(({ error }) => {
          if (error) {
            // Resilient fallback: If the insert fails because of missing 'currency' column, retry without it quietly
            const errorMsg = error.message ? error.message.toLowerCase() : "";
            if (errorMsg.includes("currency") || errorMsg.includes("column") || errorMsg.includes("attribute")) {
              console.warn("Supabase recharge submit failed on 'currency' column. Attempting fallback...");
              const fallbackReq = { ...newReq };
              delete (fallbackReq as any).currency;
              supabase!.from('recharges').insert(fallbackReq).then(({ error: retryError }) => {
                if (retryError) {
                  console.error("Supabase recharge submit error (both attempts failed):", retryError);
                } else {
                  console.log("Supabase recharge submit fallback succeeded without 'currency' column.");
                }
              });
            } else {
              console.error("Supabase recharge submit error:", error);
            }
          }
        });
      });
    } else {
      setDoc(doc(db, COLLECTIONS.RECHARGES, newReq.id), newReq).catch(e => {
        console.error("Firestore recharge submit error:", e);
        handleFirestoreError(e, OperationType.WRITE, COLLECTIONS.RECHARGES);
      });
    }

    // Send successful submission notification
    this.addNotification({
      id: 'NOTIF_' + Date.now() + '_recharge',
      userId: req.userId,
      title: 'تم إرسال طلب الشحن بنجاح 💳',
      message: `تم إرسال طلب شحن رصيدكِ بقيمة ${req.amount} ريال يمني جديد للإدارة للتحقق والموافقة بنجاح! وسوف يتم إشعاركِ بمجرد معالجة الرصيد 🌸.`,
      createdAt: new Date().toISOString(),
      isRead: false
    });
  }

  static async approveRechargeRequest(id: string, approvedAmount: number): Promise<boolean> {
    this.initialize();
    const list = this.getRechargeRequests();
    const req = list.find(r => r.id === id);
    if (!req || req.status !== 'pending') {
      return false; // Already processed locally
    }

    // Server-side check & atomic update to prevent double-charging/doubling balance
    if (isSupabaseConfigured()) {
      const { data, error } = await supabase!
        .from('recharges')
        .update({ status: 'approved', amount: approvedAmount })
        .eq('id', id)
        .eq('status', 'pending')
        .select();

      if (error) {
        console.error("Supabase recharge approve error:", error);
        return false;
      }
      if (!data || data.length === 0) {
        console.warn("Recharge request already approved or not pending in Supabase.");
        return false; // Already processed by another admin/request
      }
    } else {
      try {
        const reqRef = doc(db, COLLECTIONS.RECHARGES, id);
        const reqSnap = await getDoc(reqRef).catch(err => {
          console.warn("Firestore getDoc error, assuming local fallback approval:", err);
          return null;
        });

        if (reqSnap && reqSnap.exists()) {
          if (reqSnap.data()?.status !== 'pending') {
            console.warn("Recharge request already approved or not pending in Firestore.");
            return false;
          }
          await updateDoc(reqRef, { status: 'approved', amount: approvedAmount });
        } else {
          console.warn("Recharge request doc does not exist in Firestore. Approving locally & trying to write approved doc.");
          await setDoc(reqRef, { ...req, status: 'approved', amount: approvedAmount }).catch(err => {
            console.error("Firestore setDoc fallback error:", err);
          });
        }
      } catch (e) {
        console.error("Firestore recharge approve error:", e);
        // Do not block local approval on general Firestore errors if request exists locally
        console.warn("Proceeding with local-only approval fallback to prevent blocking admin.");
      }
    }

    // Now it is safe to apply the balance increase!
    req.status = 'approved';
    req.amount = approvedAmount;
    saveToStorage(this.KEYS.RECHARGES, list);

    const reqCurrency = req.currency || 'YER_NEW';

    // Update user's wallet balance and its currency (ONLY ONCE!)
    const allUsers = this.getAllUsers();
    const target = allUsers.find(u => u.id === req.userId);
    if (target) {
      target.balance = (target.balance || 0) + approvedAmount;
      target.balanceCurrency = reqCurrency;
      
      saveToStorage('amrwh_all_users_list', allUsers);

      if (isSupabaseConfigured()) {
        await supabase!.from('users').update({ 
          balance: target.balance, 
          balanceCurrency: reqCurrency 
        }).eq('id', req.userId);
      } else {
        await updateDoc(doc(db, COLLECTIONS.USERS, req.userId), { 
          balance: target.balance, 
          balanceCurrency: reqCurrency 
        }).catch(e => console.error("Firestore balance save error:", e));
      }

      // If this is the active user, update active user session too
      const activeUser = this.getUser();
      if (activeUser.id === req.userId) {
        activeUser.balance = target.balance;
        activeUser.balanceCurrency = reqCurrency;
        saveToStorage(this.KEYS.USER, activeUser);
      }
    }

    const curNames = { YER_NEW: 'ريال يمني جديد', YER_OLD: 'ريال يمني قديم', SAR: 'ريال سعودي' };
    const curLabel = curNames[reqCurrency] || 'ريال يمني جديد';

    // Notification
    this.addNotification({
      id: 'NOTIF_' + Date.now(),
      userId: req.userId,
      title: 'تمت الموافقة على شحن رصيدك ✅',
      message: `تم التحقق من الحوالة وإيداع مبلغ ${approvedAmount} ${curLabel} في حسابكِ بنجاح. يرجى تبديل عملة الفاتورة في السلة إلى ${curLabel} للاستفادة وسداد طلباتكِ فوراً!`,
      createdAt: new Date().toISOString(),
      isRead: false
    });

    return true;
  }

  static rejectRechargeRequest(id: string): void {
    const list = this.getRechargeRequests();
    const req = list.find(r => r.id === id);
    if (req && req.status === 'pending') {
      req.status = 'rejected';
      saveToStorage(this.KEYS.RECHARGES, list);
      if (isSupabaseConfigured()) {
        supabase!.from('recharges').update({ status: 'rejected' }).eq('id', id).then(({ error }) => {
          if (error) console.error("Supabase recharge reject error:", error);
        });
      } else {
        updateDoc(doc(db, COLLECTIONS.RECHARGES, id), { status: 'rejected' }).catch(e => {
          console.error("Firestore recharge reject error:", e);
          handleFirestoreError(e, OperationType.UPDATE, COLLECTIONS.RECHARGES);
        });
      }

      // Notification
      this.addNotification({
        id: 'NOTIF_' + Date.now(),
        userId: req.userId,
        title: 'تنبيه: تعذر شحن الرصيد ⚠️',
        message: 'عذراً، لم نتمكن من تأكيد حوالتك المالية المرفقة لشحن الرصيد. يرجى مراجعة بيانات الإيداع أو صورة الإثبات والمحاولة مرة أخرى، أو التواصل مع مستشارتنا روح.',
        createdAt: new Date().toISOString(),
        isRead: false
      });
    }
  }

  // --- PHONE CHANGE REQUESTS ---
  static getPhoneRequests(): PhoneChangeRequest[] {
    this.initialize();
    return loadFromStorage<PhoneChangeRequest[]>(this.KEYS.PHONE_REQUESTS, []);
  }

  static submitPhoneRequest(userId: string, userName: string, oldPhone: string, newPhone: string, newName?: string): void {
    const list = this.getPhoneRequests();
    const newReq: PhoneChangeRequest = {
      id: 'PHREQ_' + Date.now(),
      userId,
      userName,
      oldPhone,
      newPhone,
      newName,
      createdAt: new Date().toISOString(),
      status: 'pending',
      type: 'change_phone'
    };
    list.push(newReq);
    saveToStorage(this.KEYS.PHONE_REQUESTS, list);
    if (isSupabaseConfigured()) {
      this.ensureUserInSupabase(newReq.userId).then(() => {
        supabase!.from('phone_requests').insert(newReq).then(({ error }) => {
          if (error) console.error("Supabase phone request submit error:", error);
        });
      });
    } else {
      setDoc(doc(db, COLLECTIONS.PHONE_REQUESTS, newReq.id), newReq).catch(e => console.error("Firestore phone request submit error:", e));
    }
  }

  static submitDeviceUnlockRequest(userId: string, userName: string, phone: string, deviceId: string): void {
    const list = this.getPhoneRequests();
    const newReq: PhoneChangeRequest = {
      id: 'PHREQ_' + Date.now(),
      userId,
      userName,
      oldPhone: phone,
      newPhone: phone,
      createdAt: new Date().toISOString(),
      status: 'pending',
      type: 'device_unlock',
      newDeviceId: deviceId
    };
    list.push(newReq);
    saveToStorage(this.KEYS.PHONE_REQUESTS, list);
    if (isSupabaseConfigured()) {
      this.ensureUserInSupabase(newReq.userId).then(() => {
        supabase!.from('phone_requests').insert(newReq).then(({ error }) => {
          if (error) console.error("Supabase device unlock submit error:", error);
        });
      });
    } else {
      setDoc(doc(db, COLLECTIONS.PHONE_REQUESTS, newReq.id), newReq).catch(e => console.error("Firestore device unlock submit error:", e));
    }
  }

  static approvePhoneRequest(id: string): void {
    const list = this.getPhoneRequests();
    const req = list.find(r => r.id === id);
    if (req && req.status === 'pending') {
      req.status = 'approved';
      saveToStorage(this.KEYS.PHONE_REQUESTS, list);
      if (isSupabaseConfigured()) {
        supabase!.from('phone_requests').update({ status: 'approved' }).eq('id', id).then(({ error }) => {
          if (error) console.error("Supabase phone request approve error:", error);
        });
      } else {
        updateDoc(doc(db, COLLECTIONS.PHONE_REQUESTS, id), { status: 'approved' }).catch(e => console.error("Firestore phone request approve error:", e));
      }

      if (req.type === 'device_unlock' && req.newDeviceId) {
        // Update device binding
        const activeUser = this.getUser();
        if (activeUser.id === req.userId || activeUser.phone === req.oldPhone) {
          activeUser.deviceId = req.newDeviceId;
          this.saveUser(activeUser);
        }

        const allUsers = this.getAllUsers();
        const dbUser = allUsers.find(u => u.phone === req.oldPhone || u.id === req.userId);
        if (dbUser) {
          dbUser.deviceId = req.newDeviceId;
          saveToStorage('amrwh_all_users_list', allUsers);
          if (isSupabaseConfigured()) {
            supabase!.from('users').update({ deviceId: req.newDeviceId }).eq('id', dbUser.id).then(undefined, () => {});
          } else {
            updateDoc(doc(db, COLLECTIONS.USERS, dbUser.id), { deviceId: req.newDeviceId }).catch(e => console.error("Firestore user device update error:", e));
          }
        }

        // Notification for device unlock
        this.addNotification({
          id: 'NOTIF_' + Date.now(),
          userId: req.userId,
          title: 'تم ربط جهازكِ الجديد بنجاح 🔓',
          message: `تمت الموافقة من الإدارة على ربط جهازكِ الجديد بالرقم: ${req.oldPhone}. يمكنكِ الآن استخدام التطبيق بالكامل!`,
          createdAt: new Date().toISOString(),
          isRead: false
        });
      } else {
        // Update actual user's phone and name
        const activeUser = this.getUser();
        if (activeUser.id === req.userId) {
          activeUser.phone = req.newPhone;
          if (req.newName) activeUser.name = req.newName;
          this.saveUser(activeUser);
        }
        
        const allUsers = this.getAllUsers();
        const dbUser = allUsers.find(u => u.id === req.userId);
        if (dbUser) {
          dbUser.phone = req.newPhone;
          if (req.newName) dbUser.name = req.newName;
          saveToStorage('amrwh_all_users_list', allUsers);
          if (isSupabaseConfigured()) {
            supabase!.from('users').update({ phone: req.newPhone, ...(req.newName ? { name: req.newName } : {}) }).eq('id', req.userId).then(undefined, () => {});
          } else {
            updateDoc(doc(db, COLLECTIONS.USERS, req.userId), { 
              phone: req.newPhone,
              ...(req.newName ? { name: req.newName } : {})
            }).catch(e => console.error("Firestore user phone update error:", e));
          }
        }

        // Notification
        this.addNotification({
          id: 'NOTIF_' + Date.now(),
          userId: req.userId,
          title: 'تم تحديث بيانات ملفكِ الشخصي بنجاح 📱',
          message: `تمت الموافقة وتغيير بيانات حسابكِ المسجل بنجاح (الاسم: ${req.newName || req.userName} | رقم الهاتف: ${req.newPhone}). شكراً لثقتكِ بنا! 🥰`,
          createdAt: new Date().toISOString(),
          isRead: false
        });
      }
    }
  }

  static rejectPhoneRequest(id: string): void {
    const list = this.getPhoneRequests();
    const req = list.find(r => r.id === id);
    if (req && req.status === 'pending') {
      req.status = 'rejected';
      saveToStorage(this.KEYS.PHONE_REQUESTS, list);
      if (isSupabaseConfigured()) {
        supabase!.from('phone_requests').update({ status: 'rejected' }).eq('id', id).then(({ error }) => {
          if (error) console.error("Supabase phone request reject error:", error);
        });
      } else {
        updateDoc(doc(db, COLLECTIONS.PHONE_REQUESTS, id), { status: 'rejected' }).catch(e => console.error("Firestore phone request reject error:", e));
      }

      // Notification
      this.addNotification({
        id: 'NOTIF_' + Date.now(),
        userId: req.userId,
        title: 'تنبيه: تم رفض طلب تعديل البيانات ⚠️',
        message: 'عذراً، تعذر على الإدارة الموافقة على طلب تعديل الاسم أو رقم الهاتف الخاص بكِ لمخالفته معايير التحقق والتأمين بالمنصة. يرجى مراجعة البيانات المدخلة أو التواصل مع مستشارتنا روح.',
        createdAt: new Date().toISOString(),
        isRead: false
      });
    }
  }

  // --- ORDERS ---
  static getOrders(): Order[] {
    this.initialize();
    return loadFromStorage<Order[]>(this.KEYS.ORDERS, []);
  }

  static saveOrder(order: Order): void {
    const list = this.getOrders();
    const idx = list.findIndex(o => o.id === order.id);
    if (idx >= 0) {
      list[idx] = order;
    } else {
      list.push(order);
    }
    saveToStorage(this.KEYS.ORDERS, list);
    
    if (this.isBackupMode()) {
      this.fetchFromGoogleScript('createOrder', { order }).then(res => {
        if (res.success) {
          console.log("Order saved to Google Sheets successfully.");
        } else {
          console.warn("Failed to save order to Google Sheets:", res.error);
        }
      });
    }

    if (isSupabaseConfigured()) {
      this.ensureUserInSupabase(order.userId).then(() => {
        supabase!.from('orders').upsert(order).then(({ error }) => {
          if (error) {
            console.error("Supabase order save error, falling back to Google Sheets:", error);
            this.fetchFromGoogleScript('createOrder', { order });
          }
        });
      });
    } else {
      setDoc(doc(db, COLLECTIONS.ORDERS, order.id), order).catch(e => {
        console.error("Firestore order save error, falling back to Google Sheets:", e);
        this.fetchFromGoogleScript('createOrder', { order });
      });
    }
  }

  static updateOrderStatus(id: string, status: OrderStatus): void {
    const list = this.getOrders();
    const order = list.find(o => o.id === id);
    if (order) {
      order.status = status;
      saveToStorage(this.KEYS.ORDERS, list);
      this.syncEventToGoogleScript('updateOrderStatus', { id, status });
      if (isSupabaseConfigured()) {
        supabase!.from('orders').update({ status }).eq('id', id).then(({ error }) => {
          if (error) console.error("Supabase order update error:", error);
        });
      } else {
        updateDoc(doc(db, COLLECTIONS.ORDERS, id), { status }).catch(e => console.error("Firestore order update error:", e));
      }

      // Send appropriate notification based on new status
      if (status === 'approved') {
        this.addNotification({
          id: 'NOTIF_APP_' + id + '_' + Date.now(),
          userId: order.userId,
          title: 'تم الموافقة على طلبكِ 👍🌸',
          message: `تمت مراجعة وقبول طلبكِ المميّز ذو الرقم المرجعي (${order.id}) بنجاح من قبل الإدارة، ويجري الآن نقله لقسم التجهيز!`,
          createdAt: new Date().toISOString(),
          isRead: false
        });
      } else if (status === 'preparing') {
        this.addNotification({
          id: 'NOTIF_PREP_' + id + '_' + Date.now(),
          userId: order.userId,
          title: 'طلبكِ قيد التجهيز الآن 🌸🎨',
          message: `عزيزتنا، طلبيتكِ ذات الرقم (${order.id}) هي الآن قيد التجهيز والتعبئة بكل حب ورعاية في مخازننا لتصلكِ بأفضل حُلّة!`,
          createdAt: new Date().toISOString(),
          isRead: false
        });
      } else if (status === 'shipping') {
        this.addNotification({
          id: 'NOTIF_SHIP_' + id + '_' + Date.now(),
          userId: order.userId,
          title: 'طلبكِ الرائع في الطريق إليكِ! 🚚🎉',
          message: `مبارك لكِ يا عزيزتي! 😍✨ طلبكِ المميّز ذو الرقم المرجعي (${order.id}) قد انطلق الآن مع مندوب التوصيل وهو في طريقهِ السريع إليكِ! استعدي لاستلامه دائماً مع أم روح 🌸🥳`,
          createdAt: new Date().toISOString(),
          isRead: false
        });
      } else if (status === 'completed') {
        this.addNotification({
          id: 'NOTIF_COMP_' + id + '_' + Date.now(),
          userId: order.userId,
          title: 'تم تسليم طلبكِ بنجاح! ✅🌸',
          message: `أهلاً بكِ يا غالية، تم تأكيد تسليم طلبكِ ذو الرقم المرجعي (${order.id}) بنجاح. تمنياتنا لكِ بجمال دائم وتجربة تسوق سعيدة!`,
          createdAt: new Date().toISOString(),
          isRead: false
        });
      } else if (status === 'canceled') {
        this.addNotification({
          id: 'NOTIF_CAN_' + Date.now(),
          userId: order.userId,
          title: 'تنبيه: تم إلغاء الطلب ❌',
          message: `لقد تم إلغاء طلبك ذو الرقم المرجعي (${order.id}). إذا كنتِ تعتقدين أن هناك خطأ أو لمزيد من الاستفسار يرجى الاتصال بمستشارتنا روح 🌸.`,
          createdAt: new Date().toISOString(),
          isRead: false
        });
      }
    }
  }

  // --- NOTIFICATIONS ---
  static getNotifications(userId: string): Notification[] {
    this.initialize();
    const list = loadFromStorage<Notification[]>(this.KEYS.NOTIFICATIONS, DEFAULT_NOTIFICATIONS);
    // Return notifications that are either public (no userId) or specific to this user
    return list.filter(n => !n.userId || n.userId === userId).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  static addNotification(notif: Notification): void {
    const list = loadFromStorage<Notification[]>(this.KEYS.NOTIFICATIONS, DEFAULT_NOTIFICATIONS);
    list.push(notif);
    saveToStorage(this.KEYS.NOTIFICATIONS, list);
    if (isSupabaseConfigured()) {
      const cleanNotif = {
        id: notif.id,
        userId: notif.userId || null,
        title: notif.title || '',
        message: notif.message || '',
        createdAt: notif.createdAt || '',
        isRead: !!notif.isRead,
        image: notif.image || null,
        productId: notif.productId || null
      };
      const proceedInsert = () => {
        supabase!.from('notifications').insert(cleanNotif).then(({ error }) => {
          if (error) console.error("Supabase notification save error:", error);
        });
      };
      if (cleanNotif.userId) {
        this.ensureUserInSupabase(cleanNotif.userId).then(proceedInsert);
      } else {
        proceedInsert();
      }
    } else {
      setDoc(doc(db, COLLECTIONS.NOTIFICATIONS, notif.id), notif).catch(e => console.error("Firestore notification save error:", e));
    }

    // Dispatch custom event to let React show in-app toasts & browser push notifications
    if (typeof window !== 'undefined') {
      const event = new CustomEvent('new-notification-alert', { detail: notif });
      window.dispatchEvent(event);
    }
  }

  static markAllNotificationsRead(userId: string): void {
    const list = loadFromStorage<Notification[]>(this.KEYS.NOTIFICATIONS, DEFAULT_NOTIFICATIONS);
    list.forEach(n => {
      if (!n.userId || n.userId === userId) {
        n.isRead = true;
        if (isSupabaseConfigured()) {
          supabase!.from('notifications').update({ isRead: true }).eq('id', n.id).then(undefined, () => {});
        } else {
          updateDoc(doc(db, COLLECTIONS.NOTIFICATIONS, n.id), { isRead: true }).catch(e => {});
        }
      }
    });
    saveToStorage(this.KEYS.NOTIFICATIONS, list);
  }

  // --- TARGETED NOTIFICATIONS & GIFTS ---
  static getTargetedNotifications(): TargetedNotification[] {
    this.initialize();
    return loadFromStorage<TargetedNotification[]>(this.KEYS.TARGETED_NOTIFICATIONS, []);
  }

  static saveTargetedNotification(notif: TargetedNotification): void {
    const list = this.getTargetedNotifications();
    const idx = list.findIndex(n => n.id === notif.id);
    if (idx >= 0) {
      list[idx] = notif;
    } else {
      list.push(notif);
    }
    saveToStorage(this.KEYS.TARGETED_NOTIFICATIONS, list);
    this.syncEventToGoogleScript('saveTargetedNotification', { notif });
    if (isSupabaseConfigured()) {
      supabase!.from('targeted_notifications').upsert(notif).then(({ error }) => {
        if (error) console.error("Supabase targeted notification save error:", error);
      });
    } else {
      setDoc(doc(db, COLLECTIONS.TARGETED_NOTIFICATIONS, notif.id), notif).catch(e => console.error("Firestore targeted notification save error:", e));
    }
  }

  static deleteTargetedNotification(id: string): void {
    const list = this.getTargetedNotifications();
    const filtered = list.filter(n => n.id !== id);
    saveToStorage(this.KEYS.TARGETED_NOTIFICATIONS, filtered);
    this.syncEventToGoogleScript('deleteTargetedNotification', { id });
    if (isSupabaseConfigured()) {
      supabase!.from('targeted_notifications').delete().eq('id', id).then(({ error }) => {
        if (error) console.error("Supabase targeted notification delete error:", error);
      });
    } else {
      deleteDoc(doc(db, COLLECTIONS.TARGETED_NOTIFICATIONS, id)).catch(e => console.error("Firestore targeted notification delete error:", e));
    }
  }

  static getTargetedGifts(): TargetedGift[] {
    this.initialize();
    return loadFromStorage<TargetedGift[]>(this.KEYS.TARGETED_GIFTS, []);
  }

  static saveTargetedGift(gift: TargetedGift): void {
    const list = this.getTargetedGifts();
    const idx = list.findIndex(g => g.id === gift.id);
    if (idx >= 0) {
      list[idx] = gift;
    } else {
      list.push(gift);
    }
    saveToStorage(this.KEYS.TARGETED_GIFTS, list);
    this.syncEventToGoogleScript('saveTargetedGift', { gift });
    if (isSupabaseConfigured()) {
      supabase!.from('targeted_gifts').upsert(gift).then(({ error }) => {
        if (error) console.error("Supabase targeted gift save error:", error);
      });
    } else {
      setDoc(doc(db, COLLECTIONS.TARGETED_GIFTS, gift.id), gift).catch(e => console.error("Firestore targeted gift save error:", e));
    }
  }

  static deleteTargetedGift(id: string): void {
    const list = this.getTargetedGifts();
    const filtered = list.filter(g => g.id !== id);
    saveToStorage(this.KEYS.TARGETED_GIFTS, filtered);
    this.syncEventToGoogleScript('deleteTargetedGift', { id });
    if (isSupabaseConfigured()) {
      supabase!.from('targeted_gifts').delete().eq('id', id).then(({ error }) => {
        if (error) console.error("Supabase targeted gift delete error:", error);
      });
    } else {
      deleteDoc(doc(db, COLLECTIONS.TARGETED_GIFTS, id)).catch(e => console.error("Firestore targeted gift delete error:", e));
    }
  }

  static getUserTargetedGiftLogs(): UserTargetedGiftLog[] {
    this.initialize();
    return loadFromStorage<UserTargetedGiftLog[]>(this.KEYS.TARGETED_GIFT_LOGS, []);
  }

  static saveUserTargetedGiftLog(log: UserTargetedGiftLog): void {
    const list = this.getUserTargetedGiftLogs();
    const idx = list.findIndex(l => l.id === log.id);
    if (idx >= 0) {
      list[idx] = log;
    } else {
      list.push(log);
    }
    saveToStorage(this.KEYS.TARGETED_GIFT_LOGS, list);
    this.syncEventToGoogleScript('saveUserTargetedGiftLog', { log });
    if (isSupabaseConfigured()) {
      supabase!.from('targeted_gift_logs').upsert(log).then(({ error }) => {
        if (error) console.error("Supabase user targeted gift log save error:", error);
      });
    } else {
      setDoc(doc(db, COLLECTIONS.TARGETED_GIFT_LOGS, log.id), log).catch(e => console.error("Firestore user targeted gift log save error:", e));
    }
  }

  static toggleProductFavorite(userId: string, productId: string): User {
    const active = this.getUser();
    if (active.id === userId) {
      const favorites = active.favorites || [];
      const index = favorites.indexOf(productId);
      if (index >= 0) {
        favorites.splice(index, 1);
      } else {
        favorites.push(productId);
      }
      active.favorites = favorites;
      this.saveUser(active);
      return active;
    } else {
      const allUsers = this.getAllUsers();
      const u = allUsers.find(user => user.id === userId);
      if (u) {
        const favorites = u.favorites || [];
        const index = favorites.indexOf(productId);
        if (index >= 0) {
          favorites.splice(index, 1);
        } else {
          favorites.push(productId);
        }
        u.favorites = favorites;
        saveToStorage('amrwh_all_users_list', allUsers);
        if (isSupabaseConfigured()) {
          supabase!.from('users').update({ favorites }).eq('id', userId).then(undefined, () => {});
        } else {
          setDoc(doc(db, COLLECTIONS.USERS, userId), u).catch(e => {});
        }
        return u;
      }
    }
    return active;
  }

  // --- ARCHIVED EVENTS METHODS ---
  static getArchivedEvents(): ArchivedEvent[] {
    this.initialize();
    return loadFromStorage<ArchivedEvent[]>(this.KEYS.ARCHIVED_EVENTS, []);
  }

  static saveArchivedEvent(event: ArchivedEvent): void {
    const list = this.getArchivedEvents();
    const idx = list.findIndex(e => e.id === event.id);
    if (idx >= 0) {
      list[idx] = event;
    } else {
      list.push(event);
    }
    saveToStorage(this.KEYS.ARCHIVED_EVENTS, list);
    this.syncEventToGoogleScript('saveArchivedEvent', { event });
    if (isSupabaseConfigured()) {
      supabase!.from('archived_events').upsert(event).then(({ error }) => {
        if (error) console.error("Supabase archived event save error:", error);
      });
    } else {
      setDoc(doc(db, COLLECTIONS.ARCHIVED_EVENTS, event.id), event).catch(e => console.error("Firestore archived event save error:", e));
    }
  }

  static deleteArchivedEvent(id: string): void {
    const list = this.getArchivedEvents();
    const filtered = list.filter(e => e.id !== id);
    saveToStorage(this.KEYS.ARCHIVED_EVENTS, filtered);
    this.syncEventToGoogleScript('deleteArchivedEvent', { id });
    if (isSupabaseConfigured()) {
      supabase!.from('archived_events').delete().eq('id', id).then(({ error }) => {
        if (error) console.error("Supabase archived event delete error:", error);
      });
    } else {
      deleteDoc(doc(db, COLLECTIONS.ARCHIVED_EVENTS, id)).catch(e => console.error("Firestore archived event delete error:", e));
    }
  }

  // --- CONTESTANTS & VOTES METHODS ---
  static getContestants(): Contestant[] {
    this.initialize();
    const list = loadFromStorage<Contestant[]>(this.KEYS.CONTESTANTS, []);
    return list.map(c => ({
      ...c,
      votes: c.votes !== undefined ? c.votes : (c.greenVotes || 0) + (c.redVotes || 0)
    }));
  }

  static addContestant(name: string, phone: string, customId?: string, customUserId?: string, imageUrl?: string): { success: boolean, error?: string, contestant?: Contestant } {
    this.initialize();
    const list = this.getContestants();
    const exists = list.find(c => c.phone === phone || (customId && c.id === customId));
    if (exists) {
      return { success: false, error: 'المتسابق مسجل بالفعل بهذا رقم الهاتف!', contestant: exists };
    }
    const contestantId = customId || ('CON_' + Date.now());
    const contestant: Contestant = {
      id: contestantId,
      userId: customUserId || customId || ('USER_MOCK_' + Date.now()),
      name,
      phone,
      createdAt: new Date().toISOString(),
      greenVotes: 0,
      redVotes: 0,
      votes: 0,
      imageUrl: imageUrl || ''
    };
    this.saveContestant(contestant);
    return { success: true, contestant };
  }

  static saveContestant(contestant: Contestant): void {
    const list = this.getContestants();
    const idx = list.findIndex(c => c.id === contestant.id);
    if (idx >= 0) {
      list[idx] = contestant;
    } else {
      list.push(contestant);
    }
    saveToStorage(this.KEYS.CONTESTANTS, list);
    this.syncEventToGoogleScript('saveContestant', { contestant });
    if (isSupabaseConfigured()) {
      const cleanContestant = {
        id: contestant.id,
        userId: contestant.userId || null,
        name: contestant.name || '',
        phone: contestant.phone || '',
        deviceId: contestant.deviceId || null,
        createdAt: contestant.createdAt || new Date().toISOString(),
        greenVotes: contestant.greenVotes ?? 0,
        redVotes: contestant.redVotes ?? 0,
        votes: contestant.votes ?? 0,
        imageUrl: contestant.imageUrl || null
      };
      supabase!.from('contestants').upsert(cleanContestant).then(({ error }) => {
        if (error) console.error("Supabase contestant save error:", error);
      });
    } else {
      setDoc(doc(db, COLLECTIONS.CONTESTANTS, contestant.id), contestant).catch(e => console.error("Firestore contestant save error:", e));
    }
  }

  static deleteContestant(id: string): { success: boolean, error?: string } {
    const list = this.getContestants();
    const filtered = list.filter(c => c.id !== id);
    saveToStorage(this.KEYS.CONTESTANTS, filtered);
    this.syncEventToGoogleScript('deleteContestant', { id });
    if (isSupabaseConfigured()) {
      supabase!.from('contestants').delete().eq('id', id).then(({ error }) => {
        if (error) console.error("Supabase contestant delete error:", error);
      });
    } else {
      deleteDoc(doc(db, COLLECTIONS.CONTESTANTS, id)).catch(e => console.error("Firestore contestant delete error:", e));
    }
    return { success: true };
  }

  static clearAllContestantsAndVotes(): void {
    const contestantsList = this.getContestants();
    const votesList = this.getVoteLogs();
    saveToStorage(this.KEYS.CONTESTANTS, []);
    saveToStorage(this.KEYS.VOTE_LOGS, []);
    
    for (const c of contestantsList) {
      if (isSupabaseConfigured()) {
        supabase!.from('contestants').delete().eq('id', c.id).then(undefined, () => {});
      } else {
        deleteDoc(doc(db, COLLECTIONS.CONTESTANTS, c.id)).catch(() => {});
      }
    }
    for (const v of votesList) {
      if (isSupabaseConfigured()) {
        supabase!.from('vote_logs').delete().eq('id', v.id).then(undefined, () => {});
      } else {
        deleteDoc(doc(db, COLLECTIONS.VOTE_LOGS, v.id)).catch(() => {});
      }
    }
  }

  static deleteOrder(id: string): void {
    const list = this.getOrders();
    const filtered = list.filter(o => o.id !== id);
    saveToStorage(this.KEYS.ORDERS, filtered);
    if (isSupabaseConfigured()) {
      supabase!.from('orders').delete().eq('id', id).then(({ error }) => {
        if (error) console.error("Supabase order delete error:", error);
      });
    } else {
      deleteDoc(doc(db, COLLECTIONS.ORDERS, id)).catch(e => console.error("Firestore order delete error:", e));
    }
  }

  static clearAllOrders(): void {
    const list = this.getOrders();
    saveToStorage(this.KEYS.ORDERS, []);
    for (const order of list) {
      if (isSupabaseConfigured()) {
        supabase!.from('orders').delete().eq('id', order.id).then(undefined, () => {});
      } else {
        deleteDoc(doc(db, COLLECTIONS.ORDERS, order.id)).catch(() => {});
      }
    }
  }

  static deleteRechargeRequest(id: string): void {
    const list = this.getRechargeRequests();
    const filtered = list.filter(r => r.id !== id);
    saveToStorage(this.KEYS.RECHARGES, filtered);
    if (isSupabaseConfigured()) {
      supabase!.from('recharges').delete().eq('id', id).then(({ error }) => {
        if (error) console.error("Supabase recharge delete error:", error);
      });
    } else {
      deleteDoc(doc(db, COLLECTIONS.RECHARGES, id)).catch(e => console.error("Firestore recharge delete error:", e));
    }
  }

  static clearAllRechargeRequests(): void {
    const list = this.getRechargeRequests();
    saveToStorage(this.KEYS.RECHARGES, []);
    for (const req of list) {
      if (isSupabaseConfigured()) {
        supabase!.from('recharges').delete().eq('id', req.id).then(undefined, () => {});
      } else {
        deleteDoc(doc(db, COLLECTIONS.RECHARGES, req.id)).catch(() => {});
      }
    }
  }

  static deleteGift(id: string): void {
    this.initialize();
    const list = this.getGifts();
    const filtered = list.filter(g => g.id !== id);
    saveToStorage(this.KEYS.GIFTS, filtered);
    if (isSupabaseConfigured()) {
      supabase!.from('gifts').delete().eq('id', id).then(({ error }) => {
        if (error) console.error("Supabase gift delete error:", error);
      });
    } else {
      deleteDoc(doc(db, COLLECTIONS.GIFTS, id)).catch(e => console.error("Firestore gift delete error:", e));
    }
  }

  static revertGiftAndDeduct(id: string): void {
    this.initialize();
    const list = this.getGifts();
    const gift = list.find(g => g.id === id);
    if (!gift) return;

    // Deduct gift balance from user
    const allUsers = this.getAllUsers();
    const target = allUsers.find(u => u.id === gift.userId);
    if (target) {
      target.giftBalance = Math.max(0, (target.giftBalance || 0) - gift.amount);
      saveToStorage('amrwh_all_users_list', allUsers);

      if (isSupabaseConfigured()) {
        supabase!.from('users').update({ giftBalance: target.giftBalance }).eq('id', gift.userId).then(undefined, e => console.error(e));
      } else {
        updateDoc(doc(db, COLLECTIONS.USERS, gift.userId), { giftBalance: target.giftBalance }).catch(e => console.error(e));
      }

      // Update active user if same
      const activeUser = this.getUser();
      if (activeUser.id === gift.userId) {
        activeUser.giftBalance = target.giftBalance;
        saveToStorage(this.KEYS.USER, activeUser);
      }
    }

    // Now delete the gift record
    this.deleteGift(id);
  }

  static revertRechargeAndDeduct(id: string): void {
    this.initialize();
    const list = this.getRechargeRequests();
    const req = list.find(r => r.id === id);
    if (!req) return;

    // If it was approved, deduct from the user's balance
    if (req.status === 'approved') {
      const allUsers = this.getAllUsers();
      const target = allUsers.find(u => u.id === req.userId);
      if (target) {
        target.balance = Math.max(0, (target.balance || 0) - req.amount);
        saveToStorage('amrwh_all_users_list', allUsers);

        if (isSupabaseConfigured()) {
          supabase!.from('users').update({ balance: target.balance }).eq('id', req.userId).then(undefined, e => console.error(e));
        } else {
          updateDoc(doc(db, COLLECTIONS.USERS, req.userId), { balance: target.balance }).catch(e => console.error(e));
        }

        // Update active user if same
        const activeUser = this.getUser();
        if (activeUser.id === req.userId) {
          activeUser.balance = target.balance;
          saveToStorage(this.KEYS.USER, activeUser);
        }
      }
    }

    // Now delete the recharge request
    this.deleteRechargeRequest(id);
  }

  static getVoteLogs(): VoteLog[] {
    this.initialize();
    return loadFromStorage<VoteLog[]>(this.KEYS.VOTE_LOGS, []);
  }

  static addVoteLog(vote: VoteLog): void {
    const list = this.getVoteLogs();
    list.push(vote);
    saveToStorage(this.KEYS.VOTE_LOGS, list);
    this.syncEventToGoogleScript('addVoteLog', { vote });
    if (isSupabaseConfigured()) {
      const cleanVote = {
        id: vote.id,
        contestantId: vote.contestantId,
        voterUserId: vote.voterUserId || null,
        voterDeviceId: vote.voterDeviceId,
        voterType: vote.voterType || 'green',
        createdAt: vote.createdAt || new Date().toISOString()
      };
      supabase!.from('vote_logs').insert(cleanVote).then(({ error }) => {
        if (error) console.error("Supabase vote log insert error:", error);
      });
    } else {
      setDoc(doc(db, COLLECTIONS.VOTE_LOGS, vote.id), vote).catch(e => console.error("Firestore vote log insert error:", e));
    }
  }

  static voteForContestant(contestantId: string, voterName: string, voterDeviceId: string, voteType: 'green' | 'red' = 'green'): { success: boolean, error?: string } {
    this.initialize();
    
    // Anti-fraud device check
    if (this.isDeviceBlockedFromVoting(voterDeviceId)) {
      return { success: false, error: 'عذراً، هذا الجهاز محظور من التصويت لمخالفته معايير الاستخدام العادل!' };
    }
    
    // Check if voter has already voted
    const voteLogs = this.getVoteLogs();
    const alreadyVoted = voteLogs.find(v => v.voterDeviceId === voterDeviceId && v.contestantId === contestantId);
    if (alreadyVoted) {
      return { success: false, error: 'لقد قمت بالتصويت لهذا المتسابق بالفعل من هذا الجهاز!' };
    }

    const contestants = this.getContestants();
    const contestant = contestants.find(c => c.id === contestantId);
    if (!contestant) {
      return { success: false, error: 'المتسابق غير موجود!' };
    }

    // Add a vote log
    const voteLogId = 'VOTE_' + Date.now();
    const voterUserId = 'VOTER_' + Date.now();
    const newLog: VoteLog = {
      id: voteLogId,
      contestantId,
      voterUserId,
      voterDeviceId,
      voterType: voteType,
      createdAt: new Date().toISOString()
    };
    this.addVoteLog(newLog);

    // Increment votes
    if (voteType === 'green') {
      contestant.greenVotes = (contestant.greenVotes || 0) + 1;
    } else {
      contestant.redVotes = (contestant.redVotes || 0) + 1;
    }
    contestant.votes = (contestant.greenVotes || 0) + (contestant.redVotes || 0);
    this.saveContestant(contestant);

    return { success: true };
  }

  static async clearAllEventData(): Promise<void> {
    saveToStorage(this.KEYS.CONTESTANTS, []);
    saveToStorage(this.KEYS.VOTE_LOGS, []);
    if (isSupabaseConfigured()) {
      await supabase!.from('contestants').delete().neq('id', 'dummy');
      await supabase!.from('vote_logs').delete().neq('id', 'dummy');
    }
  }

  // --- APP NOTIFICATIONS METHODS (RICH PUSH NOTIFICATIONS) ---
  static getAppNotifications(): AppNotification[] {
    this.initialize();
    return loadFromStorage<AppNotification[]>(this.KEYS.APP_NOTIFICATIONS, []);
  }

  static saveAppNotification(notification: AppNotification): void {
    const list = this.getAppNotifications();
    const idx = list.findIndex(n => n.id === notification.id);
    if (idx >= 0) {
      list[idx] = notification;
    } else {
      list.push(notification);
    }
    saveToStorage(this.KEYS.APP_NOTIFICATIONS, list);
    this.syncEventToGoogleScript('saveAppNotification', { notification });
    if (isSupabaseConfigured()) {
      supabase!.from('app_notifications').upsert(notification).then(({ error }) => {
        if (error) console.error("Supabase app notification save error:", error);
      });
    } else {
      setDoc(doc(db, COLLECTIONS.APP_NOTIFICATIONS, notification.id), notification).catch(e => console.error("Firestore app notification save error:", e));
    }
  }

  static deleteAppNotification(id: string): void {
    const list = this.getAppNotifications();
    const filtered = list.filter(n => n.id !== id);
    saveToStorage(this.KEYS.APP_NOTIFICATIONS, filtered);
    this.syncEventToGoogleScript('deleteAppNotification', { id });
    if (isSupabaseConfigured()) {
      supabase!.from('app_notifications').delete().eq('id', id).then(({ error }) => {
        if (error) console.error("Supabase app notification delete error:", error);
      });
    } else {
      deleteDoc(doc(db, COLLECTIONS.APP_NOTIFICATIONS, id)).catch(e => console.error("Firestore app notification delete error:", e));
    }
  }

  static flushExpiredAppNotifications(): void {
    try {
      const rawList = loadFromStorage<any>(this.KEYS.APP_NOTIFICATIONS, []);
      const list = Array.isArray(rawList) ? rawList : [];
      if (list.length === 0) return;

      const now = Date.now();
      const active: AppNotification[] = [];
      let changed = false;

      list.forEach(n => {
        if (!n || typeof n !== 'object' || !n.id) {
          changed = true;
          return; // Skip invalid entries
        }
        try {
          const createdTime = n.createdAt ? new Date(n.createdAt).getTime() : 0;
          const expiryTime = n.expiryAt ? new Date(n.expiryAt).getTime() : 0;
          const ageHours = createdTime ? (now - createdTime) / (1000 * 60 * 60) : 0;
          
          if (ageHours >= 48 || (expiryTime && expiryTime <= now)) {
            changed = true;
          } else {
            active.push(n);
          }
        } catch {
          changed = true; // Clean up if date parsing fails
        }
      });

      if (changed) {
        saveToStorage(this.KEYS.APP_NOTIFICATIONS, active);
      }
    } catch (outerErr: any) {
      console.warn("Error in flushExpiredAppNotifications local cleanup:", outerErr?.message || String(outerErr));
    }
  }

  static async getSupabaseTableStats(): Promise<{ tableName: string, count: number, sizeKb: number }[]> {
    const tables = [
      'users', 'categories', 'products', 'orders', 'gifts', 'recharges', 
      'phone_requests', 'notifications', 'targeted_notifications', 
      'targeted_gifts', 'targeted_gift_logs', 'ticker_texts', 'locations',
      'contestants', 'vote_logs', 'app_notifications'
    ];
    
    const stats: { tableName: string, count: number, sizeKb: number }[] = [];
    
    if (isSupabaseConfigured()) {
      for (const table of tables) {
        try {
          const { count, error } = await supabase!
            .from(table)
            .select('*', { count: 'exact', head: true });
          
          if (!error && count !== null) {
            let avgRowSize = 0.5; // default 0.5 KB
            if (table === 'orders' || table === 'products') avgRowSize = 2.0;
            if (table === 'recharges') avgRowSize = 1.5;
            
            stats.push({
              tableName: table,
              count: count,
              sizeKb: Math.round(count * avgRowSize * 10) / 10
            });
          } else {
            const localCount = this.getLocalTableCount(table);
            let avgRowSize = 0.5;
            if (table === 'orders' || table === 'products') avgRowSize = 2.0;
            if (table === 'recharges') avgRowSize = 1.5;
            stats.push({ tableName: table, count: localCount, sizeKb: Math.round(localCount * avgRowSize * 10) / 10 });
          }
        } catch (err) {
          const localCount = this.getLocalTableCount(table);
          let avgRowSize = 0.5;
          if (table === 'orders' || table === 'products') avgRowSize = 2.0;
          if (table === 'recharges') avgRowSize = 1.5;
          stats.push({ tableName: table, count: localCount, sizeKb: Math.round(localCount * avgRowSize * 10) / 10 });
        }
      }
    } else {
      for (const table of tables) {
        const localCount = this.getLocalTableCount(table);
        let avgRowSize = 0.5;
        if (table === 'orders' || table === 'products') avgRowSize = 2.0;
        if (table === 'recharges') avgRowSize = 1.5;
        stats.push({
          tableName: table,
          count: localCount,
          sizeKb: Math.round(localCount * avgRowSize * 10) / 10
        });
      }
    }
    return stats;
  }

  private static getLocalTableCount(table: string): number {
    try {
      if (table === 'users') return this.getAllUsers().length;
      if (table === 'categories') return this.getCategories().length;
      if (table === 'products') return this.getProducts().length;
      if (table === 'orders') return this.getOrders().length;
      if (table === 'recharges') return this.getRechargeRequests().length;
      if (table === 'phone_requests') return this.getPhoneRequests().length;
      if (table === 'ticker_texts') return this.getTickerTexts().length;
      if (table === 'locations') return this.getLocations().length;
      if (table === 'contestants') return this.getContestants().length;
      if (table === 'vote_logs') return this.getVoteLogs().length;
      if (table === 'app_notifications') return this.getAppNotifications().length;
      if (table === 'notifications') return this.getAppNotifications().length;
      return 0;
    } catch {
      return 0;
    }
  }

  // --- GLOBAL EXPORT / IMPORT FOR DATABASE (THE BACKUP TOOL) ---
  static exportFullBackup(): string {
    const backup: Record<string, any> = {};
    Object.entries(this.KEYS).forEach(([_, storeKey]) => {
      backup[storeKey] = localStorage.getItem(storeKey);
    });
    backup['amrwh_all_users_list'] = localStorage.getItem('amrwh_all_users_list');
    return JSON.stringify(backup);
  }

  static importFullBackup(jsonStr: string): boolean {
    try {
      const backup = JSON.parse(jsonStr);
      Object.entries(backup).forEach(([storeKey, val]) => {
        if (val !== null) {
          localStorage.setItem(storeKey, val as string);
        }
      });
      return true;
    } catch (e) {
      return false;
    }
  }

  // --- BLOCKED DEVICES / IP TRACKING FOR ANTI-VOTING FRAUD ---
  static getBlockedDevices(): string[] {
    this.initialize();
    return loadFromStorage<string[]>('amrwh_blocked_device_ids', []);
  }

  static saveBlockedDevices(devices: string[]): void {
    saveToStorage('amrwh_blocked_device_ids', devices);
    if (isSupabaseConfigured()) {
      supabase!.from('settings').upsert({ id: 'blocked_devices', data: { list: devices } }).then(({ error }) => {
        if (error) console.error("Supabase blocked devices save error:", error);
      });
    }
  }

  static addBlockedDevice(deviceId: string): void {
    const list = this.getBlockedDevices();
    if (!list.includes(deviceId)) {
      list.push(deviceId);
      this.saveBlockedDevices(list);
    }
  }

  static removeBlockedDevice(deviceId: string): void {
    const list = this.getBlockedDevices();
    const filtered = list.filter(d => d !== deviceId);
    this.saveBlockedDevices(filtered);
  }

  static isDeviceBlockedFromVoting(deviceId: string): boolean {
    const list = this.getBlockedDevices();
    const cleanId = deviceId.split('|IP:')[0];
    return list.some(d => d.split('|IP:')[0] === cleanId);
  }

  // --- PERSISTENT ACTIVE CARTS SYNCHRONIZATION ---
  static async syncCartToSupabase(cartItems: OrderItem[]): Promise<void> {
    if (!isSupabaseConfigured()) return;
    const deviceId = this.getDeviceId();
    const user = this.getUser();
    const userId = user && user.id && user.id !== 'USER_DEFAULT' ? user.id : null;
    try {
      await supabase!.from('active_carts').upsert({
        id: deviceId,
        items: cartItems,
        userId: userId,
        updatedAt: new Date().toISOString()
      });
      console.log('Cart synced to Supabase successfully');
    } catch (e) {
      console.warn('Failed to sync cart to Supabase:', e);
    }
  }

  static async getSyncedCartFromSupabase(): Promise<OrderItem[] | null> {
    if (!isSupabaseConfigured()) return null;
    const deviceId = this.getDeviceId();
    try {
      const { data, error } = await supabase!.from('active_carts').select('items').eq('id', deviceId).maybeSingle();
      if (error) {
        console.warn('Failed to retrieve synced cart:', error);
        return null;
      }
      return data ? (data.items as OrderItem[]) : null;
    } catch (e) {
      console.warn('Error fetching synced cart from Supabase:', e);
      return null;
    }
  }

  static async getAllActiveCarts(): Promise<any[]> {
    if (!isSupabaseConfigured()) return [];
    try {
      const { data, error } = await supabase!
        .from('active_carts')
        .select('*')
        .order('updatedAt', { ascending: false });
      if (error) {
        console.warn('Failed to retrieve all active carts:', error);
        return [];
      }
      return data || [];
    } catch (e) {
      console.warn('Error fetching all active carts from Supabase:', e);
      return [];
    }
  }
}
