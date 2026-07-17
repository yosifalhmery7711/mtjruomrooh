/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  Settings, 
  Grid, 
  Plus, 
  Minus, 
  ShoppingBag, 
  Percent, 
  Database as DbIcon, 
  Gift, 
  FileText, 
  Truck, 
  Check, 
  X, 
  Upload, 
  Search, 
  ArrowRight, 
  Eye, 
  DollarSign, 
  User as UserIcon,
  HelpCircle,
  AlertCircle,
  Printer,
  MapPin,
  TrendingUp,
  Trash2,
  Copy,
  Award,
  Bell,
  RefreshCw,
  Archive
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Category, 
  Product, 
  Order, 
  ExchangeRate, 
  Gift as GiftType, 
  RechargeRequest, 
  AdvisorSettings, 
  User,
  Currency,
  PhoneChangeRequest,
  DeliveryLocation,
  Contestant,
  ArchivedEvent,
  AppNotification,
  VoteLog,
  OrderStatus,
  OrderItem
} from '../types';
import { Database } from '../Database';
import { convertPrice, getCurrencySymbol, getCurrencyCode, formatArabicDate, getDirectImageUrl, playNotificationSound } from '../utils';
import { initAuth, googleSignIn, logout as googleLogout, uploadFileToDrive } from '../googleAuth';
import { supabase, isSupabaseConfigured } from '../supabase';
import { User as FirebaseUser } from 'firebase/auth';
import { runBrowserMigration, MigrationProgress } from '../supabaseMigrator';
import { UnauthorizedDomainModal } from './UnauthorizedDomainModal';
import { SUPABASE_SCHEMA_SQL } from '../supabaseSchemaSql';

const TABLE_ARABIC_NAMES: Record<string, { title: string, desc: string, icon: string }> = {
  users: { title: 'المستخدمون والعملاء', desc: 'الحسابات المسجلة وبصمات الأجهزة للعملاء', icon: '👥' },
  categories: { title: 'أقسام المنتجات', desc: 'فئات وتصنيفات المتجر الأساسية والفرعية', icon: '📁' },
  products: { title: 'المنتجات والأصناف', desc: 'تفاصيل المنتجات والأسعار والمخزون', icon: '🛍️' },
  orders: { title: 'الطلبـات والمبيعات', desc: 'عمليات الشراء، الهدايا المرسلة، وحالة التوصيل', icon: '📦' },
  gifts: { title: 'الهدايا والمكافآت', desc: 'قائمة الهدايا المتاحة للاستبدال بنقاط', icon: '🎁' },
  recharges: { title: 'عمليات شحن الأرصدة', desc: 'سجلات كروت الشحن وتحويلات المحافظ الإلكترونية', icon: '💳' },
  phone_requests: { title: 'طلبات تفعيل الأرقام', desc: 'طلبات تفعيل أرقام الهواتف يدوياً أو آلياً', icon: '📱' },
  notifications: { title: 'الإشعارات العامة', desc: 'رسائل الإعلانات والترويج لجميع المستخدمين', icon: '🔔' },
  targeted_notifications: { title: 'الإشعارات الموجهة', desc: 'التنبيهات المخصصة لعميل محدد أو مجموعة معينة', icon: '🎯' },
  targeted_gifts: { title: 'الهدايا المخصصة', desc: 'العروض والمكافآت المخصصة لعملاء معينين', icon: '🎖️' },
  targeted_gift_logs: { title: 'سجلات استلام الهدايا المخصصة', desc: 'عمليات التحقق واستلام العروض الفردية', icon: '📝' },
  ticker_texts: { title: 'شريط الإعلانات', desc: 'شريط الأخبار المتحرك أعلى شاشة التطبيق', icon: '📢' },
  locations: { title: 'العناوين والمناطق', desc: 'خيارات التوصيل وأسعار الشحن للمحافظات والمدن', icon: '📍' },
  contestants: { title: 'المتسابقات واللوحات', desc: 'لوحات المشاركات في مسابقة "أم روح" الكبرى', icon: '🌸' },
  vote_logs: { title: 'سجلات وبصمات التصويت', desc: 'سجلات الأصوات ومكافحة التلاعب لضمان النزاهة', icon: '🗳️' },
  app_notifications: { title: 'إشعارات النظام', desc: 'المنبهات والإشعارات التنبيهية والمنبثقات الفورية', icon: '💬' }
};

interface AdminPanelProps {
  onClose: () => void;
  rates: ExchangeRate;
  onRatesUpdate: (newRates: ExchangeRate) => void;
  onAdvisorUpdate: (newAdvisor: AdvisorSettings) => void;
  onAdminCodeUpdate: (newCode: string) => void;
  adminCode: string;
  adminRole: 'full' | 'worker';
}

type AdminTab = 'settings' | 'categories' | 'products' | 'offers' | 'users' | 'gifts' | 'new-orders' | 'sent-orders' | 'recharges' | 'locations' | 'reports' | 'database' | 'events' | 'notifications' | 'archives' | 'reversions' | 'active-carts';

export default function AdminPanel({
  onClose,
  rates,
  onRatesUpdate,
  onAdvisorUpdate,
  onAdminCodeUpdate,
  adminCode,
  adminRole
}: AdminPanelProps) {
  // Tabs State
  const [activeTab, setActiveTab] = useState<AdminTab>(adminRole === 'worker' ? 'categories' : 'settings');
  const [subArchiveTab, setSubArchiveTab] = useState<'recharges' | 'orders' | 'events'>('recharges');
  const [rechargeArchiveFilter, setRechargeArchiveFilter] = useState<'all' | 'approved' | 'rejected' | 'pending'>('all');
  const [orderArchiveFilter, setOrderArchiveFilter] = useState<'all' | 'new' | 'completed' | 'canceled'>('all');

  // Unified State Loaded from localStorage Database
  const [users, setUsers] = useState<User[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [recharges, setRecharges] = useState<RechargeRequest[]>([]);
  const [phoneRequests, setPhoneRequests] = useState<PhoneChangeRequest[]>([]);
  const [advisor, setAdvisor] = useState<AdvisorSettings>(Database.getAdvisorSettings());
  const [code, setCode] = useState(adminCode);
  const [offerImages, setOfferImages] = useState<string[]>([]);
  const [locations, setLocations] = useState<DeliveryLocation[]>([]);
  const [adminTickerTexts, setAdminTickerTexts] = useState<string[]>(() => Database.getTickerTexts());
  const [newTickerInput, setNewTickerInput] = useState('');
  const [giftsList, setGiftsList] = useState<GiftType[]>(() => Database.getGifts());
  const [reversionSubTab, setReversionSubTab] = useState<'users' | 'recharges' | 'gifts'>('users');
  const [reversionSearchQuery, setReversionSearchQuery] = useState('');

  // Supabase migration states
  const [isMigratingSupabase, setIsMigratingSupabase] = useState(false);
  const [migrationLogs, setMigrationLogs] = useState<string[]>([]);
  const [migrationProgress, setMigrationProgress] = useState<Record<string, MigrationProgress>>({});
  const [isAdminRefreshing, setIsAdminRefreshing] = useState(false);
  
  // Custom source Firebase credentials for migration
  const [sourceFirebase, setSourceFirebase] = useState({
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'leafy-standard-n8gvj',
    appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:24741312317:web:5d3c59dcf3de9bb4aab754',
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyCce8aoROlJ05qVNJS4WmvH7VNm0WN9nMA',
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'leafy-standard-n8gvj.firebaseapp.com',
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'leafy-standard-n8gvj.firebasestorage.app',
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '24741312317',
    firestoreDatabaseId: import.meta.env.VITE_FIREBASE_DATABASE_ID || 'ai-studio-remixremixremixu-74910bc8-ebe1-4039-b0a8-75eae5559f8b'
  });
  const [showFirebaseInputs, setShowFirebaseInputs] = useState(false);

  // Supabase Connection & Schema status states
  const [dbStatus, setDbStatus] = useState<any>(null);
  const [isCheckingStatus, setIsCheckingStatus] = useState(false);
  const [isCreatingSchema, setIsCreatingSchema] = useState(false);

  // Storage Monitor state
  const [tableStats, setTableStats] = useState<{ tableName: string, count: number, sizeKb: number }[]>([]);
  const [isFetchingStats, setIsFetchingStats] = useState(false);

  // Customer selection states
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);

  // Event & Voting State
  const [isEventActive, setIsEventActive] = useState<boolean>(() => !!Database.getAdminSettings().isEventActive);
  const [eventImageUrl, setEventImageUrl] = useState<string>(() => Database.getAdminSettings().eventImageUrl || '');
  const [eventTitle, setEventTitle] = useState<string>(() => Database.getAdminSettings().eventTitle || 'مسابقة متجر أم روح الكبرى 🏆🌸');
  const [eventDescription, setEventDescription] = useState<string>(() => Database.getAdminSettings().eventDescription || 'شاركي معنا في أكبر فعالية تصويت لربح جوائز قيمة ومباشرة من متجر أم روح! أنشئي رابطكِ الخاص الآن وشاركي صديقاتكِ 🌸.');
  const [eventWinnerPrize, setEventWinnerPrize] = useState<string>(() => Database.getAdminSettings().eventWinnerPrize || '50,000 ريال يمني');

  // Contestants list & Forms
  const [contestants, setContestants] = useState<Contestant[]>([]);
  const [newContestantName, setNewContestantName] = useState('');
  const [newContestantPhone, setNewContestantPhone] = useState('');
  const [newContestantImageUrl, setNewContestantImageUrl] = useState('');
  const [uploadingContestantImage, setUploadingContestantImage] = useState(false);

  // Anti-fraud device tracking & UID migration states
  const [voteLogs, setVoteLogs] = useState<VoteLog[]>([]);
  const [blockedDevices, setBlockedDevices] = useState<string[]>([]);
  const [manualBlockInput, setManualBlockInput] = useState('');
  const [isMigratingUserIds, setIsMigratingUserIds] = useState(false);
  const [migrationUserResult, setMigrationUserResult] = useState<string | null>(null);

  // Archived Events State
  const [archivedEvents, setArchivedEvents] = useState<ArchivedEvent[]>(() => Database.getArchivedEvents());
  
  // Active Client Carts State
  const [activeCarts, setActiveCarts] = useState<any[]>([]);
  const [isLoadingCarts, setIsLoadingCarts] = useState(false);

  const fetchActiveCarts = async () => {
    setIsLoadingCarts(true);
    try {
      const carts = await Database.getAllActiveCarts();
      setActiveCarts(carts);
    } catch (e) {
      console.error('Failed to fetch active carts:', e);
    } finally {
      setIsLoadingCarts(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'active-carts') {
      fetchActiveCarts();
    }
  }, [activeTab]);
  const [newArchivedEventName, setNewArchivedEventName] = useState('');
  const [newArchivedEventWinner, setNewArchivedEventWinner] = useState('');
  const [newArchivedEventAmount, setNewArchivedEventAmount] = useState<number>(0);
  const [newArchivedEventCurrency, setNewArchivedEventCurrency] = useState<Currency>('YER_NEW');
  const [newArchivedEventImageUrl, setNewArchivedEventImageUrl] = useState('');
  const [newArchivedEventShowInSlider, setNewArchivedEventShowInSlider] = useState(true);
  const [uploadingArchivedEventImg, setUploadingArchivedEventImg] = useState(false);

  // App Notifications State
  const [appNotifications, setAppNotifications] = useState<AppNotification[]>(() => Database.getAppNotifications());
  const [newNotifTitle, setNewNotifTitle] = useState('');
  const [newNotifMessage, setNewNotifMessage] = useState('');
  const [newNotifDurationHours, setNewNotifDurationHours] = useState<number>(48);
  const [newNotifImageUrl, setNewNotifImageUrl] = useState('');
  const [newNotifProductId, setNewNotifProductId] = useState('');
  const [uploadingNotifImg, setUploadingNotifImg] = useState(false);
  const [editingNotifId, setEditingNotifId] = useState<string | null>(null);

  const fetchDbStatus = async () => {
    setIsCheckingStatus(true);
    setIsFetchingStats(true);
    try {
      const response = await fetch('/api/supabase/status');
      const data = await response.json();
      setDbStatus(data);
      
      const stats = await Database.getSupabaseTableStats();
      setTableStats(stats);
    } catch (error) {
      console.error('Failed to fetch DB status:', error);
      setDbStatus({ pgConnected: false, error: 'تعذر الاتصال بخادم التطبيق.' });
    } finally {
      setIsCheckingStatus(false);
      setIsFetchingStats(false);
    }
  };

  const handleCreateSchema = async () => {
    setIsCreatingSchema(true);
    try {
      const response = await fetch('/api/supabase/setup-schema', { method: 'POST' });
      const data = await response.json();
      if (data.success) {
        showToast('🎉 ' + data.message);
        fetchDbStatus(); // Refresh status
      } else {
        alert(`❌ فشل تهيئة الجداول: ${data.error}`);
      }
    } catch (error: any) {
      alert(`❌ خطأ في الاتصال بالخادم: ${error.message || error}`);
    } finally {
      setIsCreatingSchema(false);
    }
  };

  // Google Sheets Backup states
  const [isBackupMode, setIsBackupMode] = useState(Database.isBackupMode());
  const [isTestingGoogle, setIsTestingGoogle] = useState(false);
  const [googleScriptUrl, setGoogleScriptUrlState] = useState(Database.getGoogleScriptUrl());
  const [isTransferringGoogle, setIsTransferringGoogle] = useState(false);
  const [googleStats, setGoogleStats] = useState(Database.getGoogleBackupStats());

  const refreshGoogleStats = () => {
    setGoogleStats(Database.getGoogleBackupStats());
  };

  const toggleBackupMode = (checked: boolean) => {
    Database.setBackupMode(checked);
    setIsBackupMode(checked);
    showToast(checked ? '🟢 تم التبديل إلى وضع جوجل شيتس الاحتياطي' : '🔵 تم التبديل إلى وضع سوبابيس الأساسي');
  };

  const handleSaveGoogleScriptUrl = () => {
    if (!googleScriptUrl.trim()) {
      alert('❌ يرجى إدخال رابط سكريبت صحيح');
      return;
    }
    Database.setGoogleScriptUrl(googleScriptUrl.trim());
    showToast('💾 تم حفظ وتحديث رابط Google Script بنجاح');
  };

  const handleTestGoogleConnection = async () => {
    setIsTestingGoogle(true);
    try {
      const res = await Database.fetchFromGoogleScript('getProducts');
      if (res.success) {
        alert(`✅ تم الاتصال برابط Google Script بنجاح!\nتم استلام البيانات والمنتجات بشكل سليم ومستقر عبر رابط السكريبت الحالي.`);
      } else {
        alert(`❌ فشل الاتصال برابط السكريبت الخاص بكِ: ${res.error}\nيرجى التأكد من نشر السكريبت كـ Web App وتعيين الوصول لـ (Anyone).`);
      }
    } catch (e: any) {
      alert(`❌ خطأ في اختبار الاتصال: ${e.message || String(e)}`);
    } finally {
      setIsTestingGoogle(false);
      refreshGoogleStats();
    }
  };

  const handleTransferAllDataToGoogle = async () => {
    const confirmTransfer = window.confirm(
      "⚠️ ترحيل ونقل كافة البيانات السابقة:\n\nهل تودين ترحيل كافة المنتجات، الأقسام، الطلبات، المستخدمين، الإشعارات، والطلبات المخزنة حالياً في المتجر (Supabase / Firestore) مباشرة إلى شيت في جوجل درايف؟\n\nهذا الإجراء سيقوم بتحديث وحفظ البيانات هناك دون أي تكرار."
    );
    if (!confirmTransfer) return;

    setIsTransferringGoogle(true);
    try {
      const res = await Database.syncAllDataToGoogleDrive();
      if (res.success) {
        alert(`🎉 تم ترحيل ونقل كافة البيانات السابقة بنجاح!\n\n` +
          `النتائج من Google Sheets:\n` +
          `- نجاح النقل والتحديث بدون تكرار لجميع المنتجات والأقسام والطلبات السابقة.\n` +
          `- تم دمج وحفظ روابط الصور وتفاصيل التطبيق بالكامل.\n\n` +
          `يعمل متجر أم روح الآن بكفاءة مطلقة واستمرارية مرنة تامة في أي بيئة!`);
        showToast('🟢 تم ترحيل كامل البيانات إلى جوجل شيتس بنجاح');
      } else {
        alert(`❌ فشل ترحيل البيانات: ${res.error}\nيرجى التحقق من نشر السكريبت وتعيين دالة doPost لتدعم ترحيل البيانات (action == "syncAllData").`);
      }
    } catch (e: any) {
      alert(`❌ خطأ في ترحيل البيانات: ${e.message || String(e)}`);
    } finally {
      setIsTransferringGoogle(false);
      refreshGoogleStats();
    }
  };

  useEffect(() => {
    if (activeTab === 'database') {
      fetchDbStatus();
      refreshGoogleStats();
    }
  }, [activeTab]);

  const handleSupabaseMigration = async () => {
    setIsMigratingSupabase(true);
    setMigrationLogs([]);
    setMigrationProgress({});
    try {
      const res = await runBrowserMigration(
        (log) => {
          setMigrationLogs(prev => [...prev, log]);
        },
        (stepKey, progress) => {
          setMigrationProgress(prev => ({
            ...prev,
            [stepKey]: progress
          }));
        },
        sourceFirebase
      );
      if (res.success) {
        showToast('🎉 تم ترحيل جميع البيانات والجداول السحابية إلى Supabase بنجاح!');
      } else {
        if (res.message.includes('PGRST205') || res.message.includes('42P01') || res.message.toLowerCase().includes('relation') || res.message.toLowerCase().includes('table')) {
          alert(`⚠️ تنبيه هام لمتجر أم روح: جداول قاعدة بيانات Supabase غير منشأة بعد!\n\nيرجى الذهاب إلى لوحة تحكم Supabase الخاصة بكِ، ثم فتح (SQL Editor)، ونسخ محتويات ملف "supabase-schema.sql" بالكامل ولصقها هناك والنقر على (Run) لإنشاء الجداول وسياسات الأمان بنجاح أولاً، ثم إعادة محاولة الترحيل.`);
        }
        showToast(`❌ فشل بعض ترحيل البيانات: ${res.message}`);
      }
    } catch (err: any) {
      const errMsg = err.message || String(err);
      if (errMsg.includes('PGRST205') || errMsg.includes('42P01') || errMsg.toLowerCase().includes('relation') || errMsg.toLowerCase().includes('table')) {
        alert(`⚠️ تنبيه هام لمتجر أم روح: جداول قاعدة بيانات Supabase غير منشأة بعد!\n\nيرجى الذهاب إلى لوحة تحكم Supabase الخاصة بكِ، ثم فتح (SQL Editor)، ونسخ محتويات ملف "supabase-schema.sql" بالكامل ولصقها هناك والنقر على (Run) لإنشاء الجداول وسياسات الأمان بنجاح أولاً، ثم إعادة محاولة الترحيل.`);
      }
      showToast(`❌ خطأ أثناء تشغيل الترحيل: ${errMsg}`);
    } finally {
      setIsMigratingSupabase(false);
    }
  };

  const handleCopySchema = () => {
    try {
      navigator.clipboard.writeText(SUPABASE_SCHEMA_SQL);
      showToast('📋 تم نسخ كود SQL لتهيئة الجداول بنجاح! يرجى لصقه وتشغيله في SQL Editor بـ Supabase.');
    } catch (err) {
      alert('فشل النسخ التلقائي. يرجى تظليل الملف supabase-schema.sql ونسخه يدوياً.');
    }
  };

  // Google Auth & Drive States
  const [googleUser, setGoogleUser] = useState<FirebaseUser | null>(null);
  const [googleToken, setGoogleToken] = useState<string | null>(null);
  const [showDomainModal, setShowDomainModal] = useState(false);
  const [authErrorType, setAuthErrorType] = useState<'unauthorized-domain' | 'network-request-failed'>('unauthorized-domain');

  useEffect(() => {
    const unsubscribe = initAuth(
      (gUser, token) => {
        setGoogleUser(gUser);
        setGoogleToken(token);
      },
      () => {
        setGoogleUser(null);
        setGoogleToken(null);
      }
    );
    return () => unsubscribe();
  }, []);

  const handleGoogleSignIn = async () => {
    try {
      await googleSignIn();
    } catch (err: any) {
      console.error('Google Sign In failed:', err);
      if (err?.code === 'auth/unauthorized-domain' || (err?.message && err.message.includes('unauthorized-domain'))) {
        setAuthErrorType('unauthorized-domain');
        setShowDomainModal(true);
      } else if (err?.code === 'auth/network-request-failed' || (err?.message && err.message.includes('network-request-failed'))) {
        setAuthErrorType('network-request-failed');
        setShowDomainModal(true);
      } else {
        alert(`فشل تسجيل الدخول: ${err?.message || err}`);
      }
    }
  };

  const handleGoogleLogout = async () => {
    try {
      await googleLogout();
    } catch (err) {
      console.error('Google Logout failed:', err);
    }
  };

  // Custom in-app Confirmation Modal state
  const [confirmModal, setConfirmModal] = useState<{
    title: string;
    message: string;
    onConfirm: () => void;
  } | null>(null);

  const askConfirmation = (title: string, message: string, onConfirm: () => void) => {
    setConfirmModal({
      title,
      message,
      onConfirm
    });
  };

  // Reload Database
  const reloadData = () => {
    setUsers(Database.getAllUsers());
    setCategories(Database.getCategories());
    setProducts(Database.getProducts());
    setOrders(Database.getOrders());
    setRecharges(Database.getRechargeRequests());
    setPhoneRequests(Database.getPhoneRequests());
    setAdvisor(Database.getAdvisorSettings());
    setOfferImages(Database.getOffersImages());
    setLocations(Database.getLocations());
    setAdminTickerTexts(Database.getTickerTexts());
    setContestants(Database.getContestants());
    setAppNotifications(Database.getAppNotifications());
    setArchivedEvents(Database.getArchivedEvents());
    setVoteLogs(Database.getVoteLogs());
    setBlockedDevices(Database.getBlockedDevices());
    setGiftsList(Database.getGifts());
  };

  const syncRealtimeData = async () => {
    if (isSupabaseConfigured()) {
      try {
        // Force sync all tables from Supabase/Firestore to local storage bypassing throttle
        await Database.syncFromFirestore(undefined, true);
        reloadData();
      } catch (err) {
        console.error("Realtime fetch sync failed:", err);
      }
    }
  };

  useEffect(() => {
    reloadData();
    
    // التحديث التلقائي الذاتي للبيانات كل 5 ثوانٍ لضمان عدم حاجة الإدارة لإعادة تشغيل التطبيق
    const interval = setInterval(() => {
      reloadData();
    }, 5000);
    
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured()) return;

    // Listen to orders table changes
    const ordersChannel = supabase!
      .channel('admin-orders-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders' },
        async (payload) => {
          console.log('Realtime change detected in orders:', payload);
          showToast('🔔 معاملة طلبات جديدة أو محدثة تم رصدها!');
          if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
          playNotificationSound();
          await syncRealtimeData();
        }
      )
      .subscribe();

    // Listen to recharges table changes
    const rechargesChannel = supabase!
      .channel('admin-recharges-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'recharges' },
        async (payload) => {
          console.log('Realtime change detected in recharges:', payload);
          showToast('💳 طلب شحن جديد أو تحديث حالة رصيد تم رصده!');
          if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
          playNotificationSound();
          await syncRealtimeData();
        }
      )
      .subscribe();

    // Listen to phone_requests table changes
    const phoneRequestsChannel = supabase!
      .channel('admin-phone-requests-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'phone_requests' },
        async (payload) => {
          console.log('Realtime change detected in phone_requests:', payload);
          showToast('🔑 طلب تفعيل جهاز أو تغيير هاتف جديد!');
          if (navigator.vibrate) navigator.vibrate([250, 100, 250]);
          playNotificationSound();
          await syncRealtimeData();
        }
      )
      .subscribe();

    // Listen to users table changes
    const usersChannel = supabase!
      .channel('admin-users-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'users' },
        async (payload) => {
          console.log('Realtime change detected in users:', payload);
          showToast('👤 تم رصد تسجيل عميل جديد أو تحديث بيانات!');
          await syncRealtimeData();
        }
      )
      .subscribe();

    return () => {
      supabase!.removeChannel(ordersChannel);
      supabase!.removeChannel(rechargesChannel);
      supabase!.removeChannel(phoneRequestsChannel);
      supabase!.removeChannel(usersChannel);
    };
  }, []);

  // Notification Toast Helper
  const [toastMessage, setToastMessage] = useState('');
  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 3000);
  };

  // ----------------------------------------------------
  // --- TAB 1: SETTINGS ---
  const [newAdminPass, setNewAdminPass] = useState(adminCode);
  const [workerPass, setWorkerPass] = useState(() => Database.getWorkerCode());
  const [advisorName, setAdvisorName] = useState(advisor.name);
  const [advisorTitle, setAdvisorTitle] = useState(advisor.title);
  const [advisorImg, setAdvisorImg] = useState(advisor.image);
  const [uploadingAdvisorImage, setUploadingAdvisorImage] = useState(false);

  const handleAdvisorImgUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingAdvisorImage(true);
    if (googleUser) {
      try {
        const driveUrl = await uploadFileToDrive(file, `advisor_${Date.now()}_${file.name}`);
        setAdvisorImg(driveUrl);
      } catch (err: any) {
        alert(err.message || 'فشل الرفع إلى جوجل درايف.');
      } finally {
        setUploadingAdvisorImage(false);
      }
    } else {
      const reader = new FileReader();
      reader.onloadend = () => {
        setAdvisorImg(reader.result as string);
        setUploadingAdvisorImage(false);
      };
      reader.readAsDataURL(file);
    }
  };

  const [manualOldPhone, setManualOldPhone] = useState('');
  const [manualNewPhone, setManualNewPhone] = useState('');

  // Load Admin Settings
  const adminSettingsObj = Database.getAdminSettings();
  const initialBankAccounts = adminSettingsObj.bankAccounts || [
    { currency: 'YER_NEW', bankName: 'الكريمي المميز (ريال يمني جديد)', accountNumber: '967739563915', accountName: 'متجر أم روح' },
    { currency: 'YER_OLD', bankName: 'الكريمي المميز (ريال يمني قديم)', accountNumber: '967739563915', accountName: 'متجر أم روح' },
    { currency: 'SAR', bankName: 'الكريمي المميز (ريال سعودي)', accountNumber: '967739563915', accountName: 'متجر أم روح' }
  ];
  const initialApkUrl = adminSettingsObj.androidDownloadUrl || 'https://archive.org/download/ruh-store/RuhStore.apk';

  const bankYenNew = initialBankAccounts.find(b => b.currency === 'YER_NEW') || initialBankAccounts[0];
  const bankYenOld = initialBankAccounts.find(b => b.currency === 'YER_OLD') || initialBankAccounts[0];
  const bankSar = initialBankAccounts.find(b => b.currency === 'SAR') || initialBankAccounts[0];

  const [bankNameYenNew, setBankNameYenNew] = useState(bankYenNew.bankName);
  const [bankAccYenNew, setBankAccYenNew] = useState(bankYenNew.accountNumber);
  const [bankHolderYenNew, setBankHolderYenNew] = useState(bankYenNew.accountName);

  const [bankNameYenOld, setBankNameYenOld] = useState(bankYenOld.bankName);
  const [bankAccYenOld, setBankAccYenOld] = useState(bankYenOld.accountNumber);
  const [bankHolderYenOld, setBankHolderYenOld] = useState(bankYenOld.accountName);

  const [bankNameSar, setBankNameSar] = useState(bankSar.bankName);
  const [bankAccSar, setBankAccSar] = useState(bankSar.accountNumber);
  const [bankHolderSar, setBankHolderSar] = useState(bankSar.accountName);

  const [androidApkUrl, setAndroidApkUrl] = useState(initialApkUrl);
  const [whatsappNumber, setWhatsappNumber] = useState(adminSettingsObj.whatsappNumber || '967739563915');
  const [currentAppUrl, setCurrentAppUrl] = useState(adminSettingsObj.currentAppUrl || '');

  const [kuraimiAccountName, setKuraimiAccountName] = useState(adminSettingsObj.kuraimiAccountName || 'أم روح');
  const [kuraimiAccountNumber, setKuraimiAccountNumber] = useState(adminSettingsObj.kuraimiAccountNumber || '967739563915');
  const [najmReceiverName, setNajmReceiverName] = useState(adminSettingsObj.najmReceiverName || 'روح أحمد علي');
  const [featuredSpeed, setFeaturedSpeed] = useState<number>(adminSettingsObj.featuredSpeed || 3);
  const [packageName, setPackageName] = useState(adminSettingsObj.packageName || 'com.ruh.store');
  const [sha256Fingerprint, setSha256Fingerprint] = useState(adminSettingsObj.sha256Fingerprint || '33:4B:9C:E3:6B:42:0E:64:1B:11:D3:FC:B5:72:0D:20:9B:6C:EE:80:C2:5E:28:FE:8B:D8:1A:1D:95:C7:E2:E8');

  // Exchange rates configuration
  const [yerOldFactor, setYerOldFactor] = useState(rates.yerOldFactor);
  const [sarFactor, setSarFactor] = useState(rates.sarFactor);

  const handleSaveGeneralSettings = (e: React.FormEvent) => {
    e.preventDefault();
    // 1. Save Admin settings (Passcode + Bank Accounts + APK Download URL + OTA App URL)
    const currentAdminSettings = Database.getAdminSettings();
    const finalPasscode = newAdminPass.trim() ? newAdminPass.trim() : currentAdminSettings.code;
    
    const updatedAdminSettings = {
      code: finalPasscode,
      workerCode: workerPass.trim(),
      bankAccounts: [
        { currency: 'YER_NEW' as Currency, bankName: bankNameYenNew, accountNumber: bankAccYenNew, accountName: bankHolderYenNew },
        { currency: 'YER_OLD' as Currency, bankName: bankNameYenOld, accountNumber: bankAccYenOld, accountName: bankHolderYenOld },
        { currency: 'SAR' as Currency, bankName: bankNameSar, accountNumber: bankAccSar, accountName: bankHolderSar }
      ],
      androidDownloadUrl: androidApkUrl.trim(),
      whatsappNumber: whatsappNumber.trim(),
      currentAppUrl: currentAppUrl.trim(),
      kuraimiAccountName: kuraimiAccountName.trim(),
      kuraimiAccountNumber: kuraimiAccountNumber.trim(),
      najmReceiverName: najmReceiverName.trim(),
      featuredSpeed: Number(featuredSpeed),
      packageName: packageName.trim(),
      sha256Fingerprint: sha256Fingerprint.trim(),
      googleBackupActive: typeof currentAdminSettings.googleBackupActive === 'boolean' ? currentAdminSettings.googleBackupActive : Database.isBackupMode(),
      googleScriptUrl: currentAdminSettings.googleScriptUrl || Database.getGoogleScriptUrl()
    };
    
    Database.saveAdminSettings(updatedAdminSettings);
    if (newAdminPass.trim()) {
      onAdminCodeUpdate(newAdminPass.trim());
    }

    // 2. Advisor
    const finalAdvisorImg = getDirectImageUrl(advisorImg.trim());
    const updatedAdvisor = { image: finalAdvisorImg, name: advisorName, title: advisorTitle };
    Database.saveAdvisorSettings(updatedAdvisor);
    onAdvisorUpdate(updatedAdvisor);
    setAdvisorImg(finalAdvisorImg);
    
    // 3. Exchange rates
    const updatedRates = { yerOldFactor: Number(yerOldFactor), sarFactor: Number(sarFactor) };
    Database.saveExchangeRate(updatedRates);
    onRatesUpdate(updatedRates);

    // 4. Save News Ticker texts
    Database.saveTickerTexts(adminTickerTexts);

    showToast('تم حفظ الإعدادات العامة والحسابات البنكية فوراً! ✅');
    reloadData();
  };

  const handleManualPhoneSwap = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualOldPhone || !manualNewPhone) return;

    // Search for user
    const list = Database.getAllUsers();
    const userToChange = list.find(u => u.phone === manualOldPhone);
    if (userToChange) {
      userToChange.phone = manualNewPhone;
      localStorage.setItem('amrwh_all_users_list', JSON.stringify(list));
      
      // Update active user if same
      const active = Database.getUser();
      if (active.phone === manualOldPhone) {
        active.phone = manualNewPhone;
        Database.saveUser(active);
      }
      
      setManualOldPhone('');
      setManualNewPhone('');
      showToast('تم استبدال رقم هاتف المستخدم في قاعدة البيانات بنجاح! 📱');
      reloadData();
    } else {
      alert('لم يتم العثور على أي مستخدم بالرقم القديم المدخل!');
    }
  };

  // --- EVENT & VOTING MANAGEMENT ACTIONS ---
  const handleSaveEventSettings = () => {
    const currentAdminSettings = Database.getAdminSettings();
    const updatedSettings = {
      ...currentAdminSettings,
      isEventActive,
      eventImageUrl: eventImageUrl.trim(),
      eventTitle: eventTitle.trim(),
      eventDescription: eventDescription.trim(),
      eventWinnerPrize: eventWinnerPrize.trim()
    };
    Database.saveAdminSettings(updatedSettings);
    showToast('🏆 تم حفظ إعدادات الفعالية والمسابقة بنجاح!');
  };

  const handleContestantImgUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingContestantImage(true);
    if (googleUser) {
      try {
        const driveUrl = await uploadFileToDrive(file, `contestant_${Date.now()}_${file.name}`);
        setNewContestantImageUrl(driveUrl);
        showToast('✓ تم رفع صورة المتسابق بنجاح!');
      } catch (err: any) {
        alert(err.message || 'فشل الرفع إلى جوجل درايف.');
      } finally {
        setUploadingContestantImage(false);
      }
    } else {
      const reader = new FileReader();
      reader.onloadend = () => {
         setNewContestantImageUrl(reader.result as string);
         setUploadingContestantImage(false);
         showToast('✓ تم معالجة الصورة بنجاح!');
      };
      reader.readAsDataURL(file);
    }
  };

  const handleAddContestant = () => {
    if (!newContestantName.trim() || !newContestantPhone.trim()) {
      showToast('⚠️ يرجى إدخال اسم ورقم هاتف المتسابق!');
      return;
    }
    const result = Database.addContestant(newContestantName.trim(), newContestantPhone.trim(), undefined, undefined, newContestantImageUrl);
    if (result.success) {
      showToast('✓ تم إضافة المتسابق بنجاح!');
      setNewContestantName('');
      setNewContestantPhone('');
      setNewContestantImageUrl('');
      reloadData();
    } else {
      showToast(`❌ ${result.error}`);
    }
  };

  const handleManualVote = (contestantId: string) => {
    const mockDevId = 'ADMIN-VOTE-' + Math.floor(Math.random() * 1000000);
    const res = Database.voteForContestant(contestantId, 'أدمن الإدارة', mockDevId);
    if (res.success) {
      showToast('✓ تم إضافة صوت للمتسابق بنجاح!');
      reloadData();
    } else {
      showToast(`❌ ${res.error}`);
    }
  };

  const handleDeleteContestant = (contestantId: string) => {
    askConfirmation(
      'حذف متسابق',
      'هل أنتِ متأكدة من حذف هذا المتسابق؟ سيتم حذف كافة أصواته نهائياً!',
      () => {
        const result = Database.deleteContestant(contestantId);
        if (result.success) {
          showToast('✓ تم حذف المتسابق بنجاح!');
          reloadData();
        } else {
          showToast(`❌ ${result.error}`);
        }
      }
    );
  };

  const handleClearAllEventData = () => {
    askConfirmation(
      'تفريغ وتصفير الفعالية',
      '⚠️ تحذير خطير: هل أنتِ متأكدة من تصفير كافة بيانات الفعالية؟ سيتم حذف جميع المتسابقين وكافة الأصوات نهائياً ولا يمكن التراجع!',
      () => {
        Database.clearAllEventData();
        showToast('🗑️ تم تصفير كافة بيانات الفعالية والتصويت بنجاح!');
        reloadData();
      }
    );
  };

  // --- BLOCKED DEVICES / ANTI-FRAUD & UID MIGRATION HANDLERS ---
  const handleBlockDevice = (deviceId: string) => {
    if (!deviceId.trim()) return;
    Database.addBlockedDevice(deviceId.trim());
    setBlockedDevices(Database.getBlockedDevices());
    showToast('✓ تم إضافة بصمة الجهاز إلى قائمة الحظر بنجاح! 🚫');
    setManualBlockInput('');
  };

  const handleUnblockDevice = (deviceId: string) => {
    Database.removeBlockedDevice(deviceId);
    setBlockedDevices(Database.getBlockedDevices());
    showToast('✓ تم إزالة الحظر عن الجهاز بنجاح! 🔓');
  };

  const handleMigrateUserIds7To9 = async () => {
    setIsMigratingUserIds(true);
    setMigrationUserResult(null);
    try {
      const res = await Database.migrateUserIdsFrom7To9();
      if (res.migratedCount > 0) {
        setMigrationUserResult(`تمت عملية هجرة وترقية معرّفات المستخدمين بنجاح! تم ترقية وتحديث (${res.migratedCount}) مستخدم مع تحديث سجلاتهم المرتبطة.`);
        reloadData();
      } else {
        setMigrationUserResult('لم يتم العثور على مستخدمين بمعرفات قديمة تبدأ بالرقم 7. كافة الحسابات ممتثلة وتستخدم معرّفات تبدأ بالرقم 9 بنجاح! 🌸');
      }
    } catch (err: any) {
      setMigrationUserResult(`حدث خطأ أثناء عملية ترحيل المعرفات: ${err?.message || String(err)}`);
    } finally {
      setIsMigratingUserIds(false);
    }
  };

  const handlePrintContestants = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      showToast('⚠️ يرجى السماح بالنوافذ المنبثقة للطباعة!');
      return;
    }
    const html = `
      <html>
        <head>
          <title>تقرير متسابقين وأصوات مسابقة أم روح</title>
          <style>
            body { font-family: sans-serif; direction: rtl; padding: 20px; text-align: right; }
            h1 { color: #854d0e; border-bottom: 2px solid #fef08a; padding-bottom: 10px; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { border: 1px solid #e2e8f0; padding: 12px; text-align: right; }
            th { background-color: #fef08a; color: #854d0e; }
            tr:nth-child(even) { background-color: #f8fafc; }
            .badge { display: inline-block; padding: 4px 8px; font-size: 11px; font-weight: bold; border-radius: 4px; background-color: #fef08a; color: #854d0e; }
          </style>
        </head>
        <body>
          <h1>تقرير نتائج مسابقة وتصويت متجر أم روح الكبرى 🏆🌸</h1>
          <p>تاريخ استخراج التقرير: ${new Date().toLocaleDateString('ar-YE')} - ${new Date().toLocaleTimeString('ar-YE')}</p>
          <table>
            <thead>
              <tr>
                <th>اسم المتسابق</th>
                <th>رقم الهاتف</th>
                <th>عدد الأصوات الإجمالي 📈</th>
                <th>الرابط الخاص بالتصويت 🔗</th>
              </tr>
            </thead>
            <tbody>
              ${contestants.map(c => `
                <tr>
                  <td><strong>${c.name}</strong></td>
                  <td>${c.phone}</td>
                  <td><span class="badge">${c.votes} صوت</span></td>
                  <td dir="ltr">https://um-rouh-store.vercel.app/?vote=${c.id}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          <script>window.print();</script>
        </body>
      </html>
    `;
    printWindow.document.write(html);
    printWindow.document.close();
  };

  // --- ARCHIVED EVENTS (EVENT HISTORY) ACTIONS ---
  const handleArchivedEventImgUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingArchivedEventImg(true);
    if (googleUser) {
      try {
        const driveUrl = await uploadFileToDrive(file, `event_proof_${Date.now()}_${file.name}`);
        setNewArchivedEventImageUrl(driveUrl);
        showToast('✓ تم رفع صورة توثيق الفعالية بنجاح!');
      } catch (err: any) {
        alert(err.message || 'فشل الرفع إلى جوجل درايف.');
      } finally {
        setUploadingArchivedEventImg(false);
      }
    } else {
      const reader = new FileReader();
      reader.onloadend = () => {
         setNewArchivedEventImageUrl(reader.result as string);
         setUploadingArchivedEventImg(false);
         showToast('✓ تم معالجة الصورة بنجاح!');
      };
      reader.readAsDataURL(file);
    }
  };

  const handleAddArchivedEvent = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newArchivedEventName.trim() || !newArchivedEventWinner.trim()) {
      showToast('⚠️ يرجى كتابة اسم الفعالية واسم الفائز!');
      return;
    }

    const newEv: ArchivedEvent = {
      id: 'archived_ev_' + Date.now(),
      name: newArchivedEventName.trim(),
      date: new Date().toISOString().substring(0, 10),
      winnerName: newArchivedEventWinner.trim(),
      giftAmount: newArchivedEventAmount,
      giftCurrency: newArchivedEventCurrency,
      deliveryProofImage: newArchivedEventImageUrl,
      showInSlider: newArchivedEventShowInSlider
    };

    Database.saveArchivedEvent(newEv);
    showToast('✓ تم حفظ الحدث المؤرشف بنجاح وتحديث القائمة فوراً!');
    
    // Clear Form
    setNewArchivedEventName('');
    setNewArchivedEventWinner('');
    setNewArchivedEventAmount(0);
    setNewArchivedEventImageUrl('');
    
    reloadData();
  };

  const handleDeleteArchivedEvent = (id: string) => {
    askConfirmation(
      'حذف حدث مؤرشف',
      'هل أنتِ متأكدة من حذف هذا الحدث المؤرشف من تاريخ الفعاليات؟',
      () => {
        Database.deleteArchivedEvent(id);
        showToast('✓ تم حذف الحدث المؤرشف بنجاح وتحديث القائمة فوراً!');
        reloadData();
      }
    );
  };

  // --- APP NOTIFICATIONS ACTIONS ---
  const handleNotifImgUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingNotifImg(true);
    if (googleUser) {
      try {
        const driveUrl = await uploadFileToDrive(file, `notif_${Date.now()}_${file.name}`);
        setNewNotifImageUrl(driveUrl);
        showToast('✓ تم رفع صورة الإشعار بنجاح!');
      } catch (err: any) {
        alert(err.message || 'فشل الرفع إلى جوجل درايف.');
      } finally {
        setUploadingNotifImg(false);
      }
    } else {
      const reader = new FileReader();
      reader.onloadend = () => {
         setNewNotifImageUrl(reader.result as string);
         setUploadingNotifImg(false);
         showToast('✓ تم معالجة الصورة بنجاح!');
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSaveAppNotification = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNotifTitle.trim() || !newNotifMessage.trim()) {
      showToast('⚠️ يرجى تعبئة عنوان ومحتوى الإشعار!');
      return;
    }

    const expiryAtDate = new Date(Date.now() + newNotifDurationHours * 60 * 60 * 1000).toISOString();

    const notif: AppNotification = {
      id: editingNotifId || 'notif_' + Date.now(),
      title: newNotifTitle.trim(),
      message: newNotifMessage.trim(),
      createdAt: new Date().toISOString(),
      expiryAt: expiryAtDate,
      image: newNotifImageUrl || undefined,
      productId: newNotifProductId.trim() || undefined,
      frequency: 1,
      durationHours: newNotifDurationHours
    };

    Database.saveAppNotification(notif);
    showToast(editingNotifId ? '✓ تم تعديل وحفظ الإشعار بنجاح وتحديث القائمة فوراً!' : '✓ تم إنشاء وإرسال الإشعار لجميع الأجهزة فوراً!');
    
    // Clear form & reset state
    setNewNotifTitle('');
    setNewNotifMessage('');
    setNewNotifImageUrl('');
    setNewNotifProductId('');
    setNewNotifDurationHours(48);
    setEditingNotifId(null);
    
    reloadData();
  };

  const handleEditAppNotification = (notif: AppNotification) => {
    setEditingNotifId(notif.id);
    setNewNotifTitle(notif.title);
    setNewNotifMessage(notif.message);
    setNewNotifImageUrl(notif.image || '');
    setNewNotifProductId(notif.productId || '');
    setNewNotifDurationHours(notif.durationHours || 48);
    showToast('📝 الإشعار جاهز للتعديل الآن في النموذج بالأعلى!');
  };

  const handleDeleteAppNotification = (id: string) => {
    askConfirmation(
      'حذف إشعار',
      'هل أنتِ متأكدة من حذف هذا الإشعار؟ سيختفي من قائمة إشعارات العملاء فوراً!',
      () => {
        Database.deleteAppNotification(id);
        showToast('✓ تم حذف الإشعار بنجاح وتحديث القائمة فوراً!');
        reloadData();
      }
    );
  };

  // --- LOCATIONS TAB STATE & ACTIONS ---
  const [newLocName, setNewLocName] = useState('');
  const [newLocFee, setNewLocFee] = useState(1000);
  const [selectedClientAddress, setSelectedClientAddress] = useState('');

  const handleSaveLocation = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLocName.trim()) return;
    const newLoc: DeliveryLocation = {
      id: 'LOC_' + Date.now(),
      name: newLocName.trim(),
      deliveryFee: Number(newLocFee)
    };
    Database.saveLocation(newLoc);
    showToast('تم حفظ العنوان ورسوم التوصيل بنجاح! 📍');
    setNewLocName('');
    setNewLocFee(1000);
    setSelectedClientAddress('');
    reloadData();
  };

  const handleDeleteLocation = (id: string) => {
    askConfirmation(
      'تأكيد حذف العنوان 📍',
      'هل أنت متأكد من حذف هذا العنوان ورسوم توصيله؟',
      () => {
        Database.deleteLocation(id);
        showToast('تم حذف العنوان بنجاح! 🗑️');
        reloadData();
      }
    );
  };

  const handleApprovePhoneReq = (reqId: string) => {
    Database.approvePhoneRequest(reqId);
    showToast('تمت الموافقة وتعديل بيانات العميل بنجاح! ✅');
    reloadData();
  };

  const handleRejectPhoneReq = (reqId: string) => {
    Database.rejectPhoneRequest(reqId);
    showToast('تم رفض طلب تعديل البيانات وإرسال إشعار للعميل ❌');
    reloadData();
  };

  // ----------------------------------------------------
  // --- TAB 2: ADD CATEGORIES ---
  const [newCatName, setNewCatName] = useState('');
  const [newCatCode, setNewCatCode] = useState('');
  const [newCatImage, setNewCatImage] = useState('');
  const [newCatSortOrder, setNewCatSortOrder] = useState<string>('0');
  const [newCatIsHidden, setNewCatIsHidden] = useState<boolean>(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);

  const handleAddCategorySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatName || !newCatCode || !newCatImage) return;

    const directImage = getDirectImageUrl(newCatImage);
    const orderNum = Number(newCatSortOrder) || 0;

    if (editingCategory) {
      Database.saveCategory({
        ...editingCategory,
        name: newCatName.trim(),
        image: directImage,
        sortOrder: orderNum,
        isHidden: newCatIsHidden
      });
      setEditingCategory(null);
      showToast('تم تعديل الفئة بنجاح! 📂');
    } else {
      Database.saveCategory({
        id: newCatCode.trim().toUpperCase(),
        name: newCatName.trim(),
        image: directImage,
        productCount: 0,
        sortOrder: orderNum,
        isHidden: newCatIsHidden
      });
      showToast('تمت إضافة فئة جديدة بنجاح! 📂');
    }

    setNewCatName('');
    setNewCatCode('');
    setNewCatImage('');
    setNewCatSortOrder('0');
    setNewCatIsHidden(false);
    reloadData();
  };

  const handleEditCategoryClick = (cat: Category) => {
    setEditingCategory(cat);
    setNewCatName(cat.name);
    setNewCatCode(cat.id);
    setNewCatImage(cat.image);
    setNewCatSortOrder(String(cat.sortOrder || 0));
    setNewCatIsHidden(!!cat.isHidden);
  };

  const handleCancelCategoryEdit = () => {
    setEditingCategory(null);
    setNewCatName('');
    setNewCatCode('');
    setNewCatImage('');
    setNewCatSortOrder('0');
    setNewCatIsHidden(false);
  };

  const handleDeleteCategory = (categoryId: string) => {
    const associatedProducts = products.filter(p => p.categoryId === categoryId);
    if (associatedProducts.length > 0) {
      askConfirmation(
        'تأكيد حذف الفئة مع منتجاتها ⚠️',
        `تحذير: هذه الفئة تحتوي على (${associatedProducts.length}) من المنتجات المرتبطة بها. هل أنت متأكد من حذف هذه الفئة وجميع منتجاتها نهائياً؟`,
        () => {
          associatedProducts.forEach(p => Database.deleteProduct(p.id));
          Database.deleteCategory(categoryId);
          showToast('تم حذف الفئة ومنتجاتها بنجاح! 🗑️');
          reloadData();
        }
      );
    } else {
      askConfirmation(
        'تأكيد حذف الفئة 📂',
        'هل أنت متأكد من حذف هذه الفئة نهائياً؟',
        () => {
          Database.deleteCategory(categoryId);
          showToast('تم حذف الفئة بنجاح! 🗑️');
          reloadData();
        }
      );
    }
  };

  // ----------------------------------------------------
  // --- TAB 3: ADD PRODUCTS ---
  const [prodCatId, setProdCatId] = useState('');
  const [prodSubCatIds, setProdSubCatIds] = useState<string[]>([]);
  const [prodName, setProdName] = useState('');
  const [prodCode, setProdCode] = useState('');
  const [prodDesc, setProdDesc] = useState('');
  const [prodPrice, setProdPrice] = useState<number>(0);
  const [prodOnOffer, setProdOnOffer] = useState(false);
  const [prodOfferPrice, setProdOfferPrice] = useState<number>(0);
  const [prodIsFeatured, setProdIsFeatured] = useState(false);
  const [prodImages, setProdImages] = useState<string[]>([]);
  const [newImageUrl, setNewImageUrl] = useState('');
  const [uploadingProdImage, setUploadingProdImage] = useState(false);
  const [adminProdSearch, setAdminProdSearch] = useState('');

  // Available attributes checkboxes
  const [activeProperties, setActiveProperties] = useState<Record<string, boolean>>({
    'الوحدة': false,
    'الطول': false,
    'العرض': false,
    'الحجم': false,
    'المقاس': false,
    'اللون': false,
    'العمر': false
  });

  // Dynamic inputs for selected attributes values
  const [propertiesValues, setPropertiesValues] = useState<Record<string, string[]>>({
    'الوحدة': [''],
    'الطول': [''],
    'العرض': [''],
    'الحجم': [''],
    'المقاس': [''],
    'اللون': [''],
    'العمر': ['']
  });

  const handleAddValueToProp = (prop: string) => {
    setPropertiesValues(prev => ({
      ...prev,
      [prop]: [...prev[prop], '']
    }));
  };

  const handleRemoveValueFromProp = (prop: string, idx: number) => {
    setPropertiesValues(prev => ({
      ...prev,
      [prop]: prev[prop].filter((_, i) => i !== idx)
    }));
  };

  const handlePropValueChange = (prop: string, idx: number, val: string) => {
    const list = [...propertiesValues[prop]];
    list[idx] = val;
    setPropertiesValues(prev => ({
      ...prev,
      [prop]: list
    }));
  };

  const handleProductImgUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingProdImage(true);
    if (googleUser) {
      try {
        const driveUrl = await uploadFileToDrive(file, `product_${Date.now()}_${file.name}`);
        setProdImages(prev => [...prev, driveUrl]);
      } catch (err: any) {
        alert(err.message || 'فشل الرفع إلى جوجل درايف.');
      } finally {
        setUploadingProdImage(false);
      }
    } else {
      const reader = new FileReader();
      reader.onloadend = () => {
        setProdImages(prev => [...prev, reader.result as string]);
        setUploadingProdImage(false);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleAddProductImgUrl = () => {
    if (!newImageUrl.trim()) return;
    const directUrl = getDirectImageUrl(newImageUrl.trim());
    setProdImages(prev => [...prev, directUrl]);
    setNewImageUrl('');
  };

  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  const handleEditProductClick = (p: Product) => {
    setEditingProduct(p);
    setProdCatId(p.categoryId);
    setProdSubCatIds(p.subCategoryIds || []);
    setProdName(p.name);
    setProdCode(p.code);
    setProdPrice(p.priceYERNew);
    setProdOnOffer(p.isOnOffer);
    setProdOfferPrice(p.offerPriceNew || 0);
    setProdIsFeatured(!!p.isFeatured);
    setProdDesc(p.description);
    setProdImages(p.images);

    const newActive: Record<string, boolean> = {
      'الوحدة': false,
      'الطول': false,
      'العرض': false,
      'الحجم': false,
      'المقاس': false,
      'اللون': false,
      'العمر': false
    };
    const newVals: Record<string, string[]> = {
      'الوحدة': [''],
      'الطول': [''],
      'العرض': [''],
      'الحجم': [''],
      'المقاس': [''],
      'اللون': [''],
      'العمر': ['']
    };

    p.properties.forEach(prop => {
      if (prop.name in newActive) {
        newActive[prop.name] = true;
        newVals[prop.name] = prop.options.length > 0 ? prop.options : [''];
      }
    });

    setActiveProperties(newActive);
    setPropertiesValues(newVals);
    
    // Scroll the admin panel content up to the form
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCancelProductEdit = () => {
    setEditingProduct(null);
    setProdCatId('');
    setProdSubCatIds([]);
    setProdName('');
    setProdCode('');
    setProdPrice(0);
    setProdOnOffer(false);
    setProdOfferPrice(0);
    setProdIsFeatured(false);
    setProdDesc('');
    setProdImages([]);
    setActiveProperties({
      'الوحدة': false,
      'الطول': false,
      'العرض': false,
      'الحجم': false,
      'المقاس': false,
      'اللون': false,
      'العمر': false
    });
    setPropertiesValues({
      'الوحدة': [''],
      'الطول': [''],
      'العرض': [''],
      'الحجم': [''],
      'المقاس': [''],
      'اللون': [''],
      'العمر': ['']
    });
  };

  const handleAddProductSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!prodCatId || !prodName || !prodCode || prodPrice <= 0) {
      alert('يرجى تعبئة كافة الحقول الأساسية وتحديد الفئة!');
      return;
    }

    const matchedCat = categories.find(c => c.id === prodCatId);
    
    // Build active properties
    const finalProperties = Object.entries(activeProperties)
      .filter(([_, isActive]) => isActive)
      .map(([propName]) => {
        // filter out empty values
        const opts = propertiesValues[propName].map(v => v.trim()).filter(v => v !== '');
        return {
          name: propName,
          options: opts.length > 0 ? opts : ['افتراضي']
        };
      });

    const finalImages = (prodImages.length > 0 ? prodImages : ['https://images.unsplash.com/photo-1546213290-e1b7610339e5?auto=format&fit=crop&q=80&w=600'])
      .map(img => getDirectImageUrl(img));

    const savedProd: Product = {
      id: editingProduct ? editingProduct.id : 'PROD_' + Date.now(),
      code: prodCode.trim().toUpperCase(),
      name: prodName.trim(),
      categoryId: prodCatId,
      categoryName: matchedCat ? matchedCat.name : '',
      subCategoryIds: prodSubCatIds,
      description: prodDesc.trim(),
      priceYERNew: Number(prodPrice),
      images: finalImages,
      properties: finalProperties,
      isOnOffer: prodOnOffer,
      offerPriceNew: prodOnOffer ? Number(prodOfferPrice) : undefined,
      offerOldPrice: prodOnOffer ? Number(prodPrice) : undefined,
      rating: editingProduct ? editingProduct.rating : 5.0,
      isFeatured: prodIsFeatured
    };

    Database.saveProduct(savedProd);

    // Send a system-wide announcement notification if this is a newly created product
    if (!editingProduct) {
      Database.addNotification({
        id: 'NOTIF_NEW_PROD_' + savedProd.id + '_' + Date.now(),
        userId: '', // public broadcast
        title: `متجر أم روح 🌸 - صنف جديد: ${savedProd.name}`,
        message: `💰 السعر: ${savedProd.priceYERNew} ر.ي ج\n${savedProd.description ? (savedProd.description.length > 80 ? savedProd.description.substring(0, 80) + '...' : savedProd.description) : 'تصفحي الصنف المميّز الجديد لدينا واطلبيه بأفضل سعر ممكن فوراً!'} (انقري لمشاهدة التفاصيل)`,
        createdAt: new Date().toISOString(),
        isRead: false,
        image: savedProd.images && savedProd.images[0] ? savedProd.images[0] : undefined,
        productId: savedProd.id
      });
    }

    setEditingProduct(null);

    // Reset Form
    setProdSubCatIds([]);
    setProdName('');
    setProdCode('');
    setProdDesc('');
    setProdPrice(0);
    setProdOnOffer(false);
    setProdOfferPrice(0);
    setProdIsFeatured(false);
    setProdImages([]);
    setActiveProperties({
      'الوحدة': false,
      'الطول': false,
      'العرض': false,
      'الحجم': false,
      'المقاس': false,
      'اللون': false,
      'العمر': false
    });
    setPropertiesValues({
      'الوحدة': [''],
      'الطول': [''],
      'العرض': [''],
      'الحجم': [''],
      'المقاس': [''],
      'اللون': [''],
      'العمر': ['']
    });

    showToast('تم حفظ وإدراج الصنف بنجاح! 🛍️');
    reloadData();
  };

  // Delete product
  const handleDeleteProduct = (id: string) => {
    askConfirmation(
      'تأكيد حذف الصنف 🛍️',
      'هل أنت متأكد من حذف هذا المنتج نهائياً من المتجر؟',
      () => {
        Database.deleteProduct(id);
        showToast('تم حذف المنتج بنجاح.');
        reloadData();
      }
    );
  };

  // ----------------------------------------------------
  // --- TAB 4: OFFERS MANAGER ---
  const [selectedOfferProdId, setSelectedOfferProdId] = useState('');
  const [offerPromoPrice, setOfferPromoPrice] = useState<number>(0);
  const [newOfferBanner, setNewOfferBanner] = useState('');

  const handleUpdateOfferSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOfferProdId) return;

    const prod = products.find(p => p.id === selectedOfferProdId);
    if (prod) {
      prod.isOnOffer = true;
      prod.offerPriceNew = Number(offerPromoPrice);
      prod.offerOldPrice = prod.priceYERNew;
      Database.saveProduct(prod);

      // Add image to automated carousel offers slider if provided
      if (newOfferBanner.trim()) {
        const carousel = Database.getOffersImages();
        carousel.unshift(getDirectImageUrl(newOfferBanner.trim()));
        Database.saveOffersImages(carousel);
        setNewOfferBanner('');
      }

      setSelectedOfferProdId('');
      setOfferPromoPrice(0);
      showToast('تم ترقية الصنف لعرض ترويجي وتحديث السلايدر بنجاح! 🏷️');
      reloadData();
    }
  };

  const handleRemoveOfferBanner = (bannerUrl: string) => {
    const list = offerImages.filter(img => img !== bannerUrl);
    Database.saveOffersImages(list);
    showToast('تم إزالة صورة العرض من السلايدر التلقائي.');
    reloadData();
  };

  // ----------------------------------------------------
  // --- TAB 5: USERS DATABASE PRINT & MANAGE ---
  const [userAddressFilter, setUserAddressFilter] = useState('ALL');
  const [userSearchQuery, setUserSearchQuery] = useState('');

  // Report generation modal state
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportTargetUser, setReportTargetUser] = useState<User | null>(null); // null means collective report
  const [reportType, setReportType] = useState<'recharges' | 'new_orders' | 'received_orders' | 'user_data' | 'comprehensive'>('comprehensive');

  // List unique addresses from userbase
  const uniqueAddresses = Array.from(new Set(users.map(u => u.address.split('-')[0].trim()).filter(Boolean)));

  const filteredUsers = users.filter(u => {
    const matchesAddress = userAddressFilter === 'ALL' || u.address.toLowerCase().includes(userAddressFilter.toLowerCase());
    const matchesSearch = u.name.toLowerCase().includes(userSearchQuery.toLowerCase()) || u.phone.includes(userSearchQuery);
    return matchesAddress && matchesSearch;
  });

  // Non-blocking print helper using an invisible iframe
  const printHtmlWithIframe = (htmlContent: string) => {
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);
    
    const doc = iframe.contentWindow?.document || iframe.contentDocument;
    if (doc) {
      doc.open();
      doc.write(htmlContent);
      doc.close();
      
      // Give assets some time to render
      setTimeout(() => {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
        setTimeout(() => {
          document.body.removeChild(iframe);
        }, 1000);
      }, 500);
    }
  };

  const toggleUserSelection = (userId: string) => {
    setSelectedUserIds(prev => 
      prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
    );
  };

  const toggleSelectAllUsers = () => {
    const allFilteredIds = filteredUsers.map(u => u.id);
    const isAllSelected = allFilteredIds.every(id => selectedUserIds.includes(id));
    if (isAllSelected) {
      setSelectedUserIds(prev => prev.filter(id => !allFilteredIds.includes(id)));
    } else {
      setSelectedUserIds(prev => Array.from(new Set([...prev, ...allFilteredIds])));
    }
  };

  const handleBulkDeleteSelected = () => {
    if (selectedUserIds.length === 0) {
      showToast('⚠️ يرجى تحديد عميل واحد على الأقل أولاً!');
      return;
    }
    askConfirmation(
      'تأكيد حذف العملاء المحددين نهائياً 🚨',
      `هل أنتِ متأكدة من حذف جميع العملاء المحددين (${selectedUserIds.length} عملاء) نهائياً من المتجر سحابياً مع مسح كافة الأرصدة، المحافظ، الطلبات، المتسابقين، بصمات الأجهزة، وأصوات التصويت الخاصة بهم؟ هذا الإجراء فوري ومصيري ولا يمكن التراجع عنه!`,
      () => {
        selectedUserIds.forEach(id => {
          Database.deleteUser(id);
        });
        showToast(`🎉 تم حذف ${selectedUserIds.length} مستخدمين مع كامل بياناتهم وبصمات أجهزتهم بنجاح.`);
        setSelectedUserIds([]);
        reloadData();
      }
    );
  };

  const handleDeleteAllUsers = () => {
    if (users.length === 0) {
      showToast('⚠️ لا يوجد أي مستخدمين مسجلين في قاعدة البيانات لحذفهم!');
      return;
    }
    askConfirmation(
      '⚠️ تحذير شديد: حذف كافة العملاء والمستخدمين! 🚨',
      `هل أنتِ متأكدة من حذف جميع العملاء والمستخدمين المسجلين في المتجر (${users.length} مستخدم) بشكل كامل ونهائي؟ هذا الإجراء سيقوم بمسح كافة الأرصدة، المحافظ، الطلبات، المتسابقين، بصمات الأجهزة، وسجلات وأصوات التصويت نهائياً!`,
      () => {
        users.forEach(u => {
          Database.deleteUser(u.id);
        });
        showToast('🔥 تم مسح وتصفير قاعدة بيانات العملاء بالكامل وبصمات أجهزتهم وسجلاتهم بنجاح!');
        setSelectedUserIds([]);
        reloadData();
      }
    );
  };

  const handlePrintUsers = () => {
    const printContent = document.getElementById('print-users-area')?.innerHTML;
    if (!printContent) return;
    
    const reportHtml = `
      <div dir="rtl" style="font-family: system-ui, sans-serif; padding: 25px; color: #1e293b;">
        <h1 style="text-align: center; color: #78350f; font-weight: 900; margin-bottom: 5px;">تقرير قاعدة بيانات مستخدمي متجر أم روح 🌸</h1>
        <p style="text-align: center; font-size: 11px; color: #64748b; margin-top: 0;">تاريخ التصدير: ${new Date().toLocaleDateString('ar-YE')}</p>
        <hr style="border-color: #f59e0b; margin-bottom: 20px;" />
        ${printContent}
      </div>
    `;
    printHtmlWithIframe(reportHtml);
  };

  // Master PDF/Report generator
  const handleGeneratePdfReport = (targetUser: User | null, type: 'recharges' | 'new_orders' | 'received_orders' | 'user_data' | 'comprehensive') => {
    let rawList = targetUser ? [targetUser] : filteredUsers;
    
    // For bulk reports, filter list to only contain active customers for the report scope to make it elegant and professional
    if (!targetUser) {
      if (type === 'new_orders') {
        rawList = filteredUsers.filter(u => orders.some(o => o.userId === u.id && o.status === 'pending'));
      } else if (type === 'received_orders') {
        rawList = filteredUsers.filter(u => orders.some(o => o.userId === u.id && o.status === 'completed'));
      } else if (type === 'recharges') {
        rawList = filteredUsers.filter(u => recharges.some(r => r.userId === u.id));
      }
    }

    // Sort the target customers alphabetically by name
    const targetUsersList = [...rawList].sort((a, b) => a.name.localeCompare(b.name, 'ar'));
    
    let reportTitle = '';
    switch (type) {
      case 'recharges':
        reportTitle = 'تقرير عمليات شحن وأرصدة المحفظة 💳';
        break;
      case 'new_orders':
        reportTitle = 'تقرير طلبات التوصيل الجديدة المعلقة ⏳';
        break;
      case 'received_orders':
        reportTitle = 'تقرير الطلبات المستلمة والمكتملة ✅';
        break;
      case 'user_data':
        reportTitle = 'تقرير البيانات الشخصية وتفاصيل الحسابات 👤';
        break;
      case 'comprehensive':
        reportTitle = 'التقرير الشامل والتدقيق المحاسبي 📊';
        break;
    }

    if (targetUser) {
      reportTitle += ` - للعميلة: ${targetUser.name}`;
    } else {
      reportTitle += ' - تقرير مجمع لعملاء المتجر مرتب حسب اسم العميل';
    }

    let reportHtml = `
      <div dir="rtl" style="font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 30px; color: #1e293b; background: #fff;">
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 4px double #d97706; padding-bottom: 12px; margin-bottom: 25px;">
          <div>
            <h1 style="color: #78350f; margin: 0; font-size: 24px; font-weight: 900;">مَتْجَرُ أُمِّ رُوْح 🌸</h1>
            <p style="font-size: 11px; margin: 4px 0 0 0; color: #475569; font-weight: bold;">للأدوات المنزلية والملابس والألعاب ومستحضرات التجميل</p>
          </div>
          <div style="text-align: left; font-size: 11px; color: #475569;">
            <p style="margin: 0; font-weight: bold;"><b>مسمى التقرير:</b> ${reportTitle}</p>
            <p style="margin: 4px 0 0 0; font-weight: bold;"><b>تاريخ التصدير:</b> ${new Date().toLocaleDateString('ar-YE')} | ${new Date().toLocaleTimeString('ar-YE')}</p>
          </div>
        </div>
    `;

    targetUsersList.forEach((u, idx) => {
      // Use clean page breaks for print rendering so each client's report starts on a new page
      const pageBreakStyle = idx > 0 ? 'page-break-before: always; border-top: 3px dashed #d97706; padding-top: 30px; margin-top: 30px;' : '';
      
      reportHtml += `
        <div style="${pageBreakStyle}">
          <!-- Client Card Header -->
          <div style="background: #fffcf0; border: 1px solid #fef3c7; padding: 18px; border-radius: 16px; margin-bottom: 20px;">
            <h2 style="margin: 0 0 10px 0; color: #78350f; font-size: 15px; font-weight: 900; border-bottom: 2px solid #fef3c7; padding-bottom: 8px;">
              👤 بيانات العميل #${idx + 1}: ${u.name}
            </h2>
            <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; font-size: 12px; font-weight: bold; line-height: 1.6;">
              <div><b>رقم الهاتف الجوال:</b> <span dir="ltr" style="font-family: monospace;">${u.phone}</span></div>
              <div><b>عنوان التوصيل المسجل:</b> ${u.address || 'غير محدد'}</div>
              <div><b>العملة الافتراضية:</b> ${getCurrencyCode(u.currency)}</div>
              <div><b>الرصيد المشحون المتاح:</b> <span style="color: #047857; font-weight:900;">${u.balance} YER</span></div>
              <div><b>رصيد الهدايا والجوائز:</b> <span style="color: #b45309; font-weight:900;">${u.giftBalance || 0} YER</span></div>
              <div><b>رمز الجهاز التعريفي المميز:</b> <span style="font-size: 10px; color:#64748b; font-family: monospace;">${u.deviceId || 'غير مسجل'}</span></div>
            </div>
          </div>
      `;

      // 1. Recharges section
      if (type === 'recharges' || type === 'comprehensive') {
        const userRecharges = recharges.filter(r => r.userId === u.id);
        reportHtml += `
          <h3 style="color: #78350f; font-size: 13px; font-weight: 800; margin: 15px 0 8px 0; border-right: 3px solid #f59e0b; padding-right: 8px;">💳 حركات وسجل شحن رصيد المحفظة:</h3>
        `;
        if (userRecharges.length === 0) {
          reportHtml += `<p style="font-size: 11px; color: #64748b; font-style: italic; margin-bottom: 20px;">لا توجد عمليات إيداع أو شحن رصيد مسجلة.</p>`;
        } else {
          let rows = '';
          userRecharges.forEach(r => {
            let statusBadge = '';
            if (r.status === 'approved') statusBadge = '<span style="color:#047857; font-weight:bold;">تم الشحن بنجاح ✅</span>';
            else if (r.status === 'rejected') statusBadge = '<span style="color:#b91c1c; font-weight:bold;">مرفوض وملغي ❌</span>';
            else statusBadge = '<span style="color:#b45309; font-weight:bold;">تحت المراجعة ⏳</span>';

            rows += `
              <tr style="border-bottom: 1px solid #f1f5f9; font-size: 11px;">
                <td style="padding: 8px; text-align: center; font-weight:bold;">${r.id}</td>
                <td style="padding: 8px; text-align: center; color:#64748b;">${formatArabicDate(r.createdAt)}</td>
                <td style="padding: 8px; text-align: right;">${r.senderName} (${r.senderAccount})</td>
                <td style="padding: 8px; text-align: center; font-weight:black; color:#047857;">${r.amount} YER</td>
                <td style="padding: 8px; text-align: center;">${statusBadge}</td>
              </tr>
            `;
          });
          reportHtml += `
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 11px;">
              <thead>
                <tr style="background: #fdf6e2; color: #78350f; border-bottom: 2px solid #f59e0b; font-weight:bold;">
                  <th style="padding: 8px; text-align: center; width:15%;">رمز الشحن</th>
                  <th style="padding: 8px; text-align: center; width:20%;">تاريخ الطلب</th>
                  <th style="padding: 8px; text-align: right; width:35%;">المرسل وحساب الكريمي</th>
                  <th style="padding: 8px; text-align: center; width:15%;">المبلغ</th>
                  <th style="padding: 8px; text-align: center; width:15%;">حالة السند</th>
                </tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
          `;
        }
      }

      // 2. Orders section
      if (type === 'new_orders' || type === 'received_orders' || type === 'comprehensive') {
        const userOrders = orders.filter(o => {
          if (o.userId !== u.id) return false;
          if (type === 'new_orders') return o.status === 'pending';
          if (type === 'received_orders') return o.status === 'completed';
          return true; // comprehensive
        });

        reportHtml += `
          <h3 style="color: #78350f; font-size: 13px; font-weight: 800; margin: 20px 0 8px 0; border-right: 3px solid #f59e0b; padding-right: 8px;">🛍️ تفاصيل الفواتير والمنتجات المطلوبة وعمليات السداد:</h3>
        `;
        if (userOrders.length === 0) {
          reportHtml += `<p style="font-size: 11px; color: #64748b; font-style: italic; margin-bottom: 25px;">لا توجد طلبيات توصيل مسجلة لهذا العميل ضمن هذه الحالة.</p>`;
        } else {
          userOrders.forEach((o) => {
            let statusText = o.status === 'pending' ? '<span style="color:#b45309; font-weight:bold;">⏳ طلبية جديدة معلقة قيد المراجعة</span>' : o.status === 'completed' ? '<span style="color:#047857; font-weight:bold;">✅ تم التوصيل والشحن</span>' : '<span style="color:#b91c1c; font-weight:bold;">❌ ملغية</span>';
            let itemRows = '';
            o.items.forEach(it => {
              let optsText = '';
              Object.entries(it.selectedProperties).forEach(([k,v]) => {
                optsText += ` [${k}: ${v}]`;
              });
              itemRows += `
                <tr style="border-bottom: 1px solid #e2e8f0; font-size: 11px;">
                  <td style="padding: 8px; text-align: right; font-weight: bold;">
                    ${it.productName}
                    ${optsText ? `<br/><span style="color:#b45309; font-size:9.5px; font-weight:bold;">${optsText}</span>` : ''}
                  </td>
                  <td style="padding: 8px; text-align: center; font-family: monospace; font-weight:bold;">${it.productCode}</td>
                  <td style="padding: 8px; text-align: center; font-weight:bold;">${it.quantity}</td>
                  <td style="padding: 8px; text-align: left; font-weight:bold;">${it.price} ${getCurrencyCode(o.currency)}</td>
                  <td style="padding: 8px; text-align: left; font-weight:black; color:#78350f;">${it.totalPrice} ${getCurrencyCode(o.currency)}</td>
                </tr>
              `;
            });

            reportHtml += `
              <div style="border: 1px solid #cbd5e1; border-radius: 12px; padding: 15px; margin-bottom: 20px; background: #fafafa; page-break-inside: avoid;">
                <div style="display: flex; justify-content: space-between; font-size: 11px; border-bottom: 1px solid #cbd5e1; padding-bottom: 8px; margin-bottom: 12px; font-weight: bold;">
                  <div><b>رقم الفاتورة المرجعي:</b> <span style="color:#78350f; font-size:12px; font-family:monospace;">${o.id}</span></div>
                  <div><b>التاريخ والوقت:</b> ${formatArabicDate(o.createdAt)}</div>
                  <div><b>الحالة:</b> ${statusText}</div>
                </div>
                <div style="font-size: 11px; font-weight:bold; margin-bottom: 12px; background:#f1f5f9; padding:10px; border-radius:8px; border-right: 4px solid #64748b; line-height: 1.5;">
                  💸 <b>بيانات عملية السداد:</b> ${o.paymentMethod === 'gift_wallet' ? 'خصم مباشر من محفظة هدايا أم روح 🎁' : o.paymentMethod === 'recharge_wallet' ? 'خصم مباشر من الرصيد السحابي المشحون للعميل 💳' : `🏦 حوالة بنكية عبر الكريمي (المحول: ${o.senderName} | رقم سند/حساب الكريمي: ${o.senderAccount})`}
                </div>
                <table style="width: 100%; border-collapse: collapse; font-size: 11px; margin-bottom: 10px;">
                  <thead>
                    <tr style="background: #e2e8f0; color: #1e293b; border-bottom: 2px solid #cbd5e1; font-weight:bold;">
                      <th style="padding: 8px; text-align: right; width: 40%;">اسم الصنف المطلوب</th>
                      <th style="padding: 8px; text-align: center; width: 15%;">الرمز</th>
                      <th style="padding: 8px; text-align: center; width: 10%;">الكمية</th>
                      <th style="padding: 8px; text-align: left; width: 15%;">السعر</th>
                      <th style="padding: 8px; text-align: left; width: 20%;">الإجمالي</th>
                    </tr>
                  </thead>
                  <tbody>${itemRows}</tbody>
                </table>
                <div style="text-align: left; font-size: 11.5px; font-weight: bold; border-top: 1px dashed #cbd5e1; padding-top: 8px; margin-top: 8px;">
                  <span><b>إجمالي قيمة المنتجات:</b> ${o.totalAmount - o.deliveryFee} ${getCurrencyCode(o.currency)}</span> | 
                  <span><b>رسوم التوصيل والعنوان:</b> +${o.deliveryFee} ${getCurrencyCode(o.currency)}</span> | 
                  <span style="font-size:13.5px; color:#78350f;"><b>المبلغ الإجمالي الكلي:</b> ${o.totalAmount} ${getCurrencyCode(o.currency)}</span>
                </div>
              </div>
            `;
          });
        }
      }

      reportHtml += `</div>`; // Close client div
    });

    reportHtml += `
        <div style="margin-top: 50px; text-align: center; font-size: 11px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 15px; font-weight: bold; page-break-inside: avoid;">
          نشكركم على استخدام منصتنا الذكية | متجر أم روح 🌸
        </div>
      </div>
    `;

    printHtmlWithIframe(reportHtml);
  };

  // ----------------------------------------------------
  // --- TAB 6: GIFTS & HIGH ORDER USERS ---
  const [giftSearchQuery, setGiftSearchQuery] = useState('');
  const [showGiftModal, setShowGiftModal] = useState(false);
  const [selectedGiftUser, setSelectedGiftUser] = useState<User | null>(null);
  const [giftAmountInput, setGiftAmountInput] = useState<number>(0);
  const [giftCurrencyInput, setGiftCurrencyInput] = useState<Currency>('YER_NEW');

  // Sort users based on highest order count
  const sortedUsersByOrders = [...users].map(u => {
    const orderCount = orders.filter(o => o.userId === u.id).length;
    return { ...u, orderCount };
  }).sort((a, b) => b.orderCount - a.orderCount);

  const searchedGiftUsers = sortedUsersByOrders.filter(u => 
    u.name.toLowerCase().includes(giftSearchQuery.toLowerCase()) || 
    u.phone.includes(giftSearchQuery)
  );

  const handleSendGiftSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedGiftUser || giftAmountInput <= 0) return;

    Database.sendGift(
      selectedGiftUser.id,
      selectedGiftUser.name,
      selectedGiftUser.phone,
      giftAmountInput,
      giftCurrencyInput
    );

    setShowGiftModal(false);
    setSelectedGiftUser(null);
    setGiftAmountInput(0);
    setGiftCurrencyInput('YER_NEW');
    showToast('تم شحن وإرسال الهدية المالية للعميلة المستهدفة بنجاح! 🎁');
    reloadData();
  };

  // ----------------------------------------------------
  // --- TAB 7: NEW ORDERS MANAGER ---
  const [activeOrderForPdf, setActiveOrderForPdf] = useState<Order | null>(null);
  const [adminOrderSubTab, setAdminOrderSubTab] = useState<'pending' | 'approved' | 'preparing' | 'shipping'>('pending');

  const pendingOrders = orders.filter(o => o.status === 'pending');
  const activeOrdersCount = orders.filter(o => ['pending', 'approved', 'preparing', 'shipping'].includes(o.status)).length;

  const handleUpdateOrderStatus = (orderId: string, status: OrderStatus) => {
    Database.updateOrderStatus(orderId, status);
    let msg = 'تم تحديث حالة الطلبية بنجاح!';
    if (status === 'approved') msg = 'تم قبول واعتماد الفاتورة بنجاح! 👍';
    if (status === 'preparing') msg = 'بدأ الآن تجهيز الطلبية في المستودع! 🛠️';
    if (status === 'shipping') msg = 'تم تسليم الطلبية للمندوب وانطلقت للشحن! 🚚';
    if (status === 'completed') msg = 'تم تأكيد تسليم الشحنة للعميل بنجاح! ✅';
    if (status === 'canceled') msg = 'تم إلغاء الطلبية وتنبيه العميلة بنجاح ❌';
    showToast(msg);
    reloadData();
  };

  const handleApproveOrder = (orderId: string) => {
    handleUpdateOrderStatus(orderId, 'completed');
  };

  const handleCancelOrder = (orderId: string) => {
    handleUpdateOrderStatus(orderId, 'canceled');
  };

  const handlePrintOrderInvoice = (order: Order) => {
    let itemsRows = '';
    order.items.forEach(it => {
      let propsText = '';
      Object.entries(it.selectedProperties).forEach(([k,v]) => {
        propsText += ` [${k}: ${v}]`;
      });
      itemsRows += `
        <tr style="border-bottom: 1px solid #ddd; font-size: 11.5px;">
          <td style="padding: 10px; text-align: right; font-weight: bold;">${it.productName}${propsText ? `<br/><span style="color:#b45309; font-size:9.5px; font-weight:bold;">${propsText}</span>` : ''}</td>
          <td style="padding: 10px; text-align: center; font-family: monospace;">${it.productCode}</td>
          <td style="padding: 10px; text-align: center; font-weight: bold;">${it.quantity}</td>
          <td style="padding: 10px; text-align: left; font-weight: bold;">${it.price} ${getCurrencyCode(order.currency)}</td>
          <td style="padding: 10px; text-align: left; font-weight: black; color: #78350f;">${it.totalPrice} ${getCurrencyCode(order.currency)}</td>
        </tr>
      `;
    });

    const reportHtml = `
      <div dir="rtl" style="font-family: system-ui, sans-serif; padding: 40px; color: #1e293b; max-width: 750px; margin: auto; background: white;">
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid #d97706; padding-bottom: 15px; margin-bottom: 25px;">
          <div>
            <h1 style="color: #78350f; margin: 0; font-size: 22px; font-weight: 900;">مَتْجَرُ أُمِّ رُوْح 🌸</h1>
            <p style="font-size: 11px; margin: 5px 0 0 0; color: #475569; font-weight: bold;">للأدوات المنزلية والملابس والألعاب ومستحضرات التجميل</p>
          </div>
          <div style="text-align: left; font-size: 11.5px; color:#475569;">
            <p style="margin: 0; font-weight: bold;"><b>رقم الفاتورة المرجعي:</b> ${order.id}</p>
            <p style="margin: 4px 0 0 0; font-weight: bold;"><b>التاريخ والوقت:</b> ${formatArabicDate(order.createdAt)}</p>
          </div>
        </div>

        <div style="font-size: 12px; background: #fffcf0; padding: 18px; border-radius: 14px; border: 1px solid #fef3c7; line-height: 1.6; margin-bottom: 25px;">
          <h3 style="margin: 0 0 10px 0; color: #78350f; border-bottom: 2px solid #fef3c7; padding-bottom: 5px; font-weight: 900; font-size:13px;">📌 تفاصيل وبيانات العميل وعملية السداد</h3>
          <p style="margin: 4px 0;"><b>اسم العميل الكامل:</b> ${order.userName}</p>
          <p style="margin: 4px 0;"><b>رقم هاتف الاتصال:</b> <span dir="ltr">${order.userPhone}</span></p>
          <p style="margin: 4px 0;"><b>عنوان التوصيل للمندوب:</b> ${order.address}</p>
          <p style="margin: 4px 0;"><b>طريقة السداد المعتمدة:</b> ${order.paymentMethod === 'gift_wallet' ? 'خصم مباشر وتلقائي من محفظة هدايا أم روح 🎁' : order.paymentMethod === 'recharge_wallet' ? 'خصم تلقائي مباشر من رصيد الشحن السحابي 💳' : `حوالة أو سند إيداع الكريمي (مرسل: ${order.senderName} | حساب/حوالة: ${order.senderAccount})`}</p>
        </div>

        <table style="width: 100%; border-collapse: collapse; margin-top: 25px; margin-bottom: 25px;">
          <thead>
            <tr style="background: #78350f; color: white; font-size: 12px; font-weight: bold;">
              <th style="padding: 10px; text-align: right; width:45%;">اسم الصنف والخصائص المحددة</th>
              <th style="padding: 10px; text-align: center; width:15%;">الرمز</th>
              <th style="padding: 10px; text-align: center; width:10%;">الكمية</th>
              <th style="padding: 10px; text-align: left; width:15%;">سعر الوحدة</th>
              <th style="padding: 10px; text-align: left; width:15%;">الإجمالي</th>
            </tr>
          </thead>
          <tbody>
            ${itemsRows}
          </tbody>
        </table>

        <div style="border-top: 2px dashed #cbd5e1; padding-top: 15px; text-align: left; font-size: 12.5px; font-weight: bold; line-height: 1.6;">
          <p style="margin: 4px 0;"><b>قيمة مشتريات المنتجات:</b> ${order.totalAmount - order.deliveryFee} ${getCurrencyCode(order.currency)}</p>
          <p style="margin: 4px 0;"><b>رسوم الشحن والتوصيل للعنوان:</b> +${order.deliveryFee} ${getCurrencyCode(order.currency)}</p>
          <p style="margin: 8px 0 0 0; font-size: 16px; color: #78350f; font-weight: 900;"><b>المبلغ الإجمالي الكلي المطلوب:</b> ${order.totalAmount} ${getCurrencyCode(order.currency)}</p>
        </div>

        <div style="margin-top: 60px; text-align: center; font-size: 11px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 15px; font-weight: bold;">
          نشكركم لتسوقكم وثقتكم بمتجر أم روح سائلين المولى عز وجل البركة والتوفيق! 🌸
        </div>
      </div>
    `;
    printHtmlWithIframe(reportHtml);
  };

  // ----------------------------------------------------
  // --- TAB 8: SENT ORDERS ARCHIVE ---
  const completedOrders = orders.filter(o => o.status === 'completed' || o.status === 'canceled');

  // ----------------------------------------------------
  // --- TAB 9: RECHARGE BALANCE REQUESTS ---
  const pendingRecharges = recharges.filter(r => r.status === 'pending');
  const [rechargeApprovalId, setRechargeApprovalId] = useState('');
  const [rechargeApprovedAmount, setRechargeApprovedAmount] = useState<number>(0);

  const handleApproveRechargeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rechargeApprovalId || rechargeApprovedAmount <= 0) return;

    const success = await Database.approveRechargeRequest(rechargeApprovalId, rechargeApprovedAmount);
    setRechargeApprovalId('');
    setRechargeApprovedAmount(0);
    if (success) {
      showToast('تمت الموافقة وتغذية رصيد حساب العميلة بنجاح! 💰');
    } else {
      showToast('⚠️ تعذر إتمام عملية الموافقة على طلب الشحن!');
    }
    reloadData();
  };

  const handleRejectRecharge = (id: string) => {
    askConfirmation(
      'تأكيد رفض طلب الشحن ❌',
      'هل أنت متأكد من رفض طلب شحن الرصيد هذا؟',
      () => {
        Database.rejectRechargeRequest(id);
        showToast('تم رفض الطلب بنجاح.');
        reloadData();
      }
    );
  };

  const handleDeleteRecharge = (id: string) => {
    askConfirmation(
      'حذف طلب الشحن نهائياً 🗑️',
      'هل أنتِ متأكدة من رغبتكِ في حذف هذا الطلب من الأرشيف نهائياً؟ لا يمكن استرجاع البيانات بعد الحذف.',
      () => {
        Database.deleteRechargeRequest(id);
        showToast('تم حذف طلب الشحن بنجاح من الأرشيف.');
        reloadData();
      }
    );
  };

  const handleClearAllRecharges = () => {
    askConfirmation(
      '⚠️ تفريغ أرشيف طلبات الشحن بالكامل ⚠️',
      'تحذير هام: هل أنتِ متأكدة من رغبتكِ في تفريغ وحذف أرشيف طلبات الشحن بالكامل؟ سيتم مسح كافة البيانات نهائياً.',
      () => {
        Database.clearAllRechargeRequests();
        showToast('تم تفريغ أرشيف طلبات الشحن بالكامل.');
        reloadData();
      }
    );
  };

  const handleDeleteOrder = (id: string) => {
    askConfirmation(
      'حذف الطلب نهائياً 🗑️',
      'هل أنتِ متأكدة من رغبتكِ في حذف هذا الطلب من الأرشيف نهائياً؟',
      () => {
        Database.deleteOrder(id);
        showToast('تم حذف الطلب بنجاح من الأرشيف.');
        reloadData();
      }
    );
  };

  const handleClearAllOrders = () => {
    askConfirmation(
      '⚠️ تفريغ أرشيف الطلبات بالكامل ⚠️',
      'تحذير هام: هل أنتِ متأكدة من رغبتكِ في تفريغ وحذف أرشيف كافة الطلبات بالكامل؟',
      () => {
        Database.clearAllOrders();
        showToast('تم تفريغ أرشيف الطلبات بالكامل.');
        reloadData();
      }
    );
  };

  const handleClearAllContestantsAndVotes = () => {
    askConfirmation(
      '⚠️ تصفير المسابقات وتفريغ الأرشيف ⚠️',
      'تحذير هام جداً: هل أنتِ متأكدة من رغبتكِ في تفريغ وحذف أرشيف كافة المتسابقين وتصفير جميع أصوات التصويت بالكامل؟ لا يمكن التراجع عن هذا الإجراء!',
      () => {
        Database.clearAllContestantsAndVotes();
        showToast('تم تفريغ أرشيف المسابقات وتصفير الأصوات بنجاح.');
        reloadData();
      }
    );
  };

  return (
    <div className="fixed inset-0 overflow-y-auto bg-amber-50/10 dark:bg-gray-950 pb-32 pt-5 overscroll-contain touch-pan-y select-text z-[40]">
      {/* Custom Confirmation Dialog */}
      <AnimatePresence>
        {confirmModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
            dir="rtl"
          >
            <motion.div
              initial={{ scale: 0.95, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 15 }}
              className="bg-white dark:bg-gray-900 rounded-3xl p-6 max-w-sm w-full border border-amber-100 dark:border-gray-800 shadow-2xl text-right space-y-4"
            >
              <h4 className="text-sm font-black text-amber-950 dark:text-amber-300">{confirmModal.title}</h4>
              <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed font-bold">{confirmModal.message}</p>
              <div className="flex gap-2.5 justify-end pt-2">
                <button
                  onClick={() => setConfirmModal(null)}
                  className="px-4 py-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 text-xs font-black rounded-xl transition"
                >
                  إلغاء ❌
                </button>
                <button
                  onClick={() => {
                    confirmModal.onConfirm();
                    setConfirmModal(null);
                  }}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-black rounded-xl transition shadow-sm"
                >
                  تأكيد وحذف 🗑️
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Top Title bar */}
      <div className="bg-white dark:bg-gray-900 px-4 py-4 border-b border-amber-100 dark:border-gray-800 shadow-sm flex justify-between items-center max-w-5xl mx-auto rounded-3xl mb-5 gap-3 flex-wrap">
        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="bg-amber-50 hover:bg-amber-100 dark:bg-gray-800 dark:hover:bg-gray-700 p-2 rounded-xl text-amber-900 dark:text-amber-100 transition flex items-center gap-1.5 font-bold text-xs"
          >
            <ArrowRight className="w-4 h-4" />
            <span>خروج من الإدارة</span>
          </button>
          <button
            onClick={async () => {
              setIsAdminRefreshing(true);
              try {
                if (isSupabaseConfigured()) {
                  // Force a clean sync bypass throttle to fetch latest database rows
                  await Database.syncFromFirestore(undefined, true);
                }
                reloadData();
                showToast('🔄 تم جلب وتحديث لوحة الإدارة وكافة البيانات من السحاب بنجاح! ☁️');
              } catch (err) {
                console.error("Manual admin sync failed:", err);
                showToast('❌ عذراً، فشل تحديث البيانات من السحاب!');
              } finally {
                setIsAdminRefreshing(false);
              }
            }}
            disabled={isAdminRefreshing}
            className={`bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:hover:bg-emerald-900/60 p-2 rounded-xl text-emerald-800 dark:text-emerald-200 transition flex items-center gap-1.5 font-bold text-xs shadow-sm ${isAdminRefreshing ? 'opacity-60 cursor-not-allowed' : ''}`}
            title="تحديث البيانات يدويًا"
          >
            <RefreshCw className={`w-4 h-4 ${isAdminRefreshing ? 'animate-spin' : ''}`} />
            <span>{isAdminRefreshing ? 'جاري التحديث... 🔄' : 'تحديث البيانات 🔄'}</span>
          </button>
        </div>

        <h2 className="text-sm font-black text-amber-950 dark:text-amber-300">
          لوحة تحكم إدارة متجر أم روح 👑
        </h2>
        
        {adminRole === 'worker' ? (
          <span className="text-[10px] bg-blue-100 text-blue-700 font-extrabold px-3 py-1.5 rounded-xl shadow-sm">
            وضع عامل الفئات والأصناف 🛠️
          </span>
        ) : (
          <span className="text-[10px] bg-red-100 text-red-700 font-extrabold px-3 py-1.5 rounded-xl animate-pulse shadow-sm">
            وضع المدير العام 👑
          </span>
        )}
      </div>

      {/* Grid view of sidebar and content */}
      <div className="max-w-5xl mx-auto px-4 grid grid-cols-1 md:grid-cols-4 gap-6">
        {/* Sidebar Navigation */}
        <div className="bg-white dark:bg-gray-900 p-4 rounded-3xl border border-amber-100/40 dark:border-gray-800 shadow-sm space-y-1 md:col-span-1 h-fit">
          <span className="text-[10px] font-black text-gray-400 block px-3 mb-2">أقسام لوحة الإدارة</span>
          
          {([
            { id: 'settings', label: 'إعدادات الإدارة', icon: Settings, badge: undefined },
            { id: 'categories', label: 'إضافة فئات', icon: Grid, badge: undefined },
            { id: 'products', label: 'إضافة الأصناف', icon: Plus, badge: undefined },
            { id: 'locations', label: 'رسوم توصيل العناوين', icon: MapPin, badge: undefined },
            { id: 'offers', label: 'العروض والسلايدر', icon: Percent, badge: undefined },
            { id: 'users', label: 'قاعدة بيانات العملاء', icon: DbIcon, badge: undefined },
            { id: 'gifts', label: 'هدايا أم روح', icon: Gift, badge: undefined },
            { id: 'reversions', label: 'مراجعة وتراجع الأخطاء 🔄', icon: RefreshCw, badge: undefined },
            { id: 'new-orders', label: 'الطلبات النشطة 📦', icon: FileText, badge: activeOrdersCount },
            { id: 'active-carts', label: 'السلل النشطة للعملاء 🛒', icon: ShoppingBag, badge: undefined },
            { id: 'sent-orders', label: 'الطلبات المرسلة', icon: Truck, badge: undefined },
            { id: 'recharges', label: 'شحن رصيدي', icon: DollarSign, badge: pendingRecharges.length },
            { id: 'reports', label: 'تقارير الشحن والسداد 📊', icon: TrendingUp, badge: undefined },
            { id: 'archives', label: 'أرشيف الإدارة والطباعة 📦', icon: Archive, badge: undefined },
            { id: 'events', label: 'مسابقات أم روح 🏆', icon: Award, badge: undefined },
            { id: 'notifications', label: 'إدارة الإشعارات 🔔', icon: Bell, badge: undefined },
            { id: 'database', label: 'إدارة السحابة وقواعد البيانات ☁️', icon: DbIcon, badge: undefined }
          ].filter(tab => adminRole !== 'worker' || tab.id === 'categories' || tab.id === 'products')).map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                id={`admin-nav-${tab.id}`}
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`w-full text-right py-3 px-4 rounded-2xl font-bold text-xs flex justify-between items-center transition ${
                  isActive 
                    ? 'bg-amber-500 text-white shadow-md shadow-amber-500/10' 
                    : 'text-gray-600 dark:text-gray-400 hover:bg-amber-500/5 hover:text-amber-800'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Icon className="w-4 h-4" />
                  <span>{tab.label}</span>
                </div>
                {tab.badge && tab.badge > 0 ? (
                  <span className="bg-red-500 text-white font-extrabold text-[9px] px-2 py-0.5 rounded-full">
                    {tab.badge}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>

        {/* Content Area */}
        <div className="md:col-span-3 space-y-5">
          {/* Toast Notification alert inside Admin */}
          <AnimatePresence>
            {toastMessage && (
              <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="bg-amber-900 text-white p-3.5 rounded-2xl shadow-xl border border-amber-800 text-xs font-bold text-center"
              >
                {toastMessage}
              </motion.div>
            )}
          </AnimatePresence>

          {/* 1. ADMIN SETTINGS */}
          {activeTab === 'settings' && (
            <div className="bg-white dark:bg-gray-900 p-6 rounded-3xl border border-amber-100/40 dark:border-gray-800 shadow-sm space-y-6">
              <h3 className="text-xs font-black text-amber-950 dark:text-amber-300 border-b border-amber-50 dark:border-gray-800 pb-2 text-right">
                لوحة إعدادات الإدارة وسعر الصرف
              </h3>

              <form onSubmit={handleSaveGeneralSettings} className="space-y-4 text-right">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-700 dark:text-gray-300 block">تغيير رمز الدخول السري للمدير العام:</label>
                    <input
                      id="admin-settings-code"
                      type="text"
                      value={newAdminPass}
                      onChange={(e) => setNewAdminPass(e.target.value)}
                      placeholder="الرمز الافتراضي (1234)"
                      className="w-full px-3.5 py-2.5 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white border border-amber-100 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 text-xs font-semibold"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-700 dark:text-gray-300 block">رمز دخول عامل إضافة الفئات والأصناف:</label>
                    <input
                      id="admin-settings-worker-code"
                      type="text"
                      value={workerPass}
                      onChange={(e) => setWorkerPass(e.target.value)}
                      placeholder="رمز العامل الافتراضي (1111)"
                      className="w-full px-3.5 py-2.5 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white border border-amber-100 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 text-xs font-semibold"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {/* Exchange rate factor Old Yemeni Rial */}
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-700 dark:text-gray-300 block">سعر صرف الريال اليمني القديم (بالقسمة على):</label>
                    <input
                      id="admin-settings-yerold"
                      type="number"
                      step="any"
                      value={yerOldFactor}
                      onChange={(e) => setYerOldFactor(parseFloat(e.target.value) || 2.9)}
                      className="w-full px-3.5 py-2.5 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white border border-amber-100 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 text-xs font-bold"
                    />
                  </div>

                  {/* Exchange rate factor Saudi Rial */}
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-700 dark:text-gray-300 block">سعر صرف الريال السعودي (بالقسمة على):</label>
                    <input
                      id="admin-settings-sar"
                      type="number"
                      step="any"
                      value={sarFactor}
                      onChange={(e) => setSarFactor(parseFloat(e.target.value) || 410)}
                      className="w-full px-3.5 py-2.5 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white border border-amber-100 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 text-xs font-bold"
                    />
                  </div>
                </div>

                {/* News Ticker Config */}
                <div className="border-t border-dashed border-amber-100 dark:border-gray-800 pt-4 space-y-4 text-right">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-extrabold text-amber-900 dark:text-amber-400">إعدادات شريط الأخبار المتحرك 📢</h4>
                    <span className="text-[10px] text-gray-400 dark:text-gray-500 font-semibold">يتم الفصل بوردة المتجر 🌸</span>
                  </div>

                  {/* Add ticker text input */}
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newTickerInput}
                      onChange={(e) => setNewTickerInput(e.target.value)}
                      placeholder="اكتب إعلان أو تنبيه جديد..."
                      className="flex-1 px-3.5 py-2.5 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white border border-amber-100 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 text-xs font-semibold"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          if (newTickerInput.trim()) {
                            setAdminTickerTexts([...adminTickerTexts, newTickerInput.trim()]);
                            setNewTickerInput('');
                          }
                        }
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (newTickerInput.trim()) {
                          setAdminTickerTexts([...adminTickerTexts, newTickerInput.trim()]);
                          setNewTickerInput('');
                        }
                      }}
                      className="px-4 py-2 bg-amber-600 hover:bg-amber-700 active:scale-95 text-white rounded-xl text-xs font-black transition flex items-center justify-center gap-1 shrink-0 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      إضافة ➕
                    </button>
                  </div>

                  {/* Ticker texts list */}
                  {adminTickerTexts.length > 0 ? (
                    <div className="space-y-2 max-h-48 overflow-y-auto border border-amber-50 dark:border-gray-800 p-2 rounded-xl bg-amber-50/10">
                      {adminTickerTexts.map((txt, idx) => (
                        <div 
                          key={idx} 
                          className="flex items-center justify-between gap-3 bg-white dark:bg-gray-900 px-3 py-2 rounded-lg border border-amber-100/50 dark:border-gray-800 shadow-xs"
                        >
                          <span className="text-xs font-semibold text-gray-800 dark:text-gray-200 text-right leading-relaxed flex-1">
                            {txt}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setAdminTickerTexts(adminTickerTexts.filter((_, i) => i !== idx));
                            }}
                            className="text-rose-500 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/30 p-1.5 rounded-lg transition shrink-0 cursor-pointer"
                            title="حذف"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-4 bg-gray-50 dark:bg-gray-800/40 rounded-xl border border-dashed border-gray-200 dark:border-gray-800">
                      <p className="text-[10px] text-gray-400 font-bold">لا توجد نصوص حالية في شريط الأخبار.</p>
                    </div>
                  )}
                </div>

                {/* Advisor customization */}
                <div className="border-t border-dashed border-amber-100 pt-4 space-y-4">
                  <h4 className="text-xs font-extrabold text-amber-900">تعديل بيانات المستشارة روح</h4>
                  
                  <div className="flex flex-col sm:flex-row items-center gap-4 bg-amber-500/5 dark:bg-amber-500/10 p-4 rounded-2xl border border-amber-100/30 dark:border-amber-900/30">
                    {/* Avatar Preview */}
                    <div className="relative shrink-0">
                      <img 
                        src={getDirectImageUrl(advisorImg) || 'https://images.unsplash.com/photo-1503919545889-aef636e10ad4?auto=format&fit=crop&q=80&w=400'} 
                        alt="المستشارة روح" 
                        className="w-16 h-16 rounded-full object-cover border-2 border-amber-500 shadow-sm"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1503919545889-aef636e10ad4?auto=format&fit=crop&q=80&w=400';
                        }}
                      />
                      {uploadingAdvisorImage && (
                        <div className="absolute inset-0 bg-black/60 rounded-full flex items-center justify-center">
                          <span className="text-[9px] text-white font-bold">جاري الرفع...</span>
                        </div>
                      )}
                    </div>

                    <div className="flex-1 space-y-2 w-full text-right">
                      <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400 block">رفع صورة جديدة من جهازك أو وضع رابط خارجي:</span>
                      
                      <div className="flex flex-col sm:flex-row items-center gap-2">
                        {/* File selector button */}
                        <div className="relative shrink-0">
                          <input
                            type="file"
                            accept="image/*"
                            id="admin-advisor-file-input"
                            onChange={handleAdvisorImgUpload}
                            className="hidden"
                          />
                          <label
                            htmlFor="admin-advisor-file-input"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-800 hover:bg-amber-900 text-white rounded-lg text-[10px] font-black cursor-pointer shadow-sm transition"
                          >
                            <Upload className="w-3 h-3" />
                            اختر صورة من جهازك 📷
                          </label>
                        </div>

                        {/* Or URL input */}
                        <div className="flex-1 w-full">
                          <input
                            id="admin-settings-advisor-img"
                            type="url"
                            value={advisorImg}
                            onChange={(e) => setAdvisorImg(e.target.value)}
                            placeholder="رابط صورة مباشر..."
                            className="w-full px-3 py-1.5 bg-white dark:bg-gray-800 text-gray-900 dark:text-white border border-amber-100 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-500 text-[10px] font-semibold"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-gray-700 dark:text-gray-300 block">الاسم:</label>
                      <input
                        id="admin-settings-advisor-name"
                        type="text"
                        value={advisorName}
                        onChange={(e) => setAdvisorName(e.target.value)}
                        className="w-full px-3.5 py-2.5 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white border border-amber-100 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 text-xs font-semibold"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-gray-700 dark:text-gray-300 block">الصفة/اللقب:</label>
                      <input
                        id="admin-settings-advisor-title"
                        type="text"
                        value={advisorTitle}
                        onChange={(e) => setAdvisorTitle(e.target.value)}
                        className="w-full px-3.5 py-2.5 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white border border-amber-100 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 text-xs font-semibold"
                      />
                    </div>
                  </div>
                </div>

                {/* Bank Accounts Customization */}
                <div className="border-t border-dashed border-amber-100 dark:border-gray-800 pt-4 space-y-4 text-right">
                  <h4 className="text-xs font-extrabold text-amber-950 dark:text-amber-300">تعديل الحسابات البنكية الافتراضية للمتجر (لكل عملة)</h4>
                  
                  {/* YER_NEW Account */}
                  <div className="p-3 bg-amber-500/5 dark:bg-amber-500/10 rounded-2xl border border-amber-100/30 dark:border-gray-800 space-y-2">
                    <span className="text-[10px] font-black text-amber-800 dark:text-amber-400 block">حساب الريال اليمني الجديد (YER_NEW):</span>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <input
                        type="text"
                        value={bankHolderYenNew}
                        onChange={(e) => setBankHolderYenNew(e.target.value)}
                        placeholder="اسم صاحب الحساب..."
                        className="px-3 py-1.5 bg-white dark:bg-gray-800 text-gray-900 dark:text-white border border-amber-100 dark:border-gray-700 rounded-lg text-[10px]"
                      />
                      <input
                        type="text"
                        value={bankAccYenNew}
                        onChange={(e) => setBankAccYenNew(e.target.value)}
                        placeholder="رقم الحساب..."
                        className="px-3 py-1.5 bg-white dark:bg-gray-800 text-gray-900 dark:text-white border border-amber-100 dark:border-gray-700 rounded-lg text-[10px]"
                      />
                      <input
                        type="text"
                        value={bankNameYenNew}
                        onChange={(e) => setBankNameYenNew(e.target.value)}
                        placeholder="اسم البنك..."
                        className="px-3 py-1.5 bg-white dark:bg-gray-800 text-gray-900 dark:text-white border border-amber-100 dark:border-gray-700 rounded-lg text-[10px]"
                      />
                    </div>
                  </div>

                  {/* YER_OLD Account */}
                  <div className="p-3 bg-amber-500/5 dark:bg-amber-500/10 rounded-2xl border border-amber-100/30 dark:border-gray-800 space-y-2">
                    <span className="text-[10px] font-black text-amber-800 dark:text-amber-400 block">حساب الريال اليمني القديم (YER_OLD):</span>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <input
                        type="text"
                        value={bankHolderYenOld}
                        onChange={(e) => setBankHolderYenOld(e.target.value)}
                        placeholder="اسم صاحب الحساب..."
                        className="px-3 py-1.5 bg-white dark:bg-gray-800 text-gray-900 dark:text-white border border-amber-100 dark:border-gray-700 rounded-lg text-[10px]"
                      />
                      <input
                        type="text"
                        value={bankAccYenOld}
                        onChange={(e) => setBankAccYenOld(e.target.value)}
                        placeholder="رقم الحساب..."
                        className="px-3 py-1.5 bg-white dark:bg-gray-800 text-gray-900 dark:text-white border border-amber-100 dark:border-gray-700 rounded-lg text-[10px]"
                      />
                      <input
                        type="text"
                        value={bankNameYenOld}
                        onChange={(e) => setBankNameYenOld(e.target.value)}
                        placeholder="اسم البنك..."
                        className="px-3 py-1.5 bg-white dark:bg-gray-800 text-gray-900 dark:text-white border border-amber-100 dark:border-gray-700 rounded-lg text-[10px]"
                      />
                    </div>
                  </div>

                  {/* SAR Account */}
                  <div className="p-3 bg-amber-500/5 dark:bg-amber-500/10 rounded-2xl border border-amber-100/30 dark:border-gray-800 space-y-2">
                    <span className="text-[10px] font-black text-amber-800 dark:text-amber-400 block">حساب الريال السعودي (SAR):</span>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <input
                        type="text"
                        value={bankHolderSar}
                        onChange={(e) => setBankHolderSar(e.target.value)}
                        placeholder="اسم صاحب الحساب..."
                        className="px-3 py-1.5 bg-white dark:bg-gray-800 text-gray-900 dark:text-white border border-amber-100 dark:border-gray-700 rounded-lg text-[10px]"
                      />
                      <input
                        type="text"
                        value={bankAccSar}
                        onChange={(e) => setBankAccSar(e.target.value)}
                        placeholder="رقم الحساب..."
                        className="px-3 py-1.5 bg-white dark:bg-gray-800 text-gray-900 dark:text-white border border-amber-100 dark:border-gray-700 rounded-lg text-[10px]"
                      />
                      <input
                        type="text"
                        value={bankNameSar}
                        onChange={(e) => setBankNameSar(e.target.value)}
                        placeholder="اسم البنك..."
                        className="px-3 py-1.5 bg-white dark:bg-gray-800 text-gray-900 dark:text-white border border-amber-100 dark:border-gray-700 rounded-lg text-[10px]"
                      />
                    </div>
                  </div>
                </div>

                {/* Kuraimi & Najm Direct Transfer customization */}
                <div className="border-t border-dashed border-amber-100 dark:border-gray-800 pt-4 space-y-4 text-right">
                  <h4 className="text-xs font-extrabold text-amber-950 dark:text-amber-300">إعدادات بوابات الدفع (حساب الكريمي وحوالة النجم وغيرها)</h4>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Kuraimi Details */}
                    <div className="p-3 bg-amber-500/5 dark:bg-amber-500/10 rounded-2xl border border-amber-100/30 dark:border-gray-800 space-y-2">
                      <span className="text-[10px] font-black text-amber-800 dark:text-amber-400 block">البيانات الخاصة بتبويب "حساب كريمي":</span>
                      <div className="space-y-2">
                        <div>
                          <label className="text-[9px] font-bold text-gray-500 block mb-0.5">اسم صاحب الحساب لكريمي:</label>
                          <input
                            type="text"
                            value={kuraimiAccountName}
                            onChange={(e) => setKuraimiAccountName(e.target.value)}
                            placeholder="صاحب حساب كريمي المعتمد..."
                            className="w-full px-3 py-1.5 bg-white dark:bg-gray-800 text-gray-900 dark:text-white border border-amber-100 dark:border-gray-700 rounded-lg text-[10px]"
                          />
                        </div>
                        <div>
                          <label className="text-[9px] font-bold text-gray-500 block mb-0.5">رقم الحساب لكريمي:</label>
                          <input
                            type="text"
                            value={kuraimiAccountNumber}
                            onChange={(e) => setKuraimiAccountNumber(e.target.value)}
                            placeholder="رقم الحساب أو الجوال المرتبط بالكريمي..."
                            className="w-full px-3 py-1.5 bg-white dark:bg-gray-800 text-gray-900 dark:text-white border border-amber-100 dark:border-gray-700 rounded-lg text-[10px]"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Najm Details */}
                    <div className="p-3 bg-amber-500/5 dark:bg-amber-500/10 rounded-2xl border border-amber-100/30 dark:border-gray-800 space-y-2">
                      <span className="text-[10px] font-black text-amber-800 dark:text-amber-400 block">البيانات الخاصة بتبويب "حوالة النجم وغيرها":</span>
                      <div className="space-y-2">
                        <div>
                          <label className="text-[9px] font-bold text-gray-500 block mb-0.5">اسم مستلم حوالات النجم والشبكات الأخرى المعتمد:</label>
                          <input
                            type="text"
                            value={najmReceiverName}
                            onChange={(e) => setNajmReceiverName(e.target.value)}
                            placeholder="الاسم الكامل رباعياً للمستلم..."
                            className="w-full px-3 py-1.5 bg-white dark:bg-gray-800 text-gray-900 dark:text-white border border-amber-100 dark:border-gray-700 rounded-lg text-[10px]"
                          />
                        </div>
                        <div className="text-[9px] text-gray-400 font-medium leading-relaxed pt-1">
                          💡 يمكن تعديل هذه البيانات في أي وقت، وستظهر فوراً للعملاء كبيانات سداد معتمدة عند إرسال طلب أو شحن محفظتهم (حيث يعلم العميل أنه يستطيع الإرسال عبر أي شبكة حوالات وصرافة للاسم المحدد).
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Store WhatsApp Number */}
                <div className="border-t border-dashed border-amber-100 dark:border-gray-800 pt-4 space-y-2 text-right">
                  <h4 className="text-xs font-extrabold text-amber-950 dark:text-amber-300">رقم واتساب المتجر (للتواصل وتلقي الطلبات)</h4>
                  <div className="space-y-1">
                    <input
                      type="text"
                      value={whatsappNumber}
                      onChange={(e) => setWhatsappNumber(e.target.value)}
                      placeholder="رقم الواتساب بالصيغة الدولية (مثل: 967739563915)..."
                      className="w-full px-3.5 py-2.5 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white border border-amber-100 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 text-xs font-semibold text-left font-mono"
                    />
                  </div>
                </div>

                {/* Rotation Speed setting */}
                <div className="border-t border-dashed border-amber-100 dark:border-gray-800 pt-4 space-y-2 text-right">
                  <h4 className="text-xs font-extrabold text-amber-950 dark:text-amber-300">سرعة تنقل وعرض الصنف المميز (Carousel Speed)</h4>
                  <p className="text-[10px] text-gray-400">حددي زمن عرض الصنف المميز الواحد بالثواني قبل الانتقال التلقائي للصنف المميز التالي:</p>
                  <div className="space-y-1">
                    <input
                      type="number"
                      min={1}
                      max={60}
                      value={featuredSpeed}
                      onChange={(e) => setFeaturedSpeed(Math.max(1, parseInt(e.target.value) || 3))}
                      placeholder="زمن العرض بالثواني (مثال: 3)..."
                      className="w-full px-3.5 py-2.5 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white border border-amber-100 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 text-xs font-bold text-center font-mono"
                    />
                  </div>
                </div>

                {/* Android APK Download URL */}
                <div className="border-t border-dashed border-amber-100 dark:border-gray-800 pt-4 space-y-2 text-right">
                  <h4 className="text-xs font-extrabold text-amber-950 dark:text-amber-300">رابط تحميل تطبيق الأندرويد لمتجر روح</h4>
                  <div className="space-y-1">
                    <input
                      type="url"
                      value={androidApkUrl}
                      onChange={(e) => setAndroidApkUrl(e.target.value)}
                      placeholder="رابط مباشر لملف الـ APK لتنزيل التطبيق تلقائياً..."
                      className="w-full px-3.5 py-2.5 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white border border-amber-100 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 text-xs font-semibold text-left"
                    />
                  </div>
                </div>

                {/* Dynamic OTA App Update URL */}
                <div className="border-t border-dashed border-amber-100 dark:border-gray-800 pt-4 space-y-2 text-right">
                  <div className="flex justify-between items-center">
                    <span className="text-[9px] text-amber-600 dark:text-amber-400 font-bold bg-amber-50 dark:bg-amber-950/40 px-1.5 py-0.5 rounded-full">
                      تحديث فوري صامت (OTA) ⚡
                    </span>
                    <h4 className="text-xs font-extrabold text-amber-950 dark:text-amber-300">رابط توجيه التطبيق الذكي (آخر تحديث Vercel)</h4>
                  </div>
                  <div className="space-y-1">
                    <input
                      type="url"
                      value={currentAppUrl}
                      onChange={(e) => setCurrentAppUrl(e.target.value)}
                      placeholder="رابط النشر الجديد على Vercel (مثلاً: https://your-app.vercel.app)..."
                      className="w-full px-3.5 py-2.5 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white border border-amber-100 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 text-xs font-semibold text-left font-mono"
                    />
                    <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">
                      💡 ضعي هنا الرابط الجديد الذي تم نشره على Vercel، وسيقوم التطبيق بتحويل جميع المستخدمين تلقائياً وبشكل صامت إلى التحديث الجديد فور تشغيل التطبيق دون الحاجة لتنزيل ملف APK جديد! اتركيه فارغاً لتعطيل الميزة.
                    </p>
                  </div>
                </div>

                {/* Android TWA Integration Settings */}
                <div className="border-t border-dashed border-amber-100 dark:border-gray-800 pt-4 space-y-3 text-right">
                  <div className="flex justify-between items-center">
                    <span className="text-[9px] text-amber-600 dark:text-amber-400 font-bold bg-amber-50 dark:bg-amber-950/40 px-1.5 py-0.5 rounded-full font-mono">
                      assetlinks.json 🤖
                    </span>
                    <h4 className="text-xs font-extrabold text-amber-950 dark:text-amber-300">إعدادات إخفاء شريط العنوان في تطبيق الاندرويد (TWA)</h4>
                  </div>
                  <div className="space-y-2">
                    <div>
                      <label className="text-[10px] text-gray-500 font-bold block mb-1">اسم الحزمة للتطبيق (Package Name):</label>
                      <input
                        type="text"
                        value={packageName}
                        onChange={(e) => setPackageName(e.target.value)}
                        placeholder="مثال: com.ruh.store"
                        className="w-full px-3.5 py-2.5 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white border border-amber-100 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 text-xs font-semibold text-left font-mono"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-gray-500 font-bold block mb-1">بصمة التوقيع الرقمي (SHA-256 Certificate Fingerprint):</label>
                      <input
                        type="text"
                        value={sha256Fingerprint}
                        onChange={(e) => setSha256Fingerprint(e.target.value)}
                        placeholder="بصمة SHA-256 للتوقيع الرقمي..."
                        className="w-full px-3.5 py-2.5 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white border border-amber-100 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 text-[10px] font-semibold text-left font-mono"
                      />
                    </div>
                    <p className="text-[9px] text-gray-400 dark:text-gray-500 mt-1 leading-relaxed">
                      💡 هذه الإعدادات تُستخدم لتوليد ملف التحقق الذكي بشكل ديناميكي لتطبيق الأندرويد لكي يتم تصفح المتجر من داخل التطبيق كشاشة كاملة وبدون ظهور شريط متصفح الكروم العلوي المزعج.
                    </p>
                  </div>
                </div>

                <button
                  id="admin-settings-save"
                  type="submit"
                  className="w-full py-2.5 bg-amber-500 hover:bg-amber-600 text-white font-extrabold text-xs rounded-xl shadow transition"
                >
                  حفظ وتطبيق جميع التعديلات وسعر الصرف
                </button>
              </form>

              {/* User Phone Swap Request handler */}
              <div className="border-t border-amber-100 dark:border-gray-800 pt-6 space-y-4 text-right">
                <h4 className="text-xs font-black text-amber-950 dark:text-amber-300">
                  تعديل أرقام هواتف العملاء (يدوي وسحابي)
                </h4>

                <form onSubmit={handleManualPhoneSwap} className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-gray-500 block">رقم الهاتف القديم المسجل:</label>
                    <input
                      id="admin-phone-old"
                      type="text"
                      value={manualOldPhone}
                      onChange={(e) => setManualOldPhone(e.target.value)}
                      placeholder="مثال: 777111222"
                      required
                      className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white border border-amber-100 dark:border-gray-700 rounded-xl focus:outline-none text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-gray-500 block">رقم الهاتف البديل الجديد:</label>
                    <input
                      id="admin-phone-new"
                      type="text"
                      value={manualNewPhone}
                      onChange={(e) => setManualNewPhone(e.target.value)}
                      placeholder="مثال: 733123456"
                      required
                      className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white border border-amber-100 dark:border-gray-700 rounded-xl focus:outline-none text-xs"
                    />
                  </div>
                  <button
                    id="admin-phone-submit"
                    type="submit"
                    className="py-2.5 px-4 bg-amber-800 text-white font-bold text-xs rounded-xl hover:bg-amber-900 transition shadow"
                  >
                    تبديل رقم هاتف العميل
                  </button>
                </form>

                {/* Pending requests queue list */}
                {phoneRequests.length > 0 && (
                  <div className="space-y-2.5">
                    <span className="text-[10px] font-black text-amber-800 dark:text-amber-300 block">طلبات تعديل الاسم/رقم الهاتف وإلغاء ربط الأجهزة المعلقة:</span>
                    <div className="divide-y divide-amber-100 dark:divide-gray-800 bg-amber-500/5 rounded-2xl border border-amber-500/10 p-3 text-xs">
                      {phoneRequests.filter(r => r.status === 'pending').map(req => (
                        <div key={req.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 first:pt-0 last:pb-0">
                          <div className="text-right flex-1 space-y-1">
                            <span className="font-extrabold text-gray-800 dark:text-gray-100 flex items-center gap-1.5 justify-start">
                              <span>العميلة الحالية: {req.userName}</span>
                              {req.type === 'device_unlock' ? (
                                <span className="bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 text-[8px] font-black px-1.5 py-0.5 rounded-md">
                                  طلب تفعيل جهاز 🔓
                                </span>
                              ) : (
                                <span className="bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 text-[8px] font-black px-1.5 py-0.5 rounded-md">
                                  طلب تحديث بيانات الحساب 📝
                                </span>
                              )}
                            </span>
                            
                            {req.type === 'device_unlock' ? (
                              <p className="text-[10px] text-gray-500 leading-relaxed font-semibold">تفعيل رقم الحساب {req.oldPhone} على الجهاز الجديد ID: <code className="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded font-mono">{req.newDeviceId}</code></p>
                            ) : (
                              <div className="text-[10px] text-gray-500 leading-relaxed font-semibold space-y-0.5">
                                {req.newName && req.newName !== req.userName && (
                                  <p>✍️ تغيير الاسم المقترح: <span className="text-amber-800 font-extrabold">{req.userName}</span> ⬅️ <span className="text-emerald-600 font-extrabold">{req.newName}</span></p>
                                )}
                                {req.newPhone && req.newPhone !== req.oldPhone && (
                                  <p>📱 تغيير رقم الهاتف: <span className="text-amber-800 font-extrabold" dir="ltr">{req.oldPhone}</span> ⬅️ <span className="text-emerald-600 font-extrabold" dir="ltr">{req.newPhone}</span></p>
                                )}
                              </div>
                            )}
                          </div>
                          
                          <div className="flex gap-2 shrink-0">
                            <button
                              id={`reject-phone-${req.id}`}
                              onClick={() => handleRejectPhoneReq(req.id)}
                              className="bg-red-500 hover:bg-red-600 text-white text-[10px] font-black px-3 py-1.5 rounded-xl shadow-sm transition"
                            >
                              رفض الطلب ❌
                            </button>
                            <button
                              id={`approve-phone-${req.id}`}
                              onClick={() => handleApprovePhoneReq(req.id)}
                              className="bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-black px-3 py-1.5 rounded-xl shadow-sm transition"
                            >
                              {req.type === 'device_unlock' ? 'تفعيل الجهاز ✅' : 'موافقة وتحديث البيانات ✅'}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Supabase Migration Tool Card */}
              <div className="border-t border-amber-100 dark:border-gray-800 pt-6 space-y-4 text-right">
                <div className="bg-amber-500/10 dark:bg-amber-500/20 p-5 rounded-3xl border border-amber-200 dark:border-amber-900/40 space-y-4">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div>
                      <h4 className="text-xs font-black text-amber-950 dark:text-amber-300">
                        الترحيل السحابي ونقل البيانات بالكامل إلى Supabase 🚀
                      </h4>
                      <p className="text-[10px] text-gray-600 dark:text-gray-400 mt-1 leading-relaxed font-bold">
                        بكبسة زر واحدة، يمكنكِ نقل وترحيل جميع الجداول والبيانات من Firebase Firestore إلى منصة Supabase السحابية الجديدة (بما في ذلك فئات المنتجات، الأصناف والصور، العملاء، الطلبات، والاشعارات وغيرها) لتجنب الحدود المجانية لـ Firebase والاستفادة من السرعة الفائقة لـ Supabase.
                      </p>
                    </div>
                    <span className="shrink-0 text-[10px] font-black bg-amber-500 text-white px-2.5 py-1 rounded-full shadow-xs">
                      ترقية قواعد البيانات 💾
                    </span>
                  </div>

                  {/* Status checklist of steps */}
                  {Object.keys(migrationProgress).length > 0 && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 bg-white dark:bg-gray-900/60 p-3 rounded-2xl border border-amber-100/50 dark:border-gray-800 text-right">
                      {Object.entries(migrationProgress).map(([key, value]) => {
                        const val = value as MigrationProgress;
                        return (
                          <div key={key} className="flex items-center justify-between gap-2 p-1.5 text-[11px] font-bold">
                            <span className="text-gray-500 dark:text-gray-400">{val.step}:</span>
                            <span className={`px-2 py-0.5 rounded-lg text-[9px] font-black ${
                              val.status === 'success' 
                                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400' 
                                : val.status === 'error' 
                                ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400' 
                                : 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 animate-pulse'
                            }`}>
                              {val.status === 'success' && `تم نقل ${val.count} بنجاح ✅`}
                              {val.status === 'error' && 'فشل النقل ❌'}
                              {val.status === 'running' && `${val.message}`}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Live Log Console Box */}
                  {migrationLogs.length > 0 && (
                    <div className="bg-gray-950 text-emerald-400 p-4 rounded-2xl font-mono text-[9px] leading-relaxed max-h-48 overflow-y-auto text-left dir-ltr shadow-inner space-y-1">
                      {migrationLogs.map((log, idx) => (
                        <div key={idx} className="whitespace-pre-wrap">{log}</div>
                      ))}
                    </div>
                  )}

                  <div className="flex flex-col sm:flex-row gap-3 pt-2">
                    <button
                      id="supabase-copy-schema-btn"
                      type="button"
                      onClick={handleCopySchema}
                      className="py-3 px-4 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-200 font-extrabold text-xs rounded-2xl hover:scale-[1.01] transition shadow-sm flex items-center justify-center gap-2 cursor-pointer border border-gray-200 dark:border-gray-700 sm:w-auto"
                    >
                      <Copy size={14} className="text-gray-500" />
                      <span>نسخ كود SQL لتهيئة الجداول 📋</span>
                    </button>

                    <button
                      id="supabase-migration-btn"
                      type="button"
                      disabled={isMigratingSupabase}
                      onClick={handleSupabaseMigration}
                      className="flex-1 py-3 px-4 bg-amber-600 hover:bg-amber-700 disabled:bg-gray-300 dark:disabled:bg-gray-800 disabled:text-gray-500 text-white font-extrabold text-xs rounded-2xl hover:scale-[1.01] transition shadow-md flex items-center justify-center gap-2 cursor-pointer"
                    >
                      {isMigratingSupabase ? (
                        <>
                          <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                          </svg>
                          <span>جاري ترحيل البيانات ونقلها الآن...</span>
                        </>
                      ) : (
                        <>
                          <span>البدء في نقل وترحيل البيانات فوراً لـ Supabase ⚡</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* LOCATIONS & DELIVERY FEES MANAGEMENT */}
          {activeTab === 'locations' && (
            <div className="bg-white dark:bg-gray-900 p-6 rounded-3xl border border-amber-100/40 dark:border-gray-800 shadow-sm space-y-6">
              <h3 className="text-xs font-black text-amber-950 dark:text-amber-300 border-b border-amber-50 dark:border-gray-800 pb-2 text-right">
                إدارة عناوين التوصيل ورسوم الشحن 📍
              </h3>

              <form onSubmit={handleSaveLocation} className="space-y-4 text-right">
                <div className="bg-amber-500/5 p-4 rounded-2xl border border-amber-100/30 space-y-4">
                  <span className="text-[10px] font-black text-amber-900 dark:text-amber-300 block">حدد منطقة من العناوين التي سجلها العملاء في المتجر أو أدخل عنواناً مخصصاً:</span>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-gray-700 dark:text-gray-300 block">عناوين مسجلة بواسطة العملاء الحاليين:</label>
                      <select
                        id="client-address-select"
                        value={selectedClientAddress}
                        onChange={(e) => {
                          const val = e.target.value;
                          setSelectedClientAddress(val);
                          if (val && val !== 'custom') {
                            setNewLocName(val);
                          } else {
                            setNewLocName('');
                          }
                        }}
                        className="w-full px-3.5 py-2.5 bg-white dark:bg-gray-800 text-gray-900 dark:text-white border border-amber-100 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 text-xs font-semibold"
                      >
                        <option value="">-- اختر منطقة من عناوين العملاء --</option>
                        {Array.from(new Set([
                          ...users.map(u => u.address),
                          ...orders.map(o => o.address)
                        ].map(addr => {
                          if (!addr) return '';
                          return addr.split(/[-—,]/)[0].trim();
                        }).filter(Boolean))).map((region, idx) => {
                          const matchedFullAddr = [...users, ...orders].find(item => item.address && item.address.startsWith(region))?.address;
                          const label = matchedFullAddr && matchedFullAddr !== region 
                            ? `${region} (مثال: ${matchedFullAddr})` 
                            : region;
                          return (
                            <option key={idx} value={region}>{label}</option>
                          );
                        })}
                        <option value="custom">✍️ إدخال يدوي لعنوان مخصص جديد...</option>
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-bold text-gray-700 dark:text-gray-300 block">اسم المنطقة (المعتمد):</label>
                      <input
                        id="loc-name-input"
                        type="text"
                        value={newLocName}
                        onChange={(e) => {
                          setNewLocName(e.target.value);
                          setSelectedClientAddress('custom');
                        }}
                        placeholder="مثال: صنعاء أو عدن أو تعز"
                        required
                        className="w-full px-3.5 py-2.5 bg-white dark:bg-gray-800 text-gray-900 dark:text-white border border-amber-100 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 text-xs font-semibold"
                      />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-700 dark:text-gray-300 block">رسوم التوصيل لهذه المنطقة (بالريال اليمني الجديد YER_NEW):</label>
                    <input
                      id="loc-fee-input"
                      type="number"
                      value={newLocFee}
                      onChange={(e) => setNewLocFee(Number(e.target.value))}
                      placeholder="مثال: 1000"
                      required
                      min="0"
                      className="w-full px-3.5 py-2.5 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white border border-amber-100 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 text-xs font-semibold"
                    />
                  </div>
                  
                  <div className="flex items-end justify-end">
                    <button
                      id="submit-location-btn"
                      type="submit"
                      className="w-full md:w-auto py-2.5 px-8 bg-amber-800 hover:bg-amber-900 text-white font-extrabold text-xs rounded-xl hover:bg-amber-900 transition shadow"
                    >
                      حفظ العنوان والرسوم 💾
                    </button>
                  </div>
                </div>
              </form>

              {/* Locations List */}
              <div className="space-y-3">
                <div className="border-b pb-1">
                  <h4 className="text-xs font-extrabold text-amber-950 dark:text-amber-300">قائمة العناوين المعتمدة ورسوم التوصيل الحالية</h4>
                </div>

                {locations.length === 0 ? (
                  <div className="text-center py-6 text-xs text-gray-400 font-bold">
                    لا توجد عناوين توصيل مضافة حالياً. يرجى إضافة عناوين معينة وتخصيص الرسوم لها.
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-2xl border border-amber-100/50 dark:border-gray-800 bg-amber-500/5">
                    <table className="w-full text-right text-xs">
                      <thead>
                        <tr className="bg-amber-100/40 dark:bg-gray-800 text-amber-900 dark:text-amber-300 font-black">
                          <th className="p-3">اسم المنطقة / العنوان</th>
                          <th className="p-3">رسوم التوصيل (المحلية)</th>
                          <th className="p-3">رسوم التوصيل (بالعملة المحددة للعميل)</th>
                          <th className="p-3 text-center">إجراءات</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-amber-100/30 dark:divide-gray-800">
                        {locations.map((loc) => (
                          <tr key={loc.id} className="hover:bg-amber-100/10 dark:hover:bg-gray-800/40 font-bold">
                            <td className="p-3 text-gray-900 dark:text-gray-100">{loc.name}</td>
                            <td className="p-3 text-amber-800 dark:text-amber-400">{loc.deliveryFee} ريال يمني جديد</td>
                            <td className="p-3 text-gray-500 text-[11px]">
                              {rates && (
                                <>
                                  {Math.round(loc.deliveryFee / rates.yerOldFactor)} ريال قديم | {Math.round(loc.deliveryFee / rates.sarFactor)} ريال سعودي
                                </>
                              )}
                            </td>
                            <td className="p-3 text-center">
                              <button
                                id={`delete-loc-${loc.id}`}
                                onClick={() => handleDeleteLocation(loc.id)}
                                className="p-1.5 bg-red-100 dark:bg-red-950/40 text-red-600 hover:bg-red-200 rounded-xl transition text-[10px] font-extrabold"
                              >
                                حذف 🗑️
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 2. ADD CATEGORIES */}
          {activeTab === 'categories' && (
            <div className="bg-white dark:bg-gray-900 p-6 rounded-3xl border border-amber-100/40 dark:border-gray-800 shadow-sm space-y-6">
              <h3 className="text-xs font-black text-amber-950 dark:text-amber-300 border-b border-amber-50 dark:border-gray-800 pb-2 text-right flex justify-between items-center">
                {editingCategory && (
                  <button
                    onClick={handleCancelCategoryEdit}
                    className="text-[10px] bg-red-500/10 text-red-700 dark:bg-red-950/30 dark:text-red-400 px-2 py-1 rounded-md hover:bg-red-200 transition"
                  >
                    إلغاء التعديل ❌
                  </button>
                )}
                <span>{editingCategory ? 'تعديل الفئة الحالية' : 'إضافة فئة جديدة في المتجر'}</span>
              </h3>

              <form onSubmit={handleAddCategorySubmit} className="space-y-4 text-right">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-700 dark:text-gray-300 block">اسم الفئة:</label>
                    <input
                      id="admin-cat-name"
                      type="text"
                      value={newCatName}
                      onChange={(e) => setNewCatName(e.target.value)}
                      placeholder="مثال: حقائب نسائية"
                      required
                      className="w-full px-3.5 py-2.5 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white border border-amber-100 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 text-xs font-semibold"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-700 dark:text-gray-300 block">رمز الفئة (كود إنجليزي مميز):</label>
                    <input
                      id="admin-cat-code"
                      type="text"
                      value={newCatCode}
                      onChange={(e) => setNewCatCode(e.target.value)}
                      placeholder="مثال: CAT_BAGS"
                      required
                      disabled={!!editingCategory}
                      className="w-full px-3.5 py-2.5 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white border border-amber-100 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 text-xs font-bold uppercase disabled:opacity-55"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-700 dark:text-gray-300 block">صورة الفئة (رابط URL):</label>
                  <input
                    id="admin-cat-img"
                    type="url"
                    value={newCatImage}
                    onChange={(e) => setNewCatImage(e.target.value)}
                    placeholder="رابط صورة عالية الجودة لتمثيل الفئة"
                    required
                    className="w-full px-3.5 py-2.5 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white border border-amber-100 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 text-xs"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-700 dark:text-gray-300 block">ترتيب عرض الفئة (رقم لترتيب الفئات بعد خيار الكل):</label>
                  <input
                    id="admin-cat-sortorder"
                    type="number"
                    value={newCatSortOrder}
                    onChange={(e) => setNewCatSortOrder(e.target.value)}
                    placeholder="مثال: 1 لتبدأ أول فئة، أو 2، أو 3"
                    required
                    className="w-full px-3.5 py-2.5 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white border border-amber-100 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 text-xs font-bold"
                  />
                </div>

                {/* Visibility Toggle */}
                <div className="flex items-center gap-2 bg-gray-50 dark:bg-gray-800 p-2.5 rounded-xl border border-amber-100/30 dark:border-gray-800">
                  <input
                    id="admin-cat-hidden-toggle"
                    type="checkbox"
                    checked={newCatIsHidden}
                    onChange={(e) => setNewCatIsHidden(e.target.checked)}
                    className="w-4.5 h-4.5 text-amber-500 rounded border-amber-300 focus:ring-amber-500 cursor-pointer"
                  />
                  <label htmlFor="admin-cat-hidden-toggle" className="text-xs font-black text-gray-700 dark:text-gray-300 cursor-pointer select-none">
                    إخفاء هذه الفئة بالكامل عن العملاء 👁️‍🗨️ (تعطيل الظهور في المتجر)
                  </label>
                </div>

                <button
                  id="admin-cat-submit"
                  type="submit"
                  className="w-full py-2.5 bg-amber-500 hover:bg-amber-600 text-white font-extrabold text-xs rounded-xl shadow transition"
                >
                  {editingCategory ? 'حفظ وتحديث الفئة الحالية 💾' : 'حفظ وإدراج الفئة الجديدة'}
                </button>
              </form>

              {/* Categories list */}
              <div className="space-y-3.5 text-right border-t border-amber-100 dark:border-gray-800 pt-5">
                <span className="text-[10px] font-black text-gray-400 block">الفئات المتاحة حالياً بالمتجر:</span>
                
                <div className="grid grid-cols-2 gap-3">
                  {categories.map(c => (
                    <div key={c.id} className="bg-amber-50/20 dark:bg-gray-800/40 p-3 rounded-2xl border border-amber-100/10 dark:border-gray-800 flex flex-col justify-between gap-2.5">
                      <div className="flex items-center gap-3">
                        <img src={c.image} alt={c.name} className="w-10 h-10 rounded-xl object-cover shrink-0" />
                        <div className="min-w-0">
                          <h4 className="text-xs font-extrabold text-gray-900 dark:text-white truncate flex items-center gap-1">
                            <span>{c.name}</span>
                            {c.isHidden && (
                              <span className="bg-rose-500/10 text-rose-600 dark:text-rose-400 px-1 py-0.5 rounded text-[8px] font-black">مخفية 🔒</span>
                            )}
                          </h4>
                          <span className="text-[9px] font-bold text-gray-400 block truncate">{c.id} ({c.productCount} صنف)</span>
                          <span className="text-[9px] font-extrabold text-amber-600 dark:text-amber-400 block">ترتيب العرض: {c.sortOrder || 0}</span>
                        </div>
                      </div>
                      <div className="flex gap-1.5 border-t border-amber-500/5 dark:border-gray-800/60 pt-2 justify-end">
                        <button
                          type="button"
                          onClick={() => handleEditCategoryClick(c)}
                          className="bg-amber-500/10 hover:bg-amber-500/20 text-amber-900 dark:text-amber-400 px-2 py-1 rounded-lg text-[9px] font-bold transition"
                        >
                          تعديل ✏️
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteCategory(c.id)}
                          className="bg-red-500/10 hover:bg-red-500/20 text-red-700 dark:text-red-400 px-2 py-1 rounded-lg text-[9px] font-bold transition"
                        >
                          حذف 🗑️
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* 3. ADD PRODUCTS */}
          {activeTab === 'products' && (
            <div className="bg-white dark:bg-gray-900 p-6 rounded-3xl border border-amber-100/40 dark:border-gray-800 shadow-sm space-y-6">
              <h3 className="text-xs font-black text-amber-950 dark:text-amber-300 border-b border-amber-50 dark:border-gray-800 pb-2 text-right flex justify-between items-center">
                {editingProduct && (
                  <button
                    type="button"
                    onClick={handleCancelProductEdit}
                    className="text-[10px] bg-red-500/10 text-red-700 dark:bg-red-950/30 dark:text-red-400 px-2 py-1 rounded-md hover:bg-red-200 transition"
                  >
                    إلغاء التعديل ❌
                  </button>
                )}
                <span>{editingProduct ? 'تعديل بيانات الصنف الحالي' : 'إضافة أصناف ومنتجات جديدة'}</span>
              </h3>

              <form onSubmit={handleAddProductSubmit} className="space-y-5 text-right">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-700 dark:text-gray-300 block">اختر الفئة المخصصة:</label>
                    <select
                      id="admin-prod-cat"
                      value={prodCatId}
                      onChange={(e) => setProdCatId(e.target.value)}
                      required
                      className="w-full px-3.5 py-2.5 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white border border-amber-100 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 text-xs font-bold"
                    >
                      <option value="">-- اختري الفئة --</option>
                      {categories.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-700 dark:text-gray-300 block">رمز الصنف (رمز فريد للإدارة):</label>
                    <input
                      id="admin-prod-code"
                      type="text"
                      value={prodCode}
                      onChange={(e) => setProdCode(e.target.value)}
                      placeholder="مثال: SH-BR-01"
                      required
                      className="w-full px-3.5 py-2.5 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white border border-amber-100 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 text-xs font-bold uppercase"
                    />
                  </div>
                </div>

                {/* Multiple sub-categories selection */}
                <div className="space-y-1 bg-amber-500/5 dark:bg-gray-800/30 p-4 rounded-2xl border border-amber-100/30 dark:border-gray-800">
                  <label className="text-xs font-black text-amber-950 dark:text-amber-300 block mb-2">تحديد الفئات الإضافية والفرعية لهذا المنتج (لتسهيل البحث والوصول للمنتج من فئات متعددة):</label>
                  {categories.length <= 1 ? (
                    <p className="text-[10px] text-gray-400">لا توجد فئات أخرى مضافة بالمتجر حالياً لتعيينها كفئات فرعية.</p>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                      {categories
                        .filter(c => c.id !== prodCatId) // exclude main category
                        .map(c => {
                          const isChecked = prodSubCatIds.includes(c.id);
                          return (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => {
                                if (isChecked) {
                                  setProdSubCatIds(prev => prev.filter(id => id !== c.id));
                                } else {
                                  setProdSubCatIds(prev => [...prev, c.id]);
                                }
                              }}
                              className={`flex items-center gap-2 p-2 rounded-xl text-xs font-bold transition border text-right justify-start ${
                                isChecked
                                  ? 'bg-amber-500 text-white border-amber-500 shadow-sm'
                                  : 'bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-100 dark:border-gray-700 hover:bg-amber-500/5'
                              }`}
                            >
                              <span className="shrink-0 w-4 h-4 rounded bg-white/20 border border-current flex items-center justify-center text-[10px] font-black">
                                {isChecked ? '✓' : ''}
                              </span>
                              <span className="truncate">{c.name}</span>
                            </button>
                          );
                        })}
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="md:col-span-2 space-y-1">
                    <label className="text-xs font-bold text-gray-700 dark:text-gray-300 block">اسم الصنف المعروض:</label>
                    <input
                      id="admin-prod-name"
                      type="text"
                      value={prodName}
                      onChange={(e) => setProdName(e.target.value)}
                      placeholder="مثال: حذاء كعب عالي ذهبي فاخر"
                      required
                      className="w-full px-3.5 py-2.5 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white border border-amber-100 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 text-xs font-semibold"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-700 dark:text-gray-300 block">السعر (بالريال اليمني الجديد):</label>
                    <input
                      id="admin-prod-price"
                      type="number"
                      value={prodPrice || ''}
                      onChange={(e) => setProdPrice(parseFloat(e.target.value) || 0)}
                      placeholder="مثال: 4500"
                      required
                      className="w-full px-3.5 py-2.5 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white border border-amber-100 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 text-xs font-bold"
                    />
                  </div>
                </div>

                {/* Offer Toggle */}
                <div className="bg-amber-500/5 p-4 rounded-2xl border border-amber-500/10 flex justify-between items-center">
                  <div className="text-right">
                    <h4 className="text-xs font-extrabold text-amber-950 dark:text-amber-300">هل هناك عرض ترويجي خاص على هذا الصنف؟</h4>
                    <p className="text-[10px] text-gray-400">سيتم إدراجه تلقائياً في تبويب العروض بصفحة منفصلة.</p>
                  </div>
                  
                  <div className="flex items-center gap-3">
                    {prodOnOffer && (
                      <input
                        id="admin-prod-offer-price"
                        type="number"
                        placeholder="السعر الجديد المخفض"
                        value={prodOfferPrice || ''}
                        onChange={(e) => setProdOfferPrice(parseFloat(e.target.value) || 0)}
                        className="px-3 py-1.5 w-36 bg-white dark:bg-gray-800 text-gray-950 dark:text-white border rounded-xl text-xs font-bold text-center"
                      />
                    )}
                    
                    <button
                      id="admin-prod-offer-toggle"
                      type="button"
                      onClick={() => setProdOnOffer(!prodOnOffer)}
                      className={`px-4 py-2 text-xs font-black rounded-xl transition ${
                        prodOnOffer ? 'bg-amber-500 text-white shadow-sm' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {prodOnOffer ? 'عرض نشط ✅' : 'تفعيل'}
                    </button>
                  </div>
                </div>

                {/* Featured Product Toggle */}
                <div className="bg-rose-500/5 p-4 rounded-2xl border border-rose-500/10 flex justify-between items-center text-right">
                  <div>
                    <h4 className="text-xs font-extrabold text-rose-950 dark:text-rose-300">هل ترغبين بوضع هذا الصنف كـ "صنف مميز"؟ 🌟</h4>
                    <p className="text-[10px] text-gray-400">سيتم عرضه تلقائياً بجانب شريط البحث الرئيسي في الصفحة الرئيسية للمتجر.</p>
                  </div>
                  
                  <div className="flex items-center gap-3">
                    <button
                      id="admin-prod-featured-toggle"
                      type="button"
                      onClick={() => setProdIsFeatured(!prodIsFeatured)}
                      className={`px-4 py-2 text-xs font-black rounded-xl transition ${
                        prodIsFeatured ? 'bg-rose-500 text-white shadow-sm' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {prodIsFeatured ? 'مميز نشط 🌟' : 'تفعيل'}
                    </button>
                  </div>
                </div>

                {/* Description */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-700 dark:text-gray-300 block">وصف الصنف بالتفصيل (يدعم إيموجيات و عريض بين نجمين *مثال*):</label>
                  <textarea
                    id="admin-prod-desc"
                    value={prodDesc}
                    onChange={(e) => setProdDesc(e.target.value)}
                    placeholder="اكتبي مميزات الصنف بالتفصيل هنا..."
                    rows={4}
                    required
                    className="w-full px-3.5 py-2.5 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white border border-amber-100 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 text-xs font-semibold leading-relaxed"
                  />
                </div>

                {/* Attributes Checkboxes and values additions */}
                <div className="border-t border-dashed border-amber-100 dark:border-gray-800 pt-4 space-y-4">
                  <h4 className="text-xs font-extrabold text-amber-950 dark:text-amber-300">أعمدة خصائص الصنف النشطة للتخصيص:</h4>
                  
                  <div className="flex flex-wrap gap-3">
                    {Object.keys(activeProperties).map(prop => (
                      <label key={prop} className="flex items-center gap-2.5 bg-gray-50 dark:bg-gray-800 px-3 py-2 rounded-xl border border-amber-100/50 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={activeProperties[prop]}
                          onChange={(e) => setActiveProperties(prev => ({ ...prev, [prop]: e.target.checked }))}
                          className="rounded border-amber-300 text-amber-500 focus:ring-amber-500"
                        />
                        <span className="text-xs font-bold text-gray-700 dark:text-gray-300">{prop}</span>
                      </label>
                    ))}
                  </div>

                  {/* Attribute options creation boxes */}
                  {Object.entries(activeProperties).some(([_, active]) => active) && (
                    <div className="bg-amber-500/5 p-4 rounded-2xl border border-amber-500/10 space-y-4">
                      <span className="text-[10px] font-black text-amber-900 block">أدخلي الخيارات المتاحة للخصائص المفعلة:</span>
                      
                      {Object.entries(activeProperties).filter(([_, active]) => active).map(([propName]) => (
                        <div key={propName} className="space-y-2 border-b border-amber-100/30 pb-3 last:border-b-0 last:pb-0">
                          <div className="flex justify-between items-center">
                            <span className="text-xs font-extrabold text-amber-950 dark:text-amber-300">{propName}:</span>
                            <button
                              id={`add-prop-val-${propName}`}
                              type="button"
                              onClick={() => handleAddValueToProp(propName)}
                              className="text-[10px] bg-white dark:bg-gray-800 px-2 py-1 rounded-md shadow border border-amber-200 text-amber-800 font-bold hover:border-amber-400"
                            >
                              + خيار جديد
                            </button>
                          </div>

                          <div className="flex flex-wrap gap-2">
                            {propertiesValues[propName].map((val, idx) => (
                              <div key={idx} className="flex items-center gap-1 bg-white dark:bg-gray-800 rounded-lg p-1 border">
                                <input
                                  type="text"
                                  value={val}
                                  onChange={(e) => handlePropValueChange(propName, idx, e.target.value)}
                                  placeholder="مثل: 38"
                                  className="w-16 px-1 py-0.5 border-0 focus:outline-none text-xs text-center font-bold bg-transparent"
                                />
                                {propertiesValues[propName].length > 1 && (
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveValueFromProp(propName, idx)}
                                    className="text-red-500 p-0.5"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Images Upload */}
                <div className="border-t border-dashed border-amber-100 dark:border-gray-800 pt-4 space-y-3.5">
                  <h4 className="text-xs font-extrabold text-amber-950 dark:text-amber-300">رابط صورة الصنف من جوجل درايف (أو رابط مباشر):</h4>
                  
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newImageUrl}
                      onChange={(e) => setNewImageUrl(e.target.value)}
                      placeholder="ألصقي رابط مشاركة الصورة من جوجل درايف هنا..."
                      className="flex-1 px-3 py-2 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white border border-amber-100 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 text-xs font-medium text-right"
                    />
                    <button
                      type="button"
                      onClick={handleAddProductImgUrl}
                      className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs rounded-xl shadow transition cursor-pointer"
                    >
                      إضافة ➕
                    </button>
                  </div>
                  <p className="text-[10px] text-gray-400 font-medium">
                    * يمكنكِ إضافة صور متعددة بالرابط. سيتم تحويل روابط Google Drive تلقائياً لعرض الصورة مباشرة بالمتجر!
                  </p>

                  {/* Device file upload block with Google Drive capability */}
                  <div className="bg-amber-500/5 dark:bg-gray-800/40 p-4 rounded-2xl border border-amber-500/10 dark:border-gray-800 space-y-3">
                    <div className="flex items-center gap-1.5 text-amber-950 dark:text-amber-200 font-extrabold text-xs">
                      <span className="text-sm">📷</span>
                      <span>رفع صورة مباشرة من جهازكِ</span>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-2.5 items-center justify-between">
                      <div className="relative w-full sm:w-auto shrink-0">
                        <input
                          id="admin-product-file-input"
                          type="file"
                          accept="image/*"
                          onChange={handleProductImgUpload}
                          className="hidden"
                        />
                        <label
                          htmlFor="admin-product-file-input"
                          className="inline-flex items-center justify-center gap-1.5 w-full sm:w-auto px-4 py-2 bg-amber-800 hover:bg-amber-900 text-white rounded-xl text-xs font-black cursor-pointer shadow-sm transition"
                        >
                          {uploadingProdImage ? (
                            <span className="animate-spin border-2 border-white border-t-transparent rounded-full w-3.5 h-3.5" />
                          ) : (
                            <Upload className="w-3.5 h-3.5" />
                          )}
                          <span>{uploadingProdImage ? 'جاري الرفع والتحويل...' : 'اختيار صورة ورفعها 📷'}</span>
                        </label>
                      </div>

                      {googleUser ? (
                        <div className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1">
                          <span>✅ حساب جوجل متصل! سيتم الرفع تلقائياً وبأمان إلى Google Drive وتخزين روابطه فقط في المنصة الجديدة.</span>
                        </div>
                      ) : (
                        <div className="flex flex-col sm:flex-row items-center gap-2 w-full sm:w-auto">
                          <span className="text-[10px] text-gray-500 dark:text-gray-400 text-center sm:text-right">اربطي حساب جوجل لرفع صور غير محدودة مباشرة على درايف:</span>
                          <button
                            type="button"
                            onClick={handleGoogleSignIn}
                            className="px-3 py-1.5 bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-xl text-gray-750 dark:text-gray-300 font-bold text-[10px] transition flex items-center gap-1 shrink-0"
                          >
                            <svg className="w-3 h-3 shrink-0" viewBox="0 0 48 48">
                              <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
                              <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
                              <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
                              <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
                            </svg>
                            <span>ربط جوجل درايف</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex gap-3 items-center flex-wrap pt-2">
                    {prodImages.map((img, idx) => (
                      <div key={idx} className="relative w-20 h-20 rounded-2xl overflow-hidden border">
                        <img src={img} alt="منتج" className="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={() => setProdImages(prev => prev.filter((_, i) => i !== idx))}
                          className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-0.5 shadow-md cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Save Product */}
                <button
                  id="admin-prod-submit"
                  type="submit"
                  className="w-full py-3 bg-gradient-to-l from-amber-600 to-amber-700 hover:from-amber-700 hover:to-amber-800 text-white font-extrabold text-xs rounded-xl shadow transition"
                >
                  {editingProduct ? 'حفظ وتحديث الصنف الحالي 💾' : 'إدراج وحفظ الصنف الجديد سحابياً'}
                </button>
              </form>

              {/* Products Directory */}
              <div className="border-t border-amber-100 dark:border-gray-800 pt-6 space-y-4 text-right">
                <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3">
                  <span className="text-[10px] font-black text-gray-400 block">الأصناف المدرجة بالمتجر حالياً ({products.length}):</span>
                  
                  {/* Modern Search input */}
                  <div className="relative w-full sm:w-72">
                    <input
                      type="text"
                      value={adminProdSearch}
                      onChange={(e) => setAdminProdSearch(e.target.value)}
                      placeholder="🔍 ابحثي باسم الصنف أو الكود أو الفئة..."
                      className="w-full px-3.5 py-2 bg-gray-50 dark:bg-gray-850 text-gray-900 dark:text-white border border-amber-100 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 text-xs font-semibold text-right"
                    />
                  </div>
                </div>
                
                <div className="flex flex-col gap-3">
                  {products
                    .filter(p => {
                      if (!adminProdSearch.trim()) return true;
                      const term = adminProdSearch.toLowerCase().trim();
                      return (
                        p.name.toLowerCase().includes(term) ||
                        p.code.toLowerCase().includes(term) ||
                        (p.categoryName && p.categoryName.toLowerCase().includes(term))
                      );
                    })
                    .map(p => (
                    <div key={p.id} className="p-3 bg-white dark:bg-gray-900 border border-amber-100/30 dark:border-gray-800 rounded-2xl flex flex-col sm:flex-row justify-between sm:items-center gap-3 text-right shadow-sm transition hover:border-amber-200/50">
                      <div className="flex items-center gap-3 min-w-0">
                        <img src={p.images[0]} alt={p.name} className="w-12 h-12 rounded-xl object-cover bg-white p-1 shrink-0 border border-amber-100/30" />
                        <div className="text-right min-w-0 flex-1">
                          <h4 className="text-xs font-extrabold text-gray-900 dark:text-gray-100 truncate max-w-[200px] sm:max-w-xs">{p.name}</h4>
                          <div className="flex flex-wrap gap-1.5 mt-1">
                            <span className="text-[9px] text-gray-500 dark:text-gray-400 bg-amber-500/5 font-extrabold px-1.5 py-0.5 rounded-md">
                              كود: {p.code}
                            </span>
                            <span className="text-[9px] text-amber-800 dark:text-amber-300 bg-amber-500/10 font-extrabold px-1.5 py-0.5 rounded-md">
                              {p.categoryName}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 pt-2 sm:pt-0 border-t border-dashed border-amber-100/30 sm:border-t-0">
                        <div className="text-right">
                          <span className="text-[9px] text-gray-400 block sm:hidden">السعر:</span>
                          <span className="text-xs font-black text-amber-800 dark:text-amber-400">
                            {p.priceYERNew} {getCurrencyCode('YER_NEW')}
                          </span>
                        </div>
                        
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleEditProductClick(p)}
                            className="p-2 hover:bg-amber-100 hover:text-amber-700 text-gray-500 dark:hover:bg-amber-950/40 rounded-xl transition border border-transparent hover:border-amber-200/40"
                            title="تعديل الصنف"
                          >
                            <EditIcon className="w-4 h-4" />
                          </button>

                          <button
                            id={`delete-prod-${p.id}`}
                            onClick={() => handleDeleteProduct(p.id)}
                            className="p-2 hover:bg-red-50 hover:text-red-600 text-gray-400 dark:hover:bg-red-950/40 rounded-xl transition border border-transparent hover:border-red-200/40"
                            title="حذف الصنف"
                          >
                            <Trash2Icon className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* 4. OFFERS AND SLIDER */}
          {activeTab === 'offers' && (
            <div className="bg-white dark:bg-gray-900 p-6 rounded-3xl border border-amber-100/40 dark:border-gray-800 shadow-sm space-y-6">
              <h3 className="text-xs font-black text-amber-950 dark:text-amber-300 border-b border-amber-50 dark:border-gray-800 pb-2 text-right">
                إعدادات عروض السلايدر التلقائي والبطاقات الترويجية
              </h3>

              <form onSubmit={handleUpdateOfferSubmit} className="space-y-4 text-right">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-700 dark:text-gray-300 block">اختر صنف موجود لترقيته كعرض ترويجي:</label>
                    <select
                      id="admin-offer-prod"
                      value={selectedOfferProdId}
                      onChange={(e) => {
                        setSelectedOfferProdId(e.target.value);
                        const match = products.find(p => p.id === e.target.value);
                        if (match) setOfferPromoPrice(match.priceYERNew * 0.8); // pre-fill 20% discount
                      }}
                      required
                      className="w-full px-3.5 py-2.5 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white border border-amber-100 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 text-xs font-bold"
                    >
                      <option value="">-- اختري صنف من الكتالوج --</option>
                      {products.map(p => (
                        <option key={p.id} value={p.id}>{p.name} (سعر: {p.priceYERNew})</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-700 dark:text-gray-300 block">السعر الترويجي الجديد المخفض:</label>
                    <input
                      id="admin-offer-promo"
                      type="number"
                      value={offerPromoPrice || ''}
                      onChange={(e) => setOfferPromoPrice(parseFloat(e.target.value) || 0)}
                      required
                      className="w-full px-3.5 py-2.5 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white border border-amber-100 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 text-xs font-bold"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-700 dark:text-gray-300 block">إضافة صورة ترويجية جديدة إلى سلايدر المتجر التلقائي (رابط URL):</label>
                  <input
                    id="admin-offer-banner"
                    type="url"
                    value={newOfferBanner}
                    onChange={(e) => setNewOfferBanner(e.target.value)}
                    placeholder="رابط صورة بانر ترويجية عريضة مناسبة للسلايدر"
                    className="w-full px-3.5 py-2.5 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white border border-amber-100 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 text-xs"
                  />
                </div>

                <button
                  id="admin-offer-submit"
                  type="submit"
                  className="w-full py-2.5 bg-amber-500 hover:bg-amber-600 text-white font-extrabold text-xs rounded-xl shadow transition"
                >
                  حفظ العرض الترويجي وإدراج البانر في السلايدر
                </button>
              </form>

              {/* Banners Slider Archive list */}
              <div className="border-t border-amber-100 dark:border-gray-800 pt-5 text-right space-y-3.5">
                <span className="text-[10px] font-black text-gray-400 block">صور السلايدر التلقائي المسجلة حالياً:</span>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {offerImages.map((banner, idx) => (
                    <div key={idx} className="relative rounded-2xl overflow-hidden border shadow-sm group">
                      <img src={banner} alt="بانر عروض" className="w-full h-24 object-cover" />
                      <button
                        onClick={() => handleRemoveOfferBanner(banner)}
                        className="absolute top-2 right-2 bg-red-500 hover:bg-red-600 text-white rounded-xl p-1.5 shadow"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* archived events / event history section */}
              <div className="border-t border-amber-100 dark:border-gray-800 pt-6 text-right space-y-4">
                <div>
                  <h3 className="text-xs font-black text-amber-950 dark:text-amber-300 flex items-center gap-1">
                    <span>🏆</span> قسم تاريخ الأحداث والمسابقات المؤرشفة (Event History)
                  </h3>
                  <p className="text-[10px] text-gray-400 mt-1">
                    أرشفي مسابقاتكِ السابقة والجوائز التي تم تسليمها لتوثيق المصداقية وعرضها في السلايدر التلقائي الرئيسي للجمهور.
                  </p>
                </div>

                <form onSubmit={handleAddArchivedEvent} className="bg-gray-50 dark:bg-gray-950/40 p-4 rounded-2xl border border-gray-100 dark:border-gray-800 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[10px] text-gray-500 font-bold block">اسم الفعالية / المسابقة:</label>
                      <input 
                        type="text" 
                        value={newArchivedEventName} 
                        onChange={(e) => setNewArchivedEventName(e.target.value)} 
                        placeholder="مثال: مسابقة رمضان الكبرى 🌙"
                        className="w-full bg-white dark:bg-gray-800 text-[11px] py-2 px-3 border rounded-xl focus:outline-none focus:ring-1 focus:ring-amber-500 font-bold"
                        required
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] text-gray-500 font-bold block">اسم الفائز بالمركز الأول:</label>
                      <input 
                        type="text" 
                        value={newArchivedEventWinner} 
                        onChange={(e) => setNewArchivedEventWinner(e.target.value)} 
                        placeholder="مثال: أم طارق محمد"
                        className="w-full bg-white dark:bg-gray-800 text-[11px] py-2 px-3 border rounded-xl focus:outline-none focus:ring-1 focus:ring-amber-500 font-bold"
                        required
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] text-gray-500 font-bold block">مبلغ الجائزة الهدية:</label>
                      <input 
                        type="number" 
                        value={newArchivedEventAmount || ''} 
                        onChange={(e) => setNewArchivedEventAmount(parseFloat(e.target.value) || 0)} 
                        placeholder="مثال: 50000"
                        className="w-full bg-white dark:bg-gray-800 text-[11px] py-2 px-3 border rounded-xl focus:outline-none focus:ring-1 focus:ring-amber-500 font-bold"
                        required
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] text-gray-500 font-bold block">عملة الجائزة:</label>
                      <select 
                        value={newArchivedEventCurrency} 
                        onChange={(e) => setNewArchivedEventCurrency(e.target.value as Currency)} 
                        className="w-full bg-white dark:bg-gray-800 text-[11px] py-2 px-3 border rounded-xl focus:outline-none focus:ring-1 focus:ring-amber-500 font-bold"
                      >
                        <option value="YER_NEW">ريال يمني جديد</option>
                        <option value="YER_OLD">ريال يمني قديم</option>
                        <option value="SAR">ريال سعودي</option>
                      </select>
                    </div>
                    <div className="space-y-1 sm:col-span-2">
                      <label className="text-[10px] text-gray-500 font-bold block">صورة توثيق تسليم الجائزة (أو اختر صورة لرفعها):</label>
                      <div className="flex gap-2">
                        <input 
                          type="text" 
                          value={newArchivedEventImageUrl} 
                          onChange={(e) => setNewArchivedEventImageUrl(e.target.value)} 
                          placeholder="رابط مباشر لصورة التوثيق (أو جاري الرفع تلقائياً...)"
                          className="flex-1 bg-white dark:bg-gray-800 text-[11px] py-2 px-3 border rounded-xl focus:outline-none text-left font-mono"
                          dir="ltr"
                        />
                        <label className="bg-amber-100 hover:bg-amber-200 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 py-2 px-4 rounded-xl text-xs font-black cursor-pointer transition flex items-center gap-1 shrink-0">
                          <Upload className="w-3.5 h-3.5" />
                          <span>{uploadingArchivedEventImg ? 'جاري الرفع...' : 'رفع صورة التوثيق'}</span>
                          <input 
                            type="file" 
                            accept="image/*" 
                            onChange={handleArchivedEventImgUpload} 
                            className="hidden" 
                          />
                        </label>
                      </div>
                    </div>
                    <div className="sm:col-span-2 flex items-center gap-2 pt-1">
                      <input 
                        type="checkbox" 
                        id="show-in-slider-chk"
                        checked={newArchivedEventShowInSlider} 
                        onChange={(e) => setNewArchivedEventShowInSlider(e.target.checked)}
                        className="rounded border-amber-300 text-amber-600 focus:ring-amber-500 h-4 w-4"
                      />
                      <label htmlFor="show-in-slider-chk" className="text-[10px] text-gray-600 dark:text-gray-300 font-bold cursor-pointer">
                        عرض هذا الحدث كبطاقة ترويجية في سلايدر المتجر الرئيسي للجمهور لتعزيز المصداقية
                      </label>
                    </div>
                  </div>

                  <div className="flex justify-end pt-2">
                    <button
                      type="submit"
                      className="bg-amber-500 hover:bg-amber-600 text-white font-extrabold text-[11px] py-2 px-5 rounded-xl shadow transition"
                    >
                      إضافة الحدث لتاريخ العروض والفعاليات ➕
                    </button>
                  </div>
                </form>

                {/* Archived events list */}
                <div className="space-y-2">
                  <span className="text-[10px] font-black text-gray-400 block">أحداث الفعاليات المؤرشفة والجوائز السابقة المسجلة:</span>
                  {archivedEvents.length === 0 ? (
                    <div className="text-center py-6 bg-gray-50 dark:bg-gray-950/20 rounded-2xl border border-gray-100 dark:border-gray-800">
                      <p className="text-[10px] text-gray-400 font-semibold">لا توجد أحداث مؤرشفة حالياً.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {archivedEvents.map((ev) => (
                        <div key={ev.id} className="bg-white dark:bg-gray-850 p-3.5 rounded-2xl border border-gray-100 dark:border-gray-800 flex gap-3 shadow-sm relative group">
                          {ev.deliveryProofImage ? (
                            <img src={ev.deliveryProofImage} alt="" className="w-16 h-16 rounded-xl object-cover shrink-0" referrerPolicy="no-referrer" />
                          ) : (
                            <div className="w-16 h-16 bg-amber-50 dark:bg-amber-950/20 rounded-xl flex items-center justify-center text-xl shrink-0">🎁</div>
                          )}
                          <div className="flex-1 text-right space-y-0.5">
                            <h4 className="text-xs font-black text-amber-950 dark:text-amber-200">{ev.name}</h4>
                            <p className="text-[10px] text-gray-500 font-bold">الفائزة: <span className="text-amber-600">{ev.winnerName}</span></p>
                            <p className="text-[10px] text-emerald-600 font-extrabold">الجائزة: {ev.giftAmount} {ev.giftCurrency === 'YER_NEW' ? 'ريال جديد' : ev.giftCurrency === 'YER_OLD' ? 'ريال قديم' : 'ريال سعودي'}</p>
                            <span className="text-[9px] text-gray-400 block font-mono">{ev.date} {ev.showInSlider && '• معروضة في السلايدر 🌐'}</span>
                          </div>
                          <button
                            onClick={() => handleDeleteArchivedEvent(ev.id)}
                            className="absolute top-2 left-2 bg-red-500 hover:bg-red-600 text-white p-1.5 rounded-xl shadow-sm opacity-0 group-hover:opacity-100 transition-opacity"
                            title="حذف الحدث مؤرشف"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* 5. USERS DATABASE VIEW */}
          {activeTab === 'users' && (
            <div className="bg-white dark:bg-gray-900 p-6 rounded-3xl border border-amber-100/40 dark:border-gray-800 shadow-sm space-y-5">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-amber-50 dark:border-gray-800 pb-4">
                <button
                  id="print-users-btn"
                  onClick={() => {
                    setReportTargetUser(null);
                    setReportType('comprehensive');
                    setShowReportModal(true);
                  }}
                  className="bg-gradient-to-l from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white text-xs font-black py-2.5 px-4 rounded-xl shadow-md flex items-center gap-1.5 transition"
                >
                  <Printer className="w-4.5 h-4.5" />
                  <span>تصدير تقرير مجمع لكل العملاء 📋</span>
                </button>

                <div className="text-right">
                  <h3 className="text-xs font-black text-amber-950 dark:text-amber-300">
                    قاعدة بيانات مستخدمي وعملاء متجر أم روح سحابياً
                  </h3>
                  <p className="text-[10px] text-gray-400 mt-1">البحث والتدقيق والحذف وإصدار التقارير بصيغة PDF</p>
                </div>
              </div>

              {/* Filters & Search bar */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {/* Search input */}
                <div className="relative">
                  <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-gray-400">
                    <Search className="h-4.5 w-4.5" />
                  </div>
                  <input
                    id="user-db-search"
                    type="text"
                    value={userSearchQuery}
                    onChange={(e) => setUserSearchQuery(e.target.value)}
                    placeholder="ابحثي عن عميلة بالاسم أو برقم الهاتف..."
                    dir="rtl"
                    className="w-full pl-4 pr-10 py-2.5 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white border border-amber-100 dark:border-gray-750 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 text-xs font-bold"
                  />
                </div>

                {/* Address Filter */}
                <div className="flex gap-3 justify-end items-center">
                  <span className="text-[10.5px] text-gray-450 dark:text-gray-450 font-black shrink-0">تصفية العناوين:</span>
                  <select
                    id="users-filter-select"
                    value={userAddressFilter}
                    onChange={(e) => setUserAddressFilter(e.target.value)}
                    className="px-3.5 py-2 bg-gray-50 dark:bg-gray-800 border rounded-xl text-xs font-bold text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-amber-500"
                  >
                    <option value="ALL">كل العناوين والمحافظات</option>
                    {uniqueAddresses.map(addr => (
                      <option key={addr} value={addr}>{addr}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Bulk Actions Bar */}
              <div className="flex flex-wrap items-center justify-between gap-3 bg-amber-500/5 p-3.5 rounded-2xl border border-amber-100/40 dark:border-gray-800/60 text-right">
                <div className="flex items-center gap-2">
                  <span className="text-[10.5px] font-black text-amber-900 dark:text-amber-300">💡 إجراءات مجمعة على العملاء:</span>
                  <span className="text-[10px] bg-amber-500/10 text-amber-800 dark:text-amber-300 font-extrabold px-2 py-0.5 rounded-full">
                    المحددون حالياً: {selectedUserIds.length} من أصل {filteredUsers.length} عميل
                  </span>
                </div>
                
                <div className="flex items-center gap-2">
                  {selectedUserIds.length > 0 && (
                    <button
                      onClick={handleBulkDeleteSelected}
                      className="bg-red-50 hover:bg-red-100 dark:bg-red-500/10 dark:hover:bg-red-500/20 text-red-600 dark:text-red-400 font-black text-[10.5px] py-1.5 px-3 rounded-xl border border-red-200 dark:border-red-500/20 transition flex items-center gap-1 shadow-sm"
                    >
                      <span>🗑️</span>
                      <span>حذف العملاء المحددين ({selectedUserIds.length})</span>
                    </button>
                  )}
                  
                  <button
                    onClick={handleDeleteAllUsers}
                    className="bg-rose-600 hover:bg-rose-700 text-white font-black text-[10.5px] py-1.5 px-3 rounded-xl transition flex items-center gap-1 shadow-md"
                  >
                    <span>⚠️</span>
                    <span>حذف جميع العملاء وتصفير القاعدة</span>
                  </button>
                </div>
              </div>

              {/* Table print-area */}
              <div id="print-users-area" className="overflow-x-auto text-right">
                <table className="w-full text-xs font-semibold">
                  <thead>
                    <tr className="bg-amber-500/10 text-amber-950 dark:text-amber-300 border-b">
                      <th className="p-3 text-right w-10">
                        <input
                          type="checkbox"
                          checked={filteredUsers.length > 0 && filteredUsers.every(u => selectedUserIds.includes(u.id))}
                          onChange={toggleSelectAllUsers}
                          className="w-3.5 h-3.5 rounded border-gray-300 text-amber-600 focus:ring-amber-500 accent-amber-600 cursor-pointer"
                          title="تحديد أو إلغاء تحديد الكل"
                        />
                      </th>
                      <th className="p-3 text-right">اسم العميل</th>
                      <th className="p-3 text-right">رقم الهاتف</th>
                      <th className="p-3 text-right">عنوان التوصيل</th>
                      <th className="p-3 text-center">العملة المفضلة</th>
                      <th className="p-3 text-right">الرصيد والجوائز</th>
                      <th className="p-3 text-center">الطلبات</th>
                      <th className="p-3 text-center">تقارير PDF 📄</th>
                      <th className="p-3 text-center">إجراءات 🚨</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="text-center py-8 text-gray-400 font-bold">لا يوجد نتائج تطابق معايير البحث والفلترة.</td>
                      </tr>
                    ) : (
                      filteredUsers.map(u => (
                        <tr key={u.id} className="border-b last:border-b-0 hover:bg-amber-50/25 dark:hover:bg-gray-800/30">
                          <td className="p-3">
                            <input
                              type="checkbox"
                              checked={selectedUserIds.includes(u.id)}
                              onChange={() => toggleUserSelection(u.id)}
                              className="w-3.5 h-3.5 rounded border-gray-300 text-amber-600 focus:ring-amber-500 accent-amber-600 cursor-pointer"
                            />
                          </td>
                          <td className="p-3 font-extrabold text-gray-900 dark:text-white">{u.name}</td>
                          <td className="p-3 text-gray-500 dark:text-gray-400" dir="ltr">{u.phone}</td>
                          <td className="p-3 text-right text-gray-500 dark:text-gray-400">{u.address}</td>
                          <td className="p-3 text-center font-bold text-gray-700 dark:text-gray-300">{getCurrencyCode(u.currency)}</td>
                          <td className="p-3 text-right">
                            <div className="font-black text-emerald-700 dark:text-emerald-400">💳 شحن: {u.balance} {getCurrencyCode(u.balanceCurrency || 'YER_NEW')}</div>
                            <div className="text-[10px] font-bold text-amber-600 dark:text-amber-500">🎁 هدايا: {u.giftBalance || 0} {getCurrencyCode(u.giftBalanceCurrency || 'YER_NEW')}</div>
                          </td>
                          <td className="p-3 text-center">
                            <div className="text-[11px] font-extrabold space-y-0.5 inline-block text-right">
                              <div className="text-blue-600">⏳ الجديدة: {orders.filter(o => o.userId === u.id && o.status === 'pending').length}</div>
                              <div className="text-emerald-600">✅ المستلمة: {orders.filter(o => o.userId === u.id && o.status === 'completed').length}</div>
                            </div>
                          </td>
                          <td className="p-3 text-center">
                            <button
                              id={`user-report-btn-${u.id}`}
                              onClick={() => {
                                setReportTargetUser(u);
                                setReportType('comprehensive');
                                setShowReportModal(true);
                              }}
                              className="bg-amber-50 hover:bg-amber-100 dark:bg-gray-850 dark:hover:bg-gray-800 text-amber-900 dark:text-amber-300 p-2 rounded-xl border border-amber-100/40 text-[10px] font-black transition flex items-center gap-1 mx-auto"
                            >
                              <Printer className="w-3.5 h-3.5" />
                              <span>تنزيل كـ PDF</span>
                            </button>
                          </td>
                          <td className="p-3 text-center">
                            <button
                              id={`user-delete-btn-${u.id}`}
                              onClick={() => {
                                askConfirmation(
                                  'تأكيد الحذف النهائي للمستخدم 🚨',
                                  `هل أنتِ متأكدة من حذف حساب العميلة (${u.name}) نهائياً من المتجر سحابياً؟ هذا الإجراء فوري وسوف يمحو تفضيلاتها ورصيدها بالكامل من قاعدة البيانات!`,
                                  () => {
                                    Database.deleteUser(u.id);
                                    showToast(`تم حذف حساب العميلة (${u.name}) بنجاح.`);
                                    reloadData();
                                  }
                                );
                              }}
                              className="bg-red-50 hover:bg-red-100 text-red-600 p-2 rounded-xl transition"
                              title="حذف نهائي للمستخدم"
                            >
                              <Trash2Icon className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* REPORT SELECTION MODAL (WIZARD) */}
              <AnimatePresence>
                {showReportModal && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
                    onClick={() => {
                      setShowReportModal(false);
                      setReportTargetUser(null);
                    }}
                  >
                    <motion.div
                      initial={{ scale: 0.95, y: 15 }}
                      animate={{ scale: 1, y: 0 }}
                      exit={{ scale: 0.95, y: 15 }}
                      className="bg-white dark:bg-gray-900 w-full max-w-md rounded-3xl p-6 space-y-5 shadow-2xl text-right border border-amber-100 dark:border-gray-800"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="border-b pb-3 flex justify-between items-center">
                        <button
                          onClick={() => {
                            setShowReportModal(false);
                            setReportTargetUser(null);
                          }}
                          className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-white"
                        >
                          <X className="w-5 h-5" />
                        </button>
                        <h3 className="text-xs font-black text-amber-950 dark:text-amber-300 flex items-center gap-1.5">
                          <span>معالج إصدار وطباعة التقارير كـ PDF 📋</span>
                          <Printer className="w-4.5 h-4.5 text-amber-500" />
                        </h3>
                      </div>

                      <div className="bg-amber-500/5 p-4 rounded-2xl text-xs space-y-1 text-right">
                        <span className="text-[10px] text-gray-400 block font-black">الجهة المستهدفة بالتقرير:</span>
                        <p className="font-extrabold text-amber-950 dark:text-amber-200">
                          {reportTargetUser ? `العميلة: ${reportTargetUser.name} (${reportTargetUser.phone})` : 'تقرير مجمع شامل لجميع العملاء المسجلين'}
                        </p>
                      </div>

                      <div className="space-y-3">
                        <span className="text-[10px] text-gray-400 block font-black mb-1">اختر نوع التقرير الفني والمالي المطلوب إصداره:</span>
                        
                        <div className="grid grid-cols-1 gap-2">
                          {[
                            { id: 'comprehensive', title: '📊 تقرير شامل متكامل (كافة الحسابات والحركات)', desc: 'يصدر ملفاً جامعاً للبيانات الشخصية والمبيعات والإيداعات مرتبة' },
                            { id: 'user_data', title: '👤 البيانات الشخصية والملف الشخصي وتفاصيل الحساب', desc: 'يصدر معلومات الاتصال والعملة وعنوان التوصيل ومطابقة الأرصدة' },
                            { id: 'new_orders', title: '⏳ طلبات التوصيل الجديدة (المعلقة قيد التحضير)', desc: 'يركز على المنتجات المطلوبة حديثاً وعناوين التوصيل المرتبطة' },
                            { id: 'received_orders', title: '✅ الطلبات المستلمة (الأرشيف والمبيعات المكتملة)', desc: 'يعرض سجل المشتروات الناجحة بالكامل وقيم الفواتير المستلمة' },
                            { id: 'recharges', title: '💳 عمليات شحن الرصيد وحركة تغذية المحفظة الإلكترونية', desc: 'يسرد حوالات الكريمي وسندات الدفع الموافق عليها والمرفوضة والانتظار' }
                          ].map(opt => (
                            <button
                              key={opt.id}
                              onClick={() => setReportType(opt.id as any)}
                              className={`p-3 rounded-2xl border text-right transition flex flex-col gap-1 ${
                                reportType === opt.id
                                  ? 'bg-amber-500/10 border-amber-500 text-amber-950 dark:text-amber-300 shadow-sm'
                                  : 'bg-gray-50/50 dark:bg-gray-800/40 border-gray-100 dark:border-gray-800 text-gray-700 dark:text-gray-300 hover:bg-amber-500/5'
                              }`}
                            >
                              <span className="text-xs font-black">{opt.title}</span>
                              <span className="text-[10px] text-gray-400 font-bold pr-5">{opt.desc}</span>
                            </button>
                          ))}
                        </div>
                      </div>

                      <button
                        onClick={() => {
                          handleGeneratePdfReport(reportTargetUser, reportType);
                          setShowReportModal(false);
                          setReportTargetUser(null);
                        }}
                        className="w-full py-3 bg-gradient-to-l from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white font-extrabold text-xs rounded-xl shadow-lg transition flex items-center justify-center gap-2"
                      >
                        <Printer className="w-4 h-4 animate-bounce" />
                        <span>تأكيد وتنزيل التقرير المختار كـ PDF 📄</span>
                      </button>
                    </motion.div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          {/* 6. GIFTS AND HIGHEST ORDERS REWARDS */}
          {activeTab === 'gifts' && (
            <div className="bg-white dark:bg-gray-900 p-6 rounded-3xl border border-amber-100/40 dark:border-gray-800 shadow-sm space-y-5">
              <h3 className="text-xs font-black text-amber-950 dark:text-amber-300 border-b border-amber-50 dark:border-gray-800 pb-2 text-right">
                منح وتوزيع هدايا أم روح المالية (الترتيب بأكثر العملاء طلباً بالمتجر)
              </h3>

              {/* Search user */}
              <div className="relative">
                <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-gray-400">
                  <Search className="h-4.5 w-4.5" />
                </div>
                <input
                  id="gift-user-search"
                  type="text"
                  value={giftSearchQuery}
                  onChange={(e) => setGiftSearchQuery(e.target.value)}
                  placeholder="ابحثي عن عميلة بالاسم أو رقم الهاتف..."
                  dir="rtl"
                  className="w-full pl-4 pr-10 py-2 bg-gray-50 border border-amber-100 rounded-xl focus:outline-none focus:ring-1 focus:ring-amber-500 text-xs"
                />
              </div>

              {/* Users list sorted by activity */}
              <div className="divide-y divide-amber-100/40 bg-gray-50/50 rounded-2xl border p-4 space-y-3.5 text-right">
                {searchedGiftUsers.map(u => (
                  <div key={u.id} className="pt-3 first:pt-0 flex justify-between items-center gap-3">
                    <div className="text-right">
                      <h4 className="text-xs font-extrabold text-gray-900 dark:text-white flex items-center gap-1.5">
                        <span>{u.name}</span>
                        <span className="text-[9px] bg-amber-500 text-white font-black px-1.5 py-0.5 rounded-full">
                          {u.orderCount} طلبات 🛍️
                        </span>
                      </h4>
                      <p className="text-[10px] text-gray-400" dir="ltr">{u.phone}</p>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="text-left text-[10px] text-gray-500 font-semibold space-y-0.5">
                        <div>💳 شحن: {u.balance} {getCurrencyCode(u.balanceCurrency || 'YER_NEW')}</div>
                        <div>🎁 هدايا: {u.giftBalance || 0} {getCurrencyCode(u.giftBalanceCurrency || 'YER_NEW')}</div>
                      </div>
                      
                      <button
                        id={`reward-gift-${u.id}`}
                        onClick={() => {
                          setSelectedGiftUser(u);
                          setShowGiftModal(true);
                        }}
                        className="bg-amber-500 hover:bg-amber-600 text-white text-[10px] font-black py-2 px-3.5 rounded-xl shadow-sm flex items-center gap-1 transition"
                      >
                        <Gift className="w-3.5 h-3.5" />
                        <span>إرسال هدية</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Send gift amount verification modal */}
              <AnimatePresence>
                {showGiftModal && selectedGiftUser && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
                    onClick={() => {
                      setShowGiftModal(false);
                      setSelectedGiftUser(null);
                    }}
                  >
                    <motion.div
                      initial={{ scale: 0.9 }}
                      animate={{ scale: 1 }}
                      exit={{ scale: 0.9 }}
                      className="bg-white dark:bg-gray-900 w-full max-w-sm rounded-3xl p-5 space-y-4 shadow-2xl text-right"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <h3 className="text-xs font-black text-amber-950 dark:text-amber-300 border-b pb-2 flex items-center gap-1.5 justify-end">
                        <span>إرسال هدية رصيد لـ: {selectedGiftUser.name}</span>
                        <Gift className="w-4.5 h-4.5 text-amber-500" />
                      </h3>

                      <form onSubmit={handleSendGiftSubmit} className="space-y-4">
                        <div className="space-y-1">
                          <label className="text-xs font-bold text-gray-600 block">عملة الهدية المالية للعميلة:</label>
                          <select
                            id="gift-currency-select"
                            value={giftCurrencyInput}
                            onChange={(e) => setGiftCurrencyInput(e.target.value as Currency)}
                            className="w-full px-3 py-2 bg-gray-50 border rounded-xl focus:outline-none text-right font-black text-xs text-amber-900"
                          >
                            <option value="YER_NEW">ريال يمني جديد</option>
                            <option value="YER_OLD">ريال يمني قديم</option>
                            <option value="SAR">ريال سعودي</option>
                          </select>
                        </div>

                        <div className="space-y-1">
                          <label className="text-xs font-bold text-gray-600 block">
                            مبلغ الهدية المالية ({giftCurrencyInput === 'YER_NEW' ? 'بالريال اليمني الجديد' : giftCurrencyInput === 'YER_OLD' ? 'بالريال اليمني القديم' : 'بالريال السعودي'}):
                          </label>
                          <input
                            id="gift-amount-input"
                            type="number"
                            value={giftAmountInput || ''}
                            onChange={(e) => setGiftAmountInput(parseFloat(e.target.value) || 0)}
                            placeholder="مثل: 1500"
                            required
                            className="w-full px-3 py-2 bg-gray-50 border rounded-xl focus:outline-none text-center font-black text-sm text-amber-900"
                          />
                        </div>

                        <button
                          id="gift-amount-submit"
                          type="submit"
                          className="w-full py-2 bg-amber-500 text-white font-extrabold text-xs rounded-xl shadow transition"
                        >
                          تأكيد وإرسال الهدية المالية للمحفظة
                        </button>
                      </form>
                    </motion.div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          {/* 7. NEW ORDERS */}
          {activeTab === 'new-orders' && (
            <div className="bg-white dark:bg-gray-900 p-6 rounded-3xl border border-amber-100/40 dark:border-gray-800 shadow-sm space-y-6">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center border-b border-amber-50 dark:border-gray-800 pb-4 gap-3 text-right">
                <span className="text-[10px] text-gray-400 font-extrabold order-2 md:order-1">نظام التتبع المتكامل للطلبيات والتحكم بحالة الشحنة</span>
                <h3 className="text-xs font-black text-amber-950 dark:text-amber-300 order-1 md:order-2">
                  لوحة التحكم بالطلبيات النشطة والجديدة 📦
                </h3>
              </div>

              {/* Order Status Sub-Tabs / Steps Selection */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 bg-gray-50/50 dark:bg-gray-950/20 p-1.5 rounded-2xl border border-amber-100/10">
                {[
                  { id: 'pending', label: '📥 في الانتظار', badge: orders.filter(o => o.status === 'pending').length, desc: 'الطلبات الجديدة المعلقة' },
                  { id: 'approved', label: '👍 تمت الموافقة', badge: orders.filter(o => o.status === 'approved').length, desc: 'الطلبات المعتمدة مالياً' },
                  { id: 'preparing', label: '🛠️ قيد التجهيز', badge: orders.filter(o => o.status === 'preparing').length, desc: 'التجميع والتغليف بالمخزن' },
                  { id: 'shipping', label: '🚚 في الطريق', badge: orders.filter(o => o.status === 'shipping').length, desc: 'المرسلة مع المندوبين' }
                ].map((subTab) => {
                  const isActive = adminOrderSubTab === subTab.id;
                  return (
                    <button
                      key={subTab.id}
                      onClick={() => setAdminOrderSubTab(subTab.id as any)}
                      className={`py-2 px-3 rounded-xl transition flex flex-col items-center justify-center text-center gap-1 border ${
                        isActive 
                          ? 'bg-amber-500 text-white border-amber-600 shadow-xs' 
                          : 'bg-white dark:bg-gray-900 text-gray-500 dark:text-gray-400 border-gray-100 dark:border-gray-800 hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 justify-center">
                        {subTab.badge > 0 && (
                          <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full ${isActive ? 'bg-white text-amber-600' : 'bg-red-500 text-white'}`}>
                            {subTab.badge}
                          </span>
                        )}
                        <span className="text-[10.5px] font-black">{subTab.label}</span>
                      </div>
                      <span className={`text-[8.5px] ${isActive ? 'text-amber-100' : 'text-gray-400'}`}>
                        {subTab.desc}
                      </span>
                    </button>
                  );
                })}
              </div>

              {(() => {
                const filteredOrders = orders.filter(o => o.status === adminOrderSubTab);

                if (filteredOrders.length === 0) {
                  return (
                    <div className="text-center py-14 text-gray-400 text-xs font-black leading-relaxed">
                      🏖️ لا توجد أي طلبيات في مرحلة [ {
                        adminOrderSubTab === 'pending' ? 'في الانتظار' :
                        adminOrderSubTab === 'approved' ? 'الموافقة المبدئية' :
                        adminOrderSubTab === 'preparing' ? 'التجهيز والتحضير' : 'الشحن والتوصيل'
                      } ] حالياً!
                    </div>
                  );
                }

                return (
                  <div className="space-y-6">
                    {filteredOrders.map(order => (
                      <div key={order.id} className="border border-amber-100/50 dark:border-gray-800 rounded-3xl p-5 bg-gray-50/50 dark:bg-gray-800/40 text-right space-y-4">
                        {/* Order info bar */}
                        <div className="flex justify-between items-center border-b pb-2">
                          <div className="flex items-center gap-1.5">
                            <button
                              id={`print-inv-${order.id}`}
                              onClick={() => handlePrintOrderInvoice(order)}
                              className="p-1.5 bg-white hover:bg-gray-100 text-gray-500 rounded-lg shadow-sm border transition"
                              title="عرض وطباعة كـ PDF"
                            >
                              <Printer className="w-4 h-4" />
                            </button>
                          </div>

                          <div className="text-right">
                            <span className="text-[10px] text-gray-400 font-extrabold block">رقم الطلبية المرجعي:</span>
                            <span className="text-xs font-black text-amber-900 dark:text-amber-300">#{order.id.slice(-8).toUpperCase()} <span className="text-[9px] text-gray-400 font-medium">({order.id})</span></span>
                          </div>
                        </div>

                        {/* Customer details info */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs bg-white dark:bg-gray-900 p-3 rounded-2xl border">
                          <div>
                            <span className="text-[9px] text-gray-400 block">اسم العميلة:</span>
                            <span className="font-extrabold">{order.userName}</span>
                          </div>
                          <div>
                            <span className="text-[9px] text-gray-400 block">رقم الجوال:</span>
                            <span className="font-semibold" dir="ltr">{order.userPhone}</span>
                          </div>
                          <div className="col-span-2">
                            <span className="text-[9px] text-gray-400 block">عنوان التوصيل:</span>
                            <span className="font-bold">{order.address}</span>
                          </div>
                        </div>

                        {/* Purchased products queue */}
                        <div className="space-y-2.5">
                          <span className="text-[10px] font-black text-gray-400 block">المنتجات المطلوبة في الفاتورة:</span>
                          <div className="space-y-2">
                            {order.items.map((it, idx) => (
                              <div key={idx} className="flex gap-3 bg-white dark:bg-gray-900 p-2.5 rounded-2xl border border-amber-100/10">
                                <img src={it.image} alt={it.productName} className="w-10 h-10 rounded-xl object-cover" />
                                <div className="flex-1 text-right min-w-0">
                                  <h4 className="text-xs font-extrabold text-gray-900 dark:text-white truncate">{it.productName}</h4>
                                  <span className="text-[9px] text-gray-400 font-extrabold bg-amber-500/5 px-2 py-0.5 rounded-md mt-1 inline-block">
                                    رمز الصنف (للإدارة): {it.productCode}
                                  </span>
                                  
                                  {Object.keys(it.selectedProperties || {}).length > 0 && (
                                    <div className="flex gap-1 flex-wrap mt-1">
                                      {Object.entries(it.selectedProperties).map(([k,v]) => (
                                        <span key={k} className="text-[8px] bg-amber-500/10 text-amber-800 px-1 py-0.5 rounded font-bold">
                                          {k}: {v}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                </div>

                                <div className="shrink-0 text-left">
                                  <span className="text-[10px] font-bold text-gray-400 block">الكمية: {it.quantity}</span>
                                  <span className="text-xs font-black text-amber-800">{it.totalPrice} {getCurrencyCode(order.currency)}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Deposit proof and actions */}
                        <div className="flex flex-col md:flex-row justify-between items-end gap-3 pt-3 border-t">
                          <div className="text-right space-y-1">
                            <span className="text-[10px] text-gray-400 block">سعر الفاتورة الإجمالي المطلوب:</span>
                            <span className="text-sm font-black text-amber-800">{order.totalAmount} {getCurrencyCode(order.currency)}</span>
                            
                            {/* Payment details */}
                            <div className="space-y-1 mt-1 text-right">
                              <span className="text-[10px] text-gray-400 block">طريقة السداد وتفاصيل الدفع:</span>
                              <div className="flex flex-wrap gap-1.5 items-center justify-start md:justify-end">
                                {order.paymentMethod === 'gift_wallet' && (
                                  <span className="bg-amber-100 text-amber-800 dark:bg-amber-500/10 dark:text-amber-300 font-extrabold px-2.5 py-1 rounded-lg text-[9.5px]">
                                    🎁 خصم من هدايا أم روح
                                  </span>
                                )}
                                {order.paymentMethod === 'recharge_wallet' && (
                                  <span className="bg-blue-100 text-blue-800 dark:bg-blue-500/10 dark:text-blue-300 font-extrabold px-2.5 py-1 rounded-lg text-[9.5px]">
                                    💳 سداد من الرصيد المشحون (المحفظة)
                                  </span>
                                )}
                                {order.paymentMethod === 'al_kuraimi' && (
                                  <span className="bg-emerald-100 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300 font-extrabold px-2.5 py-1 rounded-lg text-[9.5px]">
                                    🏦 حوالة بنك الكريمي
                                  </span>
                                )}
                                {order.paymentMethod === 'najm' && (
                                  <span className="bg-purple-100 text-purple-800 dark:bg-purple-500/10 dark:text-purple-300 font-extrabold px-2.5 py-1 rounded-lg text-[9.5px]">
                                    💸 شبكة النجم للتحويلات
                                  </span>
                                )}
                                
                                {order.checkoutVia === 'whatsapp' && (
                                  <span className="bg-emerald-600 text-white font-extrabold px-2.5 py-1 rounded-lg text-[9.5px] shadow-xs flex items-center gap-1">
                                    <span>📲</span>
                                    <span>مكتمل عبر واتساب</span>
                                  </span>
                                )}
                              </div>
                              
                              {(order.paymentMethod === 'al_kuraimi' || order.paymentMethod === 'najm') && (
                                <p className="text-[10.5px] font-bold text-gray-700 dark:text-gray-300 mt-1">
                                  اسم المرسل: <span className="text-amber-800 dark:text-amber-300">{order.senderName}</span>
                                  {order.senderAccount && <> | الحساب/المرجع: <span className="text-amber-800 dark:text-amber-300">{order.senderAccount}</span></>}
                                </p>
                              )}
                            </div>
                          </div>

                          {/* Display receipt if exists */}
                          {order.receiptImage && (
                            <div className="flex items-center gap-1.5 bg-white p-1 rounded-xl border">
                              {order.receiptImage.startsWith('data:') ? (
                                <img src={order.receiptImage} alt="وثيقة إيداع" className="w-12 h-12 object-cover rounded-lg border cursor-pointer" onClick={() => {
                                  const win = window.open();
                                  if (win) win.document.write(`<img src="${order.receiptImage}" />`);
                                }} />
                              ) : (
                                <div className="w-12 h-12 flex flex-col items-center justify-center bg-emerald-50 text-emerald-600 rounded-lg border border-emerald-100 text-[8px] font-bold text-center leading-tight p-1 shrink-0">
                                  <span>📲</span>
                                  <span>مرسل واتساب</span>
                                </div>
                              )}
                              <span className="text-[9px] font-bold text-gray-400 px-2">وثيقة الإيداع</span>
                            </div>
                          )}

                          {/* Action Buttons with Multi-stage tracking flow */}
                          <div className="flex gap-2">
                            <button
                              id={`cancel-order-${order.id}`}
                              onClick={() => handleUpdateOrderStatus(order.id, 'canceled')}
                              className="bg-red-50 text-red-600 hover:bg-red-500 hover:text-white border border-red-200 text-[10px] font-black py-2 px-3.5 rounded-xl shadow-xs transition"
                            >
                              إلغاء ورفض الطلب ❌
                            </button>
                            
                            {adminOrderSubTab === 'pending' && (
                              <button
                                id={`approve-order-${order.id}`}
                                onClick={() => handleUpdateOrderStatus(order.id, 'approved')}
                                className="bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-black py-2.5 px-4 rounded-xl shadow-md transition flex items-center gap-1 animate-pulse"
                              >
                                <Check className="w-3.5 h-3.5" />
                                <span>قبول واعتماد الفاتورة 👍</span>
                              </button>
                            )}

                            {adminOrderSubTab === 'approved' && (
                              <button
                                id={`prepare-order-${order.id}`}
                                onClick={() => handleUpdateOrderStatus(order.id, 'preparing')}
                                className="bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-black py-2.5 px-4 rounded-xl shadow-md transition flex items-center gap-1"
                              >
                                <span>🛠️ بدء التجهيز في المخزن</span>
                              </button>
                            )}

                            {adminOrderSubTab === 'preparing' && (
                              <button
                                id={`ship-order-${order.id}`}
                                onClick={() => handleUpdateOrderStatus(order.id, 'shipping')}
                                className="bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-black py-2.5 px-4 rounded-xl shadow-md transition flex items-center gap-1"
                              >
                                <span>🚚 تسليم المندوب (شحن)</span>
                              </button>
                            )}

                            {adminOrderSubTab === 'shipping' && (
                              <button
                                id={`complete-order-${order.id}`}
                                onClick={() => handleUpdateOrderStatus(order.id, 'completed')}
                                className="bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-black py-2.5 px-4 rounded-xl shadow-md transition flex items-center gap-1"
                              >
                                <span>✅ تأكيد استلام العميل</span>
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
          )}

          {/* ACTIVE CARTS MONITOR */}
          {activeTab === 'active-carts' && (
            <div className="bg-white dark:bg-gray-900 p-6 rounded-3xl border border-amber-100/40 dark:border-gray-800 shadow-sm space-y-6">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center border-b border-amber-50 dark:border-gray-800 pb-4 gap-3 text-right">
                <button
                  onClick={fetchActiveCarts}
                  disabled={isLoadingCarts}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-600 disabled:bg-amber-300 text-white text-[11px] font-black rounded-xl shadow-xs transition flex items-center gap-1.5 order-2 md:order-1"
                >
                  <span>{isLoadingCarts ? 'جاري التحديث... ⏳' : 'تحديث البيانات 🔄'}</span>
                </button>
                <div className="order-1 md:order-2">
                  <h3 className="text-xs font-black text-amber-950 dark:text-amber-300">
                    مراقبة سلل التسوق النشطة للعملاء حالياً 🛒
                  </h3>
                  <p className="text-[10px] text-gray-400 font-extrabold mt-1">
                    تتبع عربات وسلل تسوق المشتريات المفتوحة في الوقت الفعلي عبر قاعدة بيانات السحابة
                  </p>
                </div>
              </div>

              {isLoadingCarts ? (
                <div className="text-center py-20 text-gray-400 font-bold text-xs">
                  <div className="animate-spin w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full mx-auto mb-3"></div>
                  جاري جلب سلل التسوق النشطة من السحابة...
                </div>
              ) : activeCarts.length === 0 ? (
                <div className="text-center py-16 text-gray-400 text-xs font-black leading-relaxed">
                  🏖️ لا توجد أي سلل تسوق نشطة مسجلة في السحابة حالياً! <br/>
                  سيبدأ النظام تلقائياً بتتبع سلل العميلات فور إضافتهن لمنتجات بداخل عربة التسوق.
                </div>
              ) : (
                <div className="space-y-6">
                  {activeCarts.map((cart, idx) => {
                    const cartUser = users.find(u => u.id === cart.userId);
                    const itemsList = (cart.items || []) as OrderItem[];
                    
                    // Calculate total cart value
                    const cartTotal = itemsList.reduce((sum, item) => sum + (item.totalPrice || 0), 0);

                    return (
                      <div key={cart.id || idx} className="border border-amber-100/50 dark:border-gray-800 rounded-3xl p-5 bg-gray-50/50 dark:bg-gray-800/40 text-right space-y-4">
                        {/* Cart Meta Header */}
                        <div className="flex justify-between items-center border-b pb-2.5">
                          <div className="text-left">
                            <span className="text-[9px] text-gray-400 block">آخر تحديث للسلة:</span>
                            <span className="text-[10px] font-bold text-gray-600 dark:text-gray-300" dir="ltr">
                              {new Date(cart.updatedAt).toLocaleString('ar-YE', { 
                                hour: '2-digit', 
                                minute: '2-digit', 
                                second: '2-digit',
                                day: 'numeric', 
                                month: 'short' 
                              })}
                            </span>
                          </div>
                          
                          <div className="text-right">
                            <span className="text-[9px] text-gray-400 block">صاحبة السلة / جهاز المتصفح:</span>
                            <span className="text-xs font-black text-amber-950 dark:text-white">
                              {(() => {
                                const cartName = cartUser ? cartUser.name : (cart.userName || '');
                                const cartPhone = cartUser ? cartUser.phone : (cart.userPhone || '');
                                return cartName ? `${cartName} (${cartPhone})` : 'زائرة مجهولة (جهاز غير مسجل)';
                              })()}
                            </span>
                            <span className="text-[9px] text-gray-400 block mt-0.5" dir="ltr">المعرف: {cart.id}</span>
                          </div>
                        </div>

                        {/* Cart items list */}
                        <div className="space-y-2">
                          <span className="text-[9.5px] text-gray-400 font-extrabold block">محتويات السلة الحالية:</span>
                          <div className="space-y-2 bg-white dark:bg-gray-900 rounded-2xl p-3 border">
                            {itemsList.length === 0 ? (
                              <span className="text-[10px] text-gray-400 font-bold block text-center py-2">السلة فارغة حالياً.</span>
                            ) : (
                              itemsList.map((item, itemIdx) => (
                                <div key={itemIdx} className="flex gap-3 items-center justify-between text-xs py-1 border-b last:border-b-0">
                                  <div className="flex items-center gap-2">
                                    <img src={item.image} alt={item.productName} className="w-8 h-8 rounded-lg object-cover bg-gray-50 shrink-0" />
                                    <div className="text-right min-w-0">
                                      <h4 className="text-[11px] font-extrabold text-gray-800 dark:text-white truncate max-w-[200px]">{item.productName}</h4>
                                      <span className="text-[9px] text-gray-400 font-bold block">الكمية: {item.quantity} | {Object.entries(item.selectedProperties || {}).map(([k,v]) => `${k}:${v}`).join(' - ')}</span>
                                    </div>
                                  </div>
                                  <span className="text-[10.5px] font-black text-amber-800 dark:text-amber-400 shrink-0">{item.totalPrice} ر.ي.ج</span>
                                </div>
                              ))
                            )}
                          </div>
                        </div>

                        {/* Total Value */}
                        {itemsList.length > 0 && (
                          <div className="flex justify-between items-center bg-amber-500/5 dark:bg-amber-500/10 p-3 rounded-2xl border border-amber-500/10">
                            <span className="text-[10px] text-amber-900 dark:text-amber-400 font-extrabold">القيمة التقريبية لمحتويات السلة:</span>
                            <span className="text-xs font-black text-amber-800 dark:text-amber-400">
                              {cartTotal.toLocaleString()} ر.ي.ج
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* 8. SENT ORDERS ARCHIVE */}
          {activeTab === 'sent-orders' && (
            <div className="bg-white dark:bg-gray-900 p-6 rounded-3xl border border-amber-100/40 dark:border-gray-800 shadow-sm space-y-6">
              <h3 className="text-xs font-black text-amber-950 dark:text-amber-300 border-b border-amber-50 dark:border-gray-800 pb-2 text-right">
                سجل الأرشيف لطلبيات التوصيل المرسلة والمكتملة
              </h3>

              {completedOrders.length === 0 ? (
                <div className="text-center py-10 text-gray-400 text-xs font-bold">الأرشيف فارغ حالياً.</div>
              ) : (
                <div className="space-y-4">
                  {completedOrders.map(order => (
                    <div key={order.id} className="border border-amber-100/30 rounded-2xl p-4 bg-gray-50/20 text-right flex justify-between items-center gap-3">
                      <div>
                        <h4 className="text-xs font-extrabold text-gray-900">طلبية: {order.id} ({order.userName})</h4>
                        <p className="text-[10px] text-gray-400 mt-0.5">التاريخ: {formatArabicDate(order.createdAt)} | العنوان: {order.address}</p>
                        <span className={`text-[9px] font-bold px-2 py-0.5 rounded-md inline-block mt-1 ${
                          order.status === 'completed' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
                        }`}>
                          {order.status === 'completed' ? 'تم الشحن والتوصيل بنجاح ✅' : 'ملغية ❌'}
                        </span>
                      </div>

                      <div className="text-left font-bold shrink-0">
                        <span className="text-xs text-amber-800 block">{order.totalAmount} {getCurrencyCode(order.currency)}</span>
                        <button
                          onClick={() => handlePrintOrderInvoice(order)}
                          className="text-[9px] text-gray-400 hover:text-amber-600 flex items-center gap-1 mt-1"
                        >
                          <Printer className="w-3 h-3" />
                          <span>عرض الفاتورة</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 9. RECHARGE WALLET REQUESTS */}
          {activeTab === 'recharges' && (
            <div className="bg-white dark:bg-gray-900 p-6 rounded-3xl border border-amber-100/40 dark:border-gray-800 shadow-sm space-y-6">
              <h3 className="text-xs font-black text-amber-950 dark:text-amber-300 border-b border-amber-50 dark:border-gray-800 pb-2 text-right">
                طلبات إيداع وشحن الرصيد والتحقق من سندات الإرسال
              </h3>

              {pendingRecharges.length === 0 ? (
                <div className="text-center py-10 text-gray-400 text-xs font-bold">لا يوجد أي طلبات شحن رصيد جديدة حالياً.</div>
              ) : (
                <div className="space-y-4">
                  {pendingRecharges.map(req => (
                    <div key={req.id} className="border rounded-2xl p-4 bg-gray-50/50 text-right flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                      <div className="space-y-1 flex-1">
                        <h4 className="text-xs font-extrabold text-gray-900">
                          {req.userName} <span className="text-[10px] text-gray-500 font-semibold" dir="ltr">({req.userPhone})</span>
                        </h4>
                        <p className="text-[10px] text-gray-400">حساب الكريمي أو مرجع الحوالة: {req.senderAccount} | اسم المرسل المحول: {req.senderName}</p>
                        <span className="text-xs font-black text-amber-800 block">المبلغ المطلوب شحنه: {req.amount} YER</span>
                        <span className="text-[9px] text-gray-400 font-semibold">{formatArabicDate(req.createdAt)}</span>
                      </div>

                      <div className="flex items-center gap-3 self-end md:self-auto">
                        {/* Receipt Image popup preview */}
                        {req.receiptImage && req.receiptImage.startsWith('data:') ? (
                          <img src={req.receiptImage} alt="سند شحن" className="w-12 h-12 object-cover rounded-lg border bg-white shrink-0 cursor-pointer" onClick={() => {
                            const win = window.open();
                            if (win) win.document.write(`<img src="${req.receiptImage}" />`);
                          }} />
                        ) : (
                          <div className="w-12 h-12 flex flex-col items-center justify-center bg-emerald-50 text-emerald-600 rounded-lg border border-emerald-100 text-[8px] font-bold text-center leading-tight p-1 shrink-0">
                            <span>📲</span>
                            <span>مرسل واتساب</span>
                          </div>
                        )}
                        
                        <div className="flex gap-2">
                          <button
                            id={`reject-recharge-${req.id}`}
                            onClick={() => handleRejectRecharge(req.id)}
                            className="bg-red-500 hover:bg-red-600 text-white text-[10px] font-bold py-2 px-3 rounded-xl shadow-sm transition"
                          >
                            رفض
                          </button>
                          
                          <button
                            id={`approve-recharge-${req.id}`}
                            onClick={() => {
                              setRechargeApprovalId(req.id);
                              setRechargeApprovedAmount(req.amount);
                            }}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-black py-2 px-4 rounded-xl shadow-md transition"
                          >
                            موافقة وتغذية الحساب
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Approve recharge modal with amount confirm */}
              <AnimatePresence>
                {rechargeApprovalId && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
                    onClick={() => setRechargeApprovalId('')}
                  >
                    <motion.div
                      initial={{ scale: 0.9 }}
                      animate={{ scale: 1 }}
                      exit={{ scale: 0.9 }}
                      className="bg-white dark:bg-gray-900 w-full max-w-sm rounded-3xl p-5 space-y-4 shadow-2xl text-right"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <h3 className="text-xs font-black text-amber-950 dark:text-amber-300 border-b pb-2">
                        تغذية حساب العميلة بالرصيد المعتمد
                      </h3>

                      <form onSubmit={handleApproveRechargeSubmit} className="space-y-4">
                        <div className="space-y-1">
                          <label className="text-xs font-bold text-gray-600 block">المبلغ المالي المعتمد للشحن والإيداع (YER):</label>
                          <input
                            id="recharge-approved-amount-input"
                            type="number"
                            value={rechargeApprovedAmount || ''}
                            onChange={(e) => setRechargeApprovedAmount(parseFloat(e.target.value) || 0)}
                            placeholder="أدخلي المبلغ الدقيق بعد المراجعة"
                            required
                            className="w-full px-3 py-2 bg-gray-50 border rounded-xl focus:outline-none text-center font-black text-amber-900"
                          />
                        </div>

                        <button
                          id="recharge-approved-submit"
                          type="submit"
                          className="w-full py-2 bg-emerald-600 text-white font-extrabold text-xs rounded-xl shadow transition"
                        >
                          تأكيد وموافقة وتغذية حساب العميل فوراً
                        </button>
                      </form>
                    </motion.div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          {/* 10. CUSTOM REPORTS SECTION */}
          {activeTab === 'reports' && (
            <div className="bg-white dark:bg-gray-900 p-6 rounded-3xl border border-amber-100/40 dark:border-gray-800 shadow-sm space-y-6">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-amber-50 dark:border-gray-800 pb-4">
                <div className="text-right">
                  <h3 className="text-xs font-black text-amber-950 dark:text-amber-300">
                    قسم التقارير والتدقيق والمبيعات المخصصة 📊
                  </h3>
                  <p className="text-[10px] text-gray-400 mt-1">تتبع كافة حركات شحن المحفظة وحوالات المشتروات مع التواريخ والتفاصيل</p>
                </div>
                
                {/* Print/Export button */}
                <button
                  id="print-reports-btn"
                  onClick={() => window.print()}
                  className="bg-amber-500 hover:bg-amber-600 active:scale-95 text-white font-black text-[10px] py-2 px-4 rounded-xl shadow-md transition flex items-center gap-1.5 self-end sm:self-auto"
                >
                  <Printer className="w-4 h-4" />
                  <span>تصدير وطباعة التقرير المالي الحالي 📄</span>
                </button>
              </div>

              {/* Bento Stats Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {/* Stat 1: Recharges approved */}
                <div className="bg-gradient-to-br from-emerald-500/5 to-emerald-500/10 p-4 rounded-2xl border border-emerald-500/10 text-right space-y-1">
                  <span className="text-[10px] text-emerald-800 dark:text-emerald-400 font-bold block">إجمالي شحن رصيد المحفظة (الناجح) ✅</span>
                  <span className="text-lg font-black text-emerald-950 dark:text-emerald-300">
                    {recharges.filter(r => r.status === 'approved').reduce((sum, r) => sum + r.amount, 0)} YER
                  </span>
                  <span className="text-[9px] text-gray-400 block font-semibold">من {recharges.filter(r => r.status === 'approved').length} طلب شحن مكتمل</span>
                </div>

                {/* Stat 2: Pending recharges */}
                <div className="bg-gradient-to-br from-amber-500/5 to-amber-500/10 p-4 rounded-2xl border border-amber-500/10 text-right space-y-1">
                  <span className="text-[10px] text-amber-800 dark:text-amber-400 font-bold block">شحنات رصيد قيد الانتظار والتدقيق ⏳</span>
                  <span className="text-lg font-black text-amber-950 dark:text-amber-300">
                    {recharges.filter(r => r.status === 'pending').reduce((sum, r) => sum + r.amount, 0)} YER
                  </span>
                  <span className="text-[9px] text-gray-400 block font-semibold">{recharges.filter(r => r.status === 'pending').length} طلب معلق بحاجة لقرار</span>
                </div>

                {/* Stat 3: Orders sales volume */}
                <div className="bg-gradient-to-br from-blue-500/5 to-blue-500/10 p-4 rounded-2xl border border-blue-500/10 text-right space-y-1">
                  <span className="text-[10px] text-blue-800 dark:text-blue-400 font-bold block">إجمالي عدد الطلبات والمبيعات 🛍️</span>
                  <span className="text-lg font-black text-blue-950 dark:text-blue-300">
                    {orders.length} طلبات
                  </span>
                  <span className="text-[9px] text-gray-400 block font-semibold">بما يشمل الطلبات المسلمة والجديدة</span>
                </div>
              </div>

              {/* Advanced Filterable Ledger / Log */}
              <div className="space-y-4">
                <h4 className="text-xs font-black text-gray-900 dark:text-white text-right">
                  دفتر الأستاذ وحركات إيداع الرصيد التفصيلية 📝
                </h4>

                {recharges.length === 0 ? (
                  <div className="text-center py-8 text-gray-400 text-xs font-semibold">
                    لا يوجد أي عمليات إيداع أو شحن مسجلة بعد في النظام.
                  </div>
                ) : (
                  <div className="border rounded-2xl overflow-hidden bg-white dark:bg-gray-900 shadow-sm border-amber-100/40 dark:border-gray-800">
                    <div className="overflow-x-auto">
                      <table className="w-full text-right text-xs border-collapse">
                        <thead>
                          <tr className="bg-amber-500/5 border-b border-amber-100/45 dark:border-gray-800 text-amber-950 dark:text-amber-300 font-black">
                            <th className="p-3 text-right">صاحب الحساب والطلب</th>
                            <th className="p-3 text-right">حساب المحول منه / رقم المرجع</th>
                            <th className="p-3 text-right">اسم المحول</th>
                            <th className="p-3 text-right">المبلغ</th>
                            <th className="p-3 text-right">التاريخ والوقت</th>
                            <th className="p-3 text-right">الحالة الحالية</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                          {recharges.map((req) => (
                            <tr key={req.id} className="hover:bg-amber-500/5 transition">
                              <td className="p-3 font-extrabold text-gray-900 dark:text-white text-right">
                                <div>{req.userName}</div>
                                <div className="text-[9px] text-gray-400 font-medium" dir="ltr">{req.userPhone}</div>
                              </td>
                              <td className="p-3 text-gray-500 font-mono text-right">{req.senderAccount}</td>
                              <td className="p-3 font-semibold text-gray-700 dark:text-gray-300 text-right">{req.senderName}</td>
                              <td className="p-3 font-black text-amber-800 dark:text-amber-400 text-right">{req.amount} YER</td>
                              <td className="p-3 text-gray-400 text-[10px] text-right">{formatArabicDate(req.createdAt)}</td>
                              <td className="p-3 text-right">
                                <span className={`inline-block px-2.5 py-1 rounded-xl text-[9px] font-black ${
                                  req.status === 'approved' 
                                    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-400' 
                                    : req.status === 'rejected'
                                    ? 'bg-red-50 text-red-700 dark:bg-red-950/20 dark:text-red-400'
                                    : 'bg-amber-50 text-amber-700 dark:bg-amber-950/20 dark:text-amber-400'
                                }`}>
                                  {req.status === 'approved' ? 'مقبول ومغذى ✅' : req.status === 'rejected' ? 'مرفوض ❌' : 'قيد الانتظار ⏳'}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 11. SUPABASE DATABASE & CLOUD MANAGEMENT SECTION */}
          {activeTab === 'database' && (
            <div className="bg-white dark:bg-gray-900 p-6 rounded-3xl border border-amber-100/40 dark:border-gray-800 shadow-sm space-y-6 text-right">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-amber-50 dark:border-gray-800 pb-4">
                <div>
                  <h3 className="text-xs font-black text-amber-950 dark:text-amber-300 flex items-center gap-2">
                    <span className="inline-block p-1 bg-amber-500/10 rounded-lg text-amber-600">☁️</span>
                    إدارة الاتصال وقاعدة البيانات السحابية (Supabase)
                  </h3>
                  <p className="text-[10px] text-gray-400 mt-1">
                    التحكم ببيانات المتجر، التحقق من الاتصال، بناء الجداول تلقائياً وترحيل البيانات من Firebase
                  </p>
                </div>

                <button
                  onClick={fetchDbStatus}
                  disabled={isCheckingStatus}
                  className="bg-amber-100 hover:bg-amber-200 text-amber-900 dark:bg-gray-800 dark:hover:bg-gray-700 dark:text-amber-300 font-extrabold text-[10px] py-2 px-4 rounded-xl shadow-sm transition flex items-center gap-1.5 self-end sm:self-auto disabled:opacity-50"
                >
                  {isCheckingStatus ? (
                    <span className="animate-spin text-amber-600">⏳</span>
                  ) : (
                    <span>🔄</span>
                  )}
                  <span>تحديث حالة الاتصال</span>
                </button>
              </div>

              {/* Status and Stats Bento Row */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {/* Connection Status Card */}
                <div className={`p-5 rounded-2xl border text-right space-y-2 ${
                  dbStatus?.pgConnected 
                    ? 'bg-emerald-500/5 border-emerald-500/10' 
                    : 'bg-red-500/5 border-red-500/10'
                }`}>
                  <span className="text-[10px] text-gray-400 font-bold block">حالة الاتصال بـ PostgreSQL</span>
                  <div className="flex items-center gap-2">
                    <span className={`w-2.5 h-2.5 rounded-full ${dbStatus?.pgConnected ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`}></span>
                    <span className="text-xs font-black text-gray-800 dark:text-white">
                      {isCheckingStatus ? 'جاري الفحص...' : (dbStatus?.pgConnected ? 'متصل بنجاح ✅' : 'غير متصل ❌')}
                    </span>
                  </div>
                  {dbStatus?.error && (
                    <p className="text-[9px] text-red-600 font-semibold leading-relaxed line-clamp-2">
                      {dbStatus.error}
                    </p>
                  )}
                  {dbStatus?.supabaseUrl && (
                    <div className="text-[9px] text-gray-400 font-medium truncate" dir="ltr">
                      URL: {dbStatus.supabaseUrl}
                    </div>
                  )}
                </div>

                {/* Storage Size Card (Global Storage Counter) */}
                <div className="bg-gradient-to-br from-amber-500/5 to-amber-500/10 p-5 rounded-2xl border border-amber-500/10 text-right space-y-1 md:col-span-2">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] text-gray-400 font-bold block">العداد الإجمالي للاستهلاك الحقيقي (Global Storage) 💾</span>
                    <span className="text-[9.5px] bg-amber-500/10 text-amber-800 dark:text-amber-300 font-black px-2 py-0.5 rounded-full">
                      الحصة المجانية: 500 MB
                    </span>
                  </div>
                  
                  <div className="flex items-baseline gap-1.5 pt-1">
                    <span className="text-xl font-black text-amber-950 dark:text-amber-300">
                      {(() => {
                        const sizeStr = dbStatus?.databaseSizeMB || '0.05 MB';
                        const num = parseFloat(sizeStr);
                        if (isNaN(num)) return '0.050';
                        if (sizeStr.toLowerCase().includes('kb')) return (num / 1024).toFixed(4);
                        if (sizeStr.toLowerCase().includes('gb')) return (num * 1024).toFixed(3);
                        return num.toFixed(3);
                      })()}
                    </span>
                    <span className="text-xs font-extrabold text-amber-900/60 dark:text-amber-400/60">ميجابايت (MB)</span>
                  </div>

                  {/* Dynamic Progress Bar */}
                  {(() => {
                    const sizeStr = dbStatus?.databaseSizeMB || '0.05 MB';
                    const num = parseFloat(sizeStr);
                    let usedMB = num;
                    if (isNaN(num)) usedMB = 0.05;
                    else if (sizeStr.toLowerCase().includes('kb')) usedMB = num / 1024;
                    else if (sizeStr.toLowerCase().includes('gb')) usedMB = num * 1024;
                    
                    const percentUsed = Math.min(100, (usedMB / 500) * 100);
                    const isNearLimit = percentUsed >= 80;

                    return (
                      <div className="pt-2">
                        <div className="w-full bg-gray-100 dark:bg-gray-800/80 h-3 rounded-full overflow-hidden border border-gray-200/20 shadow-inner">
                          <div 
                            className={`h-full rounded-full transition-all duration-700 ${
                              percentUsed < 50 
                                ? 'bg-gradient-to-r from-emerald-500 to-teal-400' 
                                : percentUsed < 80 
                                  ? 'bg-gradient-to-r from-amber-500 to-orange-400' 
                                  : 'bg-gradient-to-r from-rose-600 to-red-500 animate-pulse'
                            }`}
                            style={{ width: `${percentUsed}%` }}
                          />
                        </div>
                        <div className="flex justify-between items-center text-[9px] text-gray-400 font-bold mt-1.5">
                          <span>نسبة الاستهلاك: {percentUsed.toFixed(4)}%</span>
                          {isNearLimit && (
                            <span className="text-red-500 font-black animate-pulse">⚠️ تنبيه: اقتربت السعة من النفاد!</span>
                          )}
                        </div>
                      </div>
                    );
                  })()}
                </div>

                {/* Tables Created Card */}
                <div className="bg-gradient-to-br from-blue-500/5 to-blue-500/10 p-5 rounded-2xl border border-blue-500/10 text-right space-y-1">
                  <span className="text-[10px] text-gray-400 font-bold block">عدد الجداول المهيأة والمبنية 📊</span>
                  <span className="text-lg font-black text-blue-950 dark:text-blue-300 block">
                    {isCheckingStatus ? '...' : (`${dbStatus?.tablesCount || 0} / 16`)}
                  </span>
                  <span className="text-[9px] text-gray-400 block font-semibold">
                    {dbStatus?.tablesCount === 16 ? 'قاعدة البيانات مبنية بالكامل (16 جدولاً)!' : 'جداول المسابقات والتصويت جاهزة.'}
                  </span>
                </div>

                {/* Dual Database Backup Card */}
                <div className="bg-gradient-to-br from-purple-500/5 to-purple-500/10 p-5 rounded-2xl border border-purple-500/15 text-right space-y-4 md:col-span-2 shadow-sm">
                  <div className="flex items-center justify-between border-b border-purple-500/10 pb-2">
                    <span className="text-xs text-purple-700 dark:text-purple-400 font-black block flex items-center gap-1">
                      <span>🟢</span> إدارة تكامل وتخزين جوجل شيتس (Google Sheets Integration)
                    </span>
                    
                    {/* Toggle Switch */}
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-gray-500 font-medium">وضع جوجل درايف</span>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input 
                          type="checkbox" 
                          checked={isBackupMode} 
                          onChange={(e) => toggleBackupMode(e.target.checked)}
                          className="sr-only peer" 
                        />
                        <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-gray-600 peer-checked:bg-purple-600"></div>
                      </label>
                    </div>
                  </div>

                  {/* Connection Status and Live Stats Display */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-white dark:bg-gray-900/50 p-3.5 rounded-xl border border-purple-500/10 text-right">
                    <div className="space-y-1.5 border-l border-purple-500/10 pl-3">
                      <span className="text-[10px] text-gray-400 font-bold block">📶 حالة الاتصال بالشيت:</span>
                      <span className="text-[11px] font-black text-purple-700 dark:text-purple-300 block">
                        {googleStats.status}
                      </span>
                      <span className="text-[9px] text-gray-500 block">
                        آخر فحص: {googleStats.lastCheck}
                      </span>
                    </div>

                    <div className="space-y-1">
                      <span className="text-[10px] text-gray-400 font-bold block">📊 إجمالي البيانات المخزنة في شيت:</span>
                      <div className="grid grid-cols-3 gap-1 text-center mt-1">
                        <div className="bg-purple-500/5 p-1 rounded border border-purple-500/5">
                          <span className="text-[8px] text-gray-400 block font-bold">المنتجات</span>
                          <span className="text-xs font-black text-purple-600 dark:text-purple-400">{googleStats.productsCount}</span>
                        </div>
                        <div className="bg-purple-500/5 p-1 rounded border border-purple-500/5">
                          <span className="text-[8px] text-gray-400 block font-bold">الأقسام</span>
                          <span className="text-xs font-black text-purple-600 dark:text-purple-400">{googleStats.categoriesCount}</span>
                        </div>
                        <div className="bg-purple-500/5 p-1 rounded border border-purple-500/5">
                          <span className="text-[8px] text-gray-400 block font-bold">الالتحاق/الطلبات</span>
                          <span className="text-xs font-black text-purple-600 dark:text-purple-400">{googleStats.ordersCount}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Mode badge details */}
                  <div className="bg-purple-500/5 px-3 py-1.5 rounded-lg border border-purple-500/5 text-[10px] font-bold text-gray-700 dark:text-gray-300 flex items-center justify-between">
                    <span>الوضع الفعّال حالياً:</span>
                    <span className={isBackupMode ? "text-purple-600 dark:text-purple-400 font-black" : "text-emerald-600 dark:text-emerald-400 font-black"}>
                      {isBackupMode ? 'جوجل شيتس 🟢 (نشط وتخزين كامل)' : 'سوبابيس 🔵 (القاعدة الأساسية)'}
                    </span>
                  </div>

                  {/* Google Spreadsheet URL Link */}
                  {googleStats.spreadsheetUrl && (
                    <div className="bg-emerald-500/10 p-2.5 rounded-xl border border-emerald-500/20 text-center animate-pulse">
                      <a 
                        href={googleStats.spreadsheetUrl} 
                        target="_blank" 
                        rel="noopener noreferrer" 
                        className="text-[11px] font-black text-emerald-700 dark:text-emerald-400 hover:underline flex items-center justify-center gap-1.5"
                      >
                        <span>📂</span>
                        <span>فتح ملف جوجل شيتس (قاعدة البيانات) في درايف مباشرة 🔗</span>
                      </a>
                    </div>
                  )}

                  {/* Google Script Custom Web App URL Input */}
                  <div className="space-y-1">
                    <label className="text-[10px] text-gray-500 dark:text-gray-400 font-bold block">رابط سكريبت جوجل الخاص بكِ:</label>
                    <div className="flex gap-1.5">
                      <input 
                        type="text" 
                        value={googleScriptUrl} 
                        onChange={(e) => setGoogleScriptUrlState(e.target.value)} 
                        dir="ltr"
                        placeholder="https://script.google.com/macros/s/.../exec"
                        className="flex-1 bg-white dark:bg-gray-800 text-[10px] py-1.5 px-2 border rounded-lg focus:outline-none focus:ring-1 focus:ring-purple-500 truncate"
                      />
                      <button 
                        onClick={handleSaveGoogleScriptUrl}
                        className="bg-purple-600 hover:bg-purple-700 text-white font-bold text-[10px] px-2.5 py-1.5 rounded-lg transition shrink-0 shadow-sm"
                        title="حفظ وتحديث الرابط"
                      >
                        حفظ 💾
                      </button>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <button
                      onClick={handleTestGoogleConnection}
                      disabled={isTestingGoogle}
                      className="w-full text-center bg-white dark:bg-gray-800 border border-purple-500/20 hover:border-purple-500/40 text-purple-700 dark:text-purple-400 font-bold text-[10px] py-2 px-3 rounded-xl transition disabled:opacity-50 flex items-center justify-center gap-1.5 shadow-sm"
                    >
                      {isTestingGoogle ? 'جاري الفحص...' : '🔂 فحص واختبار الاتصال بالشيت'}
                    </button>

                    <button
                      onClick={handleTransferAllDataToGoogle}
                      disabled={isTransferringGoogle}
                      className="w-full text-center bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-black text-[10px] py-2 px-3 rounded-xl shadow-md transition disabled:opacity-50 flex items-center justify-center gap-1.5"
                    >
                      {isTransferringGoogle ? (
                        <>
                          <span className="animate-spin text-white">⏳</span>
                          <span>جاري المزامنة...</span>
                        </>
                      ) : (
                        <>
                          <span>مزامنة وتحديث كافة البيانات الآن 🔄</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* Confirmation note of continuous auto drive storage */}
                  <div className="bg-purple-500/5 p-2.5 rounded-xl border border-purple-500/10 space-y-1 text-right text-[9.5px]">
                    <span className="text-purple-700 dark:text-purple-300 font-black block">🛡️ آلية المزامنة المستمرة والمستقلة:</span>
                    <p className="text-gray-500 dark:text-gray-400 leading-relaxed font-medium">
                      عند تنشيط وضع جوجل، يتم إرسال الإضافات والتعديلات وحذف البيانات فورياً وبشكل تلقائي إلى شيت جوجل مع مزامنتها مع Firebase و Supabase لضمان عمل التطبيق بكفاءة كاملة واستقلالية مطلقة حتى لو تعذر الاتصال بـ Supabase!
                    </p>
                  </div>
                </div>
              </div>

              {/* 📊 Detailed Supabase Tables Monitor & Statistics */}
              <div className="bg-white dark:bg-gray-850 rounded-2xl border border-amber-100/40 dark:border-gray-800/80 p-5 space-y-4 shadow-sm text-right">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-amber-50 dark:border-gray-800/60 pb-3">
                  <div>
                    <h4 className="text-xs font-black text-amber-950 dark:text-amber-300 flex items-center gap-1.5">
                      <span>📊</span>
                      هيكلة وإحصائيات جداول قاعدة البيانات السحابية (Supabase)
                    </h4>
                    <p className="text-[10px] text-gray-400 mt-0.5">
                      تفاصيل استهلاك البيانات والمساحة وعدد الصفوف المخزنة في كل جدول سحابي
                    </p>
                  </div>
                  
                  {isFetchingStats && (
                    <div className="text-[10px] text-amber-600 dark:text-amber-400 font-extrabold flex items-center gap-1">
                      <span className="animate-spin text-amber-600">⏳</span>
                      جاري فحص وتحديث الجداول...
                    </div>
                  )}
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-xs font-semibold text-right">
                    <thead>
                      <tr className="bg-amber-500/5 text-amber-950 dark:text-amber-300 border-b border-amber-50/50 dark:border-gray-800">
                        <th className="p-3 text-right">اسم الجدول (سوبابيس)</th>
                        <th className="p-3 text-right">المحتوى والبيانات</th>
                        <th className="p-3 text-center">عدد الصفوف والعمليات</th>
                        <th className="p-3 text-center">حجم التخزين (KB)</th>
                        <th className="p-3 text-center">معدل الاستهلاك 🔋</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tableStats.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="text-center py-6 text-gray-400 font-bold">
                            {isFetchingStats ? 'جاري تحميل تفاصيل الجداول...' : 'لم يتم استرجاع إحصائيات الجداول، يرجى تحديث حالة الاتصال.'}
                          </td>
                        </tr>
                      ) : (
                        tableStats.map(stat => {
                          const tableMeta = TABLE_ARABIC_NAMES[stat.tableName] || {
                            title: stat.tableName,
                            desc: 'جدول بيانات مخصص في النظام السحابي',
                            icon: '📁'
                          };
                          
                          // Determine consumption badge
                          let consumptionColor = 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400';
                          let consumptionText = 'منخفض جداً';
                          if (stat.count > 1000) {
                            consumptionColor = 'bg-rose-500/10 text-rose-700 dark:text-rose-400 animate-pulse';
                            consumptionText = 'مرتفع جداً ⚠️';
                          } else if (stat.count > 300) {
                            consumptionColor = 'bg-orange-500/10 text-orange-700 dark:text-orange-400';
                            consumptionText = 'مرتفع';
                          } else if (stat.count > 50) {
                            consumptionColor = 'bg-amber-500/10 text-amber-700 dark:text-amber-400';
                            consumptionText = 'متوسط';
                          } else if (stat.count > 0) {
                            consumptionColor = 'bg-blue-500/10 text-blue-700 dark:text-blue-400';
                            consumptionText = 'منخفض';
                          }

                          return (
                            <tr key={stat.tableName} className="border-b border-gray-50 dark:border-gray-800/40 hover:bg-amber-50/10 dark:hover:bg-gray-800/10">
                              <td className="p-3">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm">{tableMeta.icon}</span>
                                  <div>
                                    <div className="font-extrabold text-gray-800 dark:text-gray-200">{tableMeta.title}</div>
                                    <div className="text-[9px] text-gray-400 font-mono tracking-wide" dir="ltr">{stat.tableName}</div>
                                  </div>
                                </div>
                              </td>
                              <td className="p-3 text-gray-500 dark:text-gray-400 text-[10.5px]">
                                {tableMeta.desc}
                              </td>
                              <td className="p-3 text-center font-black text-gray-900 dark:text-white">
                                {stat.count.toLocaleString()} صف
                              </td>
                              <td className="p-3 text-center font-mono text-gray-700 dark:text-gray-300">
                                {stat.sizeKb.toFixed(1)} KB
                              </td>
                              <td className="p-3 text-center">
                                <span className={`inline-block text-[9.5px] font-black px-2.5 py-1 rounded-full ${consumptionColor}`}>
                                  {consumptionText}
                                </span>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Action Panels */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                
                {/* Panel 1: Table Schema Setup */}
                <div className="bg-amber-500/5 p-6 rounded-2xl border border-amber-500/10 space-y-4">
                  <h4 className="text-xs font-black text-amber-950 dark:text-amber-300 flex items-center gap-2">
                    <span>⚡</span>
                    توليد وتهيئة الجداول تلقائياً (Auto-Schema)
                  </h4>
                  <p className="text-[10px] text-gray-500 leading-relaxed">
                    لا داعي لنسخ ولصق كود SQL يدوياً في لوحة Supabase! انقري على الزر أدناه ليقوم النظام بالاتصال بقاعدة بياناتكِ وبناء الجداول الـ 14، الفهارس، وسياسات الحماية RLS، وحاويات الصور تلقائياً في ثوانٍ معدودة.
                  </p>
                  
                  <button
                    onClick={handleCreateSchema}
                    disabled={isCreatingSchema || isCheckingStatus}
                    className="w-full bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white py-3 px-4 rounded-xl font-black text-xs transition shadow-md flex items-center justify-center gap-2 font-bold"
                  >
                    {isCreatingSchema ? (
                      <>
                        <span className="animate-spin text-white">⏳</span>
                        <span>جاري إنشاء هيكلة قاعدة البيانات...</span>
                      </>
                    ) : (
                      <>
                        <span>🛠️</span>
                        <span>إنشاء قاعدة بيانات التطبيق الدائمة تلقائياً</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Panel 2: Cloud Data Migration */}
                <div className="bg-emerald-500/5 p-6 rounded-2xl border border-emerald-500/10 space-y-4">
                  <h4 className="text-xs font-black text-emerald-950 dark:text-emerald-300 flex items-center gap-2">
                    <span>🚀</span>
                    ترحيل البيانات بالكامل (Firebase ➡️ Supabase)
                  </h4>
                  <p className="text-[10px] text-gray-500 leading-relaxed">
                    ترحيل ممتلكات المتجر السابقة (حوالي 200 صنف، العملاء، الإعدادات، الطلبات السابقة) بنظام آمن ومطابق بالكامل. تعتمد هذه العملية على تكنولوجيا Upsert لضمان تفادي تكرار البيانات في حال تكرار الترحيل.
                  </p>

                  {/* Toggle button for custom Firebase source config */}
                  <div className="pt-1">
                    <button
                      type="button"
                      onClick={() => setShowFirebaseInputs(!showFirebaseInputs)}
                      className="text-[10px] text-emerald-700 dark:text-emerald-400 font-black hover:underline flex items-center gap-1 transition"
                    >
                      <span>{showFirebaseInputs ? '🔼 إخفاء' : '🔽 عرض وتعديل'} مفاتيح اتصال Firebase المصدر (لأغراض النقل)</span>
                    </button>
                  </div>

                  {showFirebaseInputs && (
                    <div className="bg-white dark:bg-gray-950 border border-emerald-500/10 p-4 rounded-xl space-y-3 text-right">
                      <p className="text-[9px] text-gray-400 leading-normal font-medium">
                        مفاتيح الاتصال بقاعدة بيانات Firebase (Firestore) السابقة ليتم سحب المنتجات والعملاء والبيانات منها تمهيداً لصبها في Supabase.
                      </p>
                      
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-right">
                        <div className="space-y-1">
                          <label className="text-[9px] text-gray-500 font-bold block">معرّف المشروع (Project ID)</label>
                          <input
                            type="text"
                            value={sourceFirebase.projectId}
                            onChange={(e) => setSourceFirebase({ ...sourceFirebase, projectId: e.target.value })}
                            className="w-full text-[10px] p-2 border border-gray-100 dark:border-gray-800 rounded-lg bg-gray-50 dark:bg-gray-900 font-mono text-left"
                            dir="ltr"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[9px] text-gray-500 font-bold block">مفتاح API Key</label>
                          <input
                            type="text"
                            value={sourceFirebase.apiKey}
                            onChange={(e) => setSourceFirebase({ ...sourceFirebase, apiKey: e.target.value })}
                            className="w-full text-[10px] p-2 border border-gray-100 dark:border-gray-800 rounded-lg bg-gray-50 dark:bg-gray-900 font-mono text-left"
                            dir="ltr"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[9px] text-gray-500 font-bold block">معرّف التطبيق (App ID)</label>
                          <input
                            type="text"
                            value={sourceFirebase.appId}
                            onChange={(e) => setSourceFirebase({ ...sourceFirebase, appId: e.target.value })}
                            className="w-full text-[10px] p-2 border border-gray-100 dark:border-gray-800 rounded-lg bg-gray-50 dark:bg-gray-900 font-mono text-left"
                            dir="ltr"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[9px] text-gray-500 font-bold block">نطاق المصادقة (Auth Domain)</label>
                          <input
                            type="text"
                            value={sourceFirebase.authDomain}
                            onChange={(e) => setSourceFirebase({ ...sourceFirebase, authDomain: e.target.value })}
                            className="w-full text-[10px] p-2 border border-gray-100 dark:border-gray-800 rounded-lg bg-gray-50 dark:bg-gray-900 font-mono text-left"
                            dir="ltr"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[9px] text-gray-500 font-bold block">حاوية التخزين (Storage Bucket)</label>
                          <input
                            type="text"
                            value={sourceFirebase.storageBucket}
                            onChange={(e) => setSourceFirebase({ ...sourceFirebase, storageBucket: e.target.value })}
                            className="w-full text-[10px] p-2 border border-gray-100 dark:border-gray-800 rounded-lg bg-gray-50 dark:bg-gray-900 font-mono text-left"
                            dir="ltr"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[9px] text-gray-500 font-bold block">معرّف المرسل (Sender ID)</label>
                          <input
                            type="text"
                            value={sourceFirebase.messagingSenderId}
                            onChange={(e) => setSourceFirebase({ ...sourceFirebase, messagingSenderId: e.target.value })}
                            className="w-full text-[10px] p-2 border border-gray-100 dark:border-gray-800 rounded-lg bg-gray-50 dark:bg-gray-900 font-mono text-left"
                            dir="ltr"
                          />
                        </div>
                        <div className="space-y-1 sm:col-span-2">
                          <label className="text-[9px] text-gray-500 font-bold block">معرّف قاعدة بيانات Firestore (Database ID)</label>
                          <input
                            type="text"
                            value={sourceFirebase.firestoreDatabaseId}
                            onChange={(e) => setSourceFirebase({ ...sourceFirebase, firestoreDatabaseId: e.target.value })}
                            className="w-full text-[10px] p-2 border border-gray-100 dark:border-gray-800 rounded-lg bg-gray-50 dark:bg-gray-900 font-mono text-left"
                            dir="ltr"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                  
                  <button
                    onClick={handleSupabaseMigration}
                    disabled={isMigratingSupabase || isCheckingStatus || dbStatus?.tablesCount === 0}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white py-3 px-4 rounded-xl font-black text-xs transition shadow-md flex items-center justify-center gap-2 font-bold"
                  >
                    {isMigratingSupabase ? (
                      <>
                        <span className="animate-spin text-white">⏳</span>
                        <span>جاري ترحيل البيانات السحابية...</span>
                      </>
                    ) : (
                      <>
                        <span>📤</span>
                        <span>بدء عملية الترحيل السحابية الشاملة</span>
                      </>
                    )}
                  </button>
                  {dbStatus?.tablesCount === 0 && (
                    <p className="text-[9px] text-amber-600 font-bold text-center">
                      ⚠️ يجب تهيئة وبناء الجداول أولاً قبل ترحيل البيانات!
                    </p>
                  )}
                </div>

                {/* Panel 3: Identity Engineering (UID Migration) */}
                <div className="bg-indigo-500/5 p-6 rounded-2xl border border-indigo-500/10 space-y-4 col-span-1 md:col-span-2">
                  <h4 className="text-xs font-black text-indigo-950 dark:text-indigo-300 flex items-center gap-2">
                    <span>🆔</span>
                    نظام ترحيل وهجرة معرفات العملاء (UID Migration 7 ➡️ 9)
                  </h4>
                  <p className="text-[10px] text-gray-500 leading-relaxed">
                    لتطبيق المعايير القياسية للهوية في متجر أم روح، تقوم هذه العملية بترقية كافة معرّفات العملاء التي تبدأ بالرقم <b>7</b> إلى معرّفات جديدة بطول 9 أرقام تبدأ بالرقم <b>9</b>. تقوم الأداة أيضاً تلقائياً بتحديث كافة روابط المعرفات في الطلبات، الهدايا، طلبات الشحن، السجلات، والمتسابقين لضمان عدم فقدان أي بيانات أو أرصدة.
                  </p>
                  
                  {migrationUserResult && (
                    <div className="bg-indigo-50 dark:bg-indigo-950/20 text-indigo-700 dark:text-indigo-400 p-3 rounded-xl text-[10.5px] font-bold border border-indigo-100 dark:border-indigo-900/30">
                      🎉 {migrationUserResult}
                    </div>
                  )}

                  <button
                    onClick={handleMigrateUserIds7To9}
                    disabled={isMigratingUserIds}
                    className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white py-3 px-4 rounded-xl font-black text-xs transition shadow-md flex items-center justify-center gap-2"
                  >
                    {isMigratingUserIds ? (
                      <>
                        <span className="animate-spin text-white">⏳</span>
                        <span>جاري ترحيل وتحديث المعرّفات...</span>
                      </>
                    ) : (
                      <>
                        <span>🛠️</span>
                        <span>تشغيل هجرة معرفات المستخدمين (7 إلى 9) وتحديث الروابط</span>
                      </>
                    )}
                  </button>
                </div>

              </div>

              {/* Migration / Schema Real-time Progress Map */}
              {(isMigratingSupabase || Object.keys(migrationProgress).length > 0) && (
                <div className="bg-gray-50 dark:bg-gray-950/40 p-5 rounded-2xl border border-gray-100 dark:border-gray-800 space-y-4">
                  <h4 className="text-xs font-black text-gray-800 dark:text-white">عداد تقدّم ترحيل الجداول سحابياً 📊</h4>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {(Object.values(migrationProgress) as MigrationProgress[]).map((progress, idx) => (
                      <div key={idx} className="bg-white dark:bg-gray-900 p-3 rounded-xl border border-gray-100 dark:border-gray-800 text-right space-y-1.5 shadow-sm">
                        <div className="flex justify-between items-center text-[10px]">
                          <span className="font-extrabold text-gray-700 dark:text-gray-300">{progress.step}</span>
                          <span className={`font-black ${
                            progress.status === 'success' ? 'text-emerald-600' : 
                            progress.status === 'error' ? 'text-red-500' : 'text-amber-500'
                          }`}>
                            {progress.status === 'success' ? 'تم بنجاح ✓' : 
                             progress.status === 'error' ? 'خطأ ✗' : 'جاري العمل... ⏳'}
                          </span>
                        </div>
                        {progress.total > 0 ? (
                          <div className="space-y-1">
                            <div className="w-full bg-gray-100 dark:bg-gray-800 h-2 rounded-full overflow-hidden">
                              <div 
                                className="bg-emerald-500 h-full transition-all duration-300"
                                style={{ width: `${(progress.count / progress.total) * 100}%` }}
                              ></div>
                            </div>
                            <span className="text-[9px] text-gray-400 font-bold block">
                              تم ترحيل {progress.count} من أصل {progress.total} سجل سحابي
                            </span>
                          </div>
                        ) : (
                          <span className="text-[9px] text-gray-400 font-semibold block">
                            {progress.message}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Real-time Logger Console */}
              {(migrationLogs.length > 0 || isCreatingSchema) && (
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <h4 className="text-xs font-black text-gray-800 dark:text-white">سجل العمليات والتشخيص المباشر 📜</h4>
                    <button 
                      onClick={() => setMigrationLogs([])}
                      className="text-[9px] text-red-500 font-extrabold hover:underline"
                    >
                      مسح السجل
                    </button>
                  </div>
                  <div className="bg-gray-900 text-emerald-400 p-4 rounded-2xl border border-gray-800 font-mono text-[9px] text-right space-y-1 max-h-48 overflow-y-auto" dir="ltr">
                    {migrationLogs.map((log, index) => (
                      <div key={index} className="leading-relaxed">
                        &gt; {log}
                      </div>
                    ))}
                    {isCreatingSchema && <div>&gt; [PG Engine] connecting and building public schema...</div>}
                  </div>
                </div>
              )}

              {/* Vercel Environment Variables Code Export block */}
              <div className="bg-blue-500/5 p-6 rounded-2xl border border-blue-500/10 space-y-4">
                <div className="flex justify-between items-center border-b border-blue-100 dark:border-blue-900/40 pb-2">
                  <h4 className="text-xs font-black text-blue-950 dark:text-blue-300 flex items-center gap-2">
                    <span>📋</span>
                    ملف متغيرات البيئة (.env) الجاهز لـ Vercel
                  </h4>
                  <button
                    onClick={() => {
                      const envText = `GEMINI_API_KEY="AIzaSyD87LfHQ8Vsso3qT6i4M1Y2durdpeuU1Ow"
VITE_FIREBASE_PROJECT_ID="leafy-standard-n8gvj"
VITE_FIREBASE_APP_ID="1:24741312317:web:5d3c59dcf3de9bb4aab754"
VITE_FIREBASE_API_KEY="AIzaSyCce8aoROlJ05qVNJS4WmvH7VNm0WN9nMA"
VITE_FIREBASE_AUTH_DOMAIN="leafy-standard-n8gvj.firebaseapp.com"
VITE_FIREBASE_DATABASE_ID="ai-studio-remixremixumrouh-788e1ecc-2d9c-4f86-947b-88e08702aa1f"
VITE_FIREBASE_STORAGE_BUCKET="leafy-standard-n8gvj.firebasestorage.app"
VITE_FIREBASE_MESSAGING_SENDER_ID="24741312317"
VITE_SUPABASE_URL="https://kyvfjiwihwmorddsrbvd.supabase.co"
VITE_SUPABASE_ANON_KEY="sb_publishable_Q6xbXEplacGjhDbAeZJ5Mw_LoCtnzp1"
SUPABASE_SERVICE_ROLE_KEY="sb_secret_J9Qzdw6UqD5y6Tis1eCspw_LBavT69p"
DATABASE_URL="postgresql://postgres:%3FG7WW5dMUa%2Bcxyg@db.kyvfjiwihwmorddsrbvd.supabase.co:5432/postgres"`;
                      navigator.clipboard.writeText(envText);
                      showToast('📋 تم نسخ ملف متغيرات البيئة بالكامل بنجاح!');
                    }}
                    className="text-[9px] bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-950/40 dark:text-blue-300 py-1.5 px-3 rounded-lg font-black transition"
                  >
                    نسخ الكود بالكامل 📄
                  </button>
                </div>
                
                <p className="text-[10px] text-gray-500 leading-relaxed">
                  قومي بنسخ هذه المتغيرات بالكامل وإضافتها إلى لوحة تحكم Vercel الخاصة بمشروعكِ في قسم <strong>Settings -&gt; Environment Variables</strong> لضمان عمل المتجر بشكل مستقل. تم ترميز كلمة المرور مسبقاً لمنع أي مشاكل اتصال سحابية.
                </p>

                <div className="bg-gray-50 dark:bg-gray-950 p-4 rounded-xl border border-gray-100 dark:border-gray-800 text-[10px] font-mono text-left space-y-1 text-gray-600 dark:text-gray-300 overflow-x-auto" dir="ltr">
                  <div>GEMINI_API_KEY="AIzaSyD87LfHQ8Vsso3qT6i4M1Y2durdpeuU1Ow"</div>
                  <div>VITE_FIREBASE_PROJECT_ID="leafy-standard-n8gvj"</div>
                  <div>VITE_FIREBASE_APP_ID="1:24741312317:web:5d3c59dcf3de9bb4aab754"</div>
                  <div>VITE_FIREBASE_API_KEY="AIzaSyCce8aoROlJ05qVNJS4WmvH7VNm0WN9nMA"</div>
                  <div>VITE_FIREBASE_AUTH_DOMAIN="leafy-standard-n8gvj.firebaseapp.com"</div>
                  <div>VITE_FIREBASE_DATABASE_ID="ai-studio-remixremixumrouh-788e1ecc-2d9c-4f86-947b-88e08702aa1f"</div>
                  <div>VITE_FIREBASE_STORAGE_BUCKET="leafy-standard-n8gvj.firebasestorage.app"</div>
                  <div>VITE_FIREBASE_MESSAGING_SENDER_ID="24741312317"</div>
                  <div>VITE_SUPABASE_URL="https://kyvfjiwihwmorddsrbvd.supabase.co"</div>
                  <div>VITE_SUPABASE_ANON_KEY="sb_publishable_Q6xbXEplacGjhDbAeZJ5Mw_LoCtnzp1"</div>
                  <div>SUPABASE_SERVICE_ROLE_KEY="sb_secret_J9Qzdw6UqD5y6Tis1eCspw_LBavT69p"</div>
                  <div className="text-emerald-600 dark:text-emerald-400 font-bold">DATABASE_URL="postgresql://postgres:%3FG7WW5dMUa%2Bcxyg@db.kyvfjiwihwmorddsrbvd.supabase.co:5432/postgres"</div>
                </div>
              </div>

            </div>
          )}

          {/* 12. EVENTS & LIVE VOTING MANAGEMENT SECTION */}
          {activeTab === 'events' && (
            <div className="bg-white dark:bg-gray-900 p-6 rounded-3xl border border-amber-100/40 dark:border-gray-800 shadow-sm space-y-6 text-right">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-amber-50 dark:border-gray-800 pb-4">
                <div>
                  <h3 className="text-xs font-black text-amber-950 dark:text-amber-300 flex items-center gap-2">
                    <span className="inline-block p-1 bg-amber-500/10 rounded-lg text-amber-600">🏆</span>
                    إدارة الفعاليات والتصويت المباشر (Events & Live Voting)
                  </h3>
                  <p className="text-[10px] text-gray-400 mt-1">
                    التحكم في تفعيل مسابقات متجر أم روح الكبرى وتصفير الفعاليات وإدارة المتسابقين وطباعة النتائج
                  </p>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={handlePrintContestants}
                    className="bg-gray-100 hover:bg-gray-200 text-gray-800 dark:bg-gray-800 dark:text-gray-300 font-extrabold text-[10px] py-2 px-4 rounded-xl shadow-sm transition flex items-center gap-1.5"
                  >
                    <span>🖨️</span>
                    <span>طباعة بيانات المتسابقين</span>
                  </button>
                  <button
                    onClick={handleClearAllEventData}
                    className="bg-red-50 hover:bg-red-100 text-red-600 dark:bg-red-950/20 dark:text-red-400 font-extrabold text-[10px] py-2 px-4 rounded-xl shadow-sm transition flex items-center gap-1.5"
                  >
                    <span>🗑️</span>
                    <span>تصفير وتفريغ الفعالية</span>
                  </button>
                </div>
              </div>

              {/* Event configuration card */}
              <div className="bg-gradient-to-br from-amber-500/5 to-amber-500/10 p-5 rounded-2xl border border-amber-500/10 space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-black text-amber-950 dark:text-amber-300 flex items-center gap-1">
                    <span>⚙️</span> إعدادات المسابقة والفعالية النشطة
                  </h4>

                  {/* Toggle Checkbox */}
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-gray-500 font-bold">تفعيل الفعالية للجمهور</span>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={isEventActive} 
                        onChange={(e) => setIsEventActive(e.target.checked)}
                        className="sr-only peer" 
                      />
                      <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-gray-600 peer-checked:bg-amber-500"></div>
                    </label>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] text-gray-500 font-bold block">عنوان الفعالية:</label>
                    <input 
                      type="text" 
                      value={eventTitle} 
                      onChange={(e) => setEventTitle(e.target.value)} 
                      className="w-full bg-white dark:bg-gray-800 text-[11px] font-bold py-2 px-3 border rounded-xl focus:outline-none focus:ring-1 focus:ring-amber-500"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] text-gray-500 font-bold block">جائزة الفائز الأول:</label>
                    <input 
                      type="text" 
                      value={eventWinnerPrize} 
                      onChange={(e) => setEventWinnerPrize(e.target.value)} 
                      className="w-full bg-white dark:bg-gray-800 text-[11px] font-bold py-2 px-3 border rounded-xl focus:outline-none focus:ring-1 focus:ring-amber-500"
                    />
                  </div>
                  <div className="space-y-1 sm:col-span-2">
                    <label className="text-[10px] text-gray-500 font-bold block">رابط صورة الفعالية:</label>
                    <input 
                      type="text" 
                      value={eventImageUrl} 
                      onChange={(e) => setEventImageUrl(e.target.value)} 
                      placeholder="رابط مباشر لغلاف المسابقة (اختياري)"
                      className="w-full bg-white dark:bg-gray-800 text-[11px] py-2 px-3 border rounded-xl focus:outline-none focus:ring-1 focus:ring-amber-500 text-left"
                      dir="ltr"
                    />
                  </div>
                  <div className="space-y-1 sm:col-span-2">
                    <label className="text-[10px] text-gray-500 font-bold block">وصف وتفاصيل المسابقة والجوائز:</label>
                    <textarea 
                      value={eventDescription} 
                      onChange={(e) => setEventDescription(e.target.value)} 
                      rows={3}
                      className="w-full bg-white dark:bg-gray-800 text-[11px] py-2 px-3 border rounded-xl focus:outline-none focus:ring-1 focus:ring-amber-500 leading-relaxed"
                    />
                  </div>
                </div>

                <div className="flex justify-end pt-1">
                  <button
                    onClick={handleSaveEventSettings}
                    className="bg-amber-500 hover:bg-amber-600 text-white font-extrabold text-[11px] py-2.5 px-6 rounded-xl shadow-md transition"
                  >
                    حفظ إعدادات الفعالية والمسابقة 🏆
                  </button>
                </div>
              </div>

              {/* Automated contestant self-joining notice */}
              <div className="bg-amber-500/5 p-5 rounded-2xl border border-amber-500/10 space-y-2 text-right">
                <h4 className="text-xs font-black text-amber-900 dark:text-amber-300 flex items-center gap-1.5">
                  <span>✨</span> آلية التسجيل الذاتي والإنضمام التلقائي للمتسابقين
                </h4>
                <p className="text-[10px] text-gray-500 leading-relaxed font-semibold">
                  تم إلغاء نموذج إضافة المتسابقين يدوياً بالكامل لضمان عدالة وموثوقية المسابقة. الآن، ينضم المتسابقون تلقائياً وبشكل ذاتي بمجرد فتح ومشاركة روابط الدعوة أو عند استلام أول صوت تأييد لهم عبر الواجهة العامة للتطبيق، دون أي حاجة لتدخل بشري من لوحة الإدارة! 🏆🌸
                </p>
              </div>

              {/* Contestants listing & real-time votes */}
              <div className="space-y-3">
                <h4 className="text-xs font-black text-gray-800 dark:text-white">قائمة المتسابقين المسجلين حالياً ونسبة الأصوات 📊</h4>

                {contestants.length === 0 ? (
                  <div className="text-center py-8 bg-gray-50 dark:bg-gray-950/20 rounded-2xl border border-gray-100 dark:border-gray-800">
                    <span className="text-2xl">🗳️</span>
                    <p className="text-[11px] text-gray-400 font-semibold mt-2">لا يوجد أي متسابقين مسجلين في المسابقة حالياً.</p>
                  </div>
                ) : (
                  <div className="overflow-hidden border border-gray-100 dark:border-gray-800 rounded-2xl">
                    <table className="w-full text-right border-collapse bg-white dark:bg-gray-900">
                      <thead>
                        <tr className="bg-gray-50 dark:bg-gray-950 text-gray-500 text-[10px] font-bold border-b border-gray-100 dark:border-gray-800">
                          <th className="p-3">اسم المتسابق الكامل</th>
                          <th className="p-3">رقم الهاتف</th>
                          <th className="p-3 text-center text-emerald-600 dark:text-emerald-400">تأييد 👍</th>
                          <th className="p-3 text-center text-rose-600 dark:text-rose-400">اعتراض 👎</th>
                          <th className="p-3 text-center">الإجمالي</th>
                          <th className="p-3 text-center">رابط التصويت 🔗</th>
                          <th className="p-3 text-center">العمليات</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50 dark:divide-gray-800 text-[11px]">
                        {contestants.map((c) => (
                          <tr key={c.id} className="hover:bg-gray-50 dark:hover:bg-gray-950/40 transition animate-fade-in">
                            <td className="p-3 font-bold text-gray-800 dark:text-gray-200">
                              <div className="flex items-center gap-2">
                                {c.imageUrl ? (
                                  <img src={c.imageUrl} alt="" className="w-6 h-6 rounded-lg object-cover shrink-0" referrerPolicy="no-referrer" />
                                ) : (
                                  <div className="w-6 h-6 bg-amber-50 dark:bg-gray-800 text-amber-700 dark:text-amber-400 rounded-lg flex items-center justify-center font-extrabold text-[9px] shrink-0">👤</div>
                                )}
                                <span>{c.name}</span>
                              </div>
                            </td>
                            <td className="p-3 font-mono text-gray-500" dir="ltr">{c.phone}</td>
                            <td className="p-3 text-center font-bold text-emerald-600 dark:text-emerald-400">{c.greenVotes || 0}</td>
                            <td className="p-3 text-center font-bold text-rose-600 dark:text-rose-400">{c.redVotes || 0}</td>
                            <td className="p-3 text-center">
                              <span className="bg-amber-100 text-amber-800 dark:bg-amber-500/10 dark:text-amber-300 font-extrabold px-2 py-0.5 rounded-full text-[9.5px]">
                                {(c.greenVotes || 0) + (c.redVotes || 0)} صوت
                              </span>
                            </td>
                            <td className="p-3 text-center font-mono text-[9px] text-gray-400 select-all" dir="ltr">
                              ?vote={c.id}
                            </td>
                            <td className="p-3 text-center">
                              <div className="flex justify-center gap-1.5">
                                <button
                                  onClick={() => handleManualVote(c.id)}
                                  className="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300 py-1 px-2 rounded-lg text-[9px] font-black transition"
                                  title="إضافة صوت تأييد (+1)"
                                >
                                  تأييد 👍
                                </button>
                                <button
                                  onClick={() => {
                                    navigator.clipboard.writeText(`${window.location.origin}/?vote=${c.id}`);
                                    showToast('✓ تم نسخ رابط تصويت المتسابق بنجاح!');
                                  }}
                                  className="bg-blue-50 hover:bg-blue-100 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300 py-1 px-2 rounded-lg text-[9px] font-black transition"
                                  title="نسخ الرابط الخاص بالتصويت لهذا المتسابق"
                                >
                                  الرابط 🔗
                                </button>
                                <button
                                  onClick={() => handleDeleteContestant(c.id)}
                                  className="bg-red-50 hover:bg-red-100 text-red-600 dark:bg-red-500/10 dark:text-red-400 p-1 rounded-lg transition"
                                  title="حذف المتسابق نهائياً"
                                >
                                  <Trash2 size={11} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Anti-Fraud & Device Fingerprinting Audit Section */}
              <div className="border-t border-gray-100 dark:border-gray-800 pt-6 space-y-6">
                <div>
                  <h4 className="text-xs font-black text-rose-950 dark:text-rose-300 flex items-center gap-1.5">
                    <span>🛡️</span> نظام حظر الأجهزة ومنع تكرار التصويت (Anti-Fraud & Fingerprint Lock)
                  </h4>
                  <p className="text-[10px] text-gray-400 mt-1">
                    تعقب البصمات الرقمية وعناوين الـ IP للأجهزة لمنع التلاعب في نتائج الفعاليات وحظر الحسابات الوهمية أو المتكررة تلقائياً ويدوياً.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                  {/* Manual block input and list */}
                  <div className="bg-rose-50/20 dark:bg-rose-950/5 p-4 rounded-2xl border border-rose-500/10 space-y-4 md:col-span-1">
                    <h5 className="text-[11px] font-black text-rose-950 dark:text-rose-300">🚫 حظر جهاز جديد يدوياً</h5>
                    <div className="space-y-2">
                      <input 
                        type="text" 
                        value={manualBlockInput}
                        onChange={(e) => setManualBlockInput(e.target.value)}
                        placeholder="أدخل البصمة الرقمية أو عنوان IP للجهاز"
                        className="w-full bg-white dark:bg-gray-800 text-[10px] py-2 px-3 border border-gray-200 dark:border-gray-700 rounded-xl focus:outline-none"
                      />
                      <button
                        onClick={() => handleBlockDevice(manualBlockInput)}
                        className="w-full bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-[10.5px] py-2 px-3 rounded-xl transition shadow"
                      >
                        حظر البصمة/IP يدوياً 🚫
                      </button>
                    </div>

                    <div className="space-y-2 pt-2 border-t border-rose-500/10">
                      <h5 className="text-[11px] font-black text-gray-800 dark:text-white flex justify-between">
                        <span>📋 قائمة المحظورين حالياً</span>
                        <span className="text-[9.5px] bg-rose-100 dark:bg-rose-500/10 text-rose-700 dark:text-rose-400 px-2 rounded-full font-bold">
                          {blockedDevices.length} أجهزة
                        </span>
                      </h5>
                      
                      {blockedDevices.length === 0 ? (
                        <p className="text-[10px] text-gray-400 text-center py-4 font-semibold">لا يوجد أي أجهزة محظورة حالياً 🌸</p>
                      ) : (
                        <div className="max-h-48 overflow-y-auto space-y-1.5 divide-y divide-rose-500/5">
                          {blockedDevices.map((device, i) => (
                            <div key={i} className="flex justify-between items-center text-[10px] pt-1.5">
                              <span className="font-mono text-gray-600 dark:text-gray-300 truncate max-w-[120px]" dir="ltr">{device}</span>
                              <button
                                onClick={() => handleUnblockDevice(device)}
                                className="text-emerald-600 dark:text-emerald-400 font-extrabold hover:underline"
                              >
                                إلغاء الحظر 🔓
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Vote Logs / Footprints Audit Table */}
                  <div className="bg-gray-50 dark:bg-gray-950/40 p-4 rounded-2xl border border-gray-100 dark:border-gray-800 md:col-span-2 space-y-3">
                    <h5 className="text-[11px] font-black text-gray-800 dark:text-white">📈 سجل ومراقبة البصمات وعمليات التصويت النشطة</h5>
                    
                    {voteLogs.length === 0 ? (
                      <div className="text-center py-10">
                        <span className="text-xl">📊</span>
                        <p className="text-[10.5px] text-gray-400 font-semibold mt-1">لا يوجد أي سجلات تصويت في قاعدة البيانات حالياً.</p>
                      </div>
                    ) : (
                      <div className="overflow-hidden border border-gray-100 dark:border-gray-850 rounded-xl">
                        <div className="max-h-80 overflow-y-auto">
                          <table className="w-full text-right border-collapse bg-white dark:bg-gray-900 text-[10px]">
                            <thead className="bg-gray-50 dark:bg-gray-950 text-gray-500 font-bold sticky top-0 border-b border-gray-100 dark:border-gray-800">
                              <tr>
                                <th className="p-2.5">المصوّت</th>
                                <th className="p-2.5">المرشّح</th>
                                <th className="p-2.5">نوع التصويت</th>
                                <th className="p-2.5">البصمة الرقمية / الجهاز 📱</th>
                                <th className="p-2.5 text-center">العمليات</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                              {[...voteLogs].reverse().map((log) => {
                                const isDeviceBlocked = blockedDevices.some(d => d.split('|IP:')[0] === log.voterDeviceId.split('|IP:')[0]);
                                return (
                                  <tr key={log.id} className="hover:bg-gray-50 dark:hover:bg-gray-950/40 transition">
                                    <td className="p-2.5 font-bold text-gray-700 dark:text-gray-300">
                                      {log.voterUserId.startsWith('VOTER_') ? `مستخدم #${log.voterUserId.replace('VOTER_', '')}` : log.voterUserId}
                                    </td>
                                    <td className="p-2.5 text-amber-800 dark:text-amber-400 font-black">
                                      {contestants.find(c => c.id === log.contestantId)?.name || log.contestantId}
                                    </td>
                                    <td className="p-2.5">
                                      {log.voterType === 'green' ? (
                                        <span className="bg-emerald-100 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300 px-2.5 py-0.5 rounded-full font-extrabold text-[9px]">🟢 عميل مسجل سابقاً</span>
                                      ) : (
                                        <span className="bg-amber-100 text-amber-800 dark:bg-amber-500/10 dark:text-amber-300 px-2.5 py-0.5 rounded-full font-extrabold text-[9px]">🆕 عميل جديد (سجل للتصويت)</span>
                                      )}
                                    </td>
                                    <td className="p-2.5 font-mono text-gray-400 text-[9px]" dir="ltr">
                                      {log.voterDeviceId}
                                    </td>
                                    <td className="p-2.5 text-center">
                                      {isDeviceBlocked ? (
                                        <span className="text-rose-600 dark:text-rose-400 font-black text-[9.5px]">🚫 محظور</span>
                                      ) : (
                                        <button
                                          onClick={() => handleBlockDevice(log.voterDeviceId)}
                                          className="bg-rose-50 hover:bg-rose-100 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400 py-1 px-2 rounded-lg text-[9px] font-black transition"
                                        >
                                          حظر 🚫
                                        </button>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

            </div>
          )}

          {/* 13. APP NOTIFICATION MANAGEMENT SECTION */}
          {activeTab === 'notifications' && (
            <div className="bg-white dark:bg-gray-900 p-6 rounded-3xl border border-amber-100/40 dark:border-gray-800 shadow-sm space-y-6 text-right animate-fade-in">
              <div>
                <h3 className="text-xs font-black text-amber-950 dark:text-amber-300 flex items-center gap-2">
                  <span className="inline-block p-1 bg-amber-500/10 rounded-lg text-amber-600">🔔</span>
                  إدارة الإشعارات الجماعية والمستهدفة (App Notifications)
                </h3>
                <p className="text-[10px] text-gray-400 mt-1">
                  أنشئي إشعارات وتنبيهات مخصصة تظهر للعملاء في أعلى الشاشة أو عبر جرس الإشعارات لترويج العروض والتحديثات المهمة.
                </p>
              </div>

              {/* Add/Edit Notification Form */}
              <form onSubmit={handleSaveAppNotification} className="bg-gradient-to-br from-amber-500/5 to-amber-500/10 p-5 rounded-2xl border border-amber-500/10 space-y-4">
                <h4 className="text-xs font-black text-amber-950 dark:text-amber-300 flex items-center gap-1">
                  <span>{editingNotifId ? '📝 تعديل إشعار قائم' : '📣 إنشاء إشعار جماعي جديد'}</span>
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] text-gray-500 font-bold block">عنوان الإشعار (موجز ومثير):</label>
                    <input 
                      type="text" 
                      value={newNotifTitle} 
                      onChange={(e) => setNewNotifTitle(e.target.value)} 
                      placeholder="مثال: خصم 30% على العبايات الراقية! 🌸"
                      className="w-full bg-white dark:bg-gray-800 text-[11px] font-bold py-2.5 px-3 border rounded-xl focus:outline-none focus:ring-1 focus:ring-amber-500"
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] text-gray-500 font-bold block">ربط بمنتج محدد (كود المنتج - اختياري):</label>
                    <select
                      value={newNotifProductId}
                      onChange={(e) => setNewNotifProductId(e.target.value)}
                      className="w-full bg-white dark:bg-gray-800 text-[11px] font-bold py-2.5 px-3 border rounded-xl focus:outline-none focus:ring-1 focus:ring-amber-500"
                    >
                      <option value="">-- عدم ربط بمنتج (إعلان عام) --</option>
                      {products.map(p => (
                        <option key={p.id} value={p.id}>{p.name} ({p.id})</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] text-gray-500 font-bold block font-sans">مدة صلاحية التنبيه (بالساعات):</label>
                    <input 
                      type="number" 
                      value={newNotifDurationHours} 
                      onChange={(e) => setNewNotifDurationHours(parseInt(e.target.value) || 48)} 
                      className="w-full bg-white dark:bg-gray-800 text-[11px] py-2.5 px-3 border rounded-xl focus:outline-none font-bold"
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] text-gray-500 font-bold block">صورة ترويجية للإشعار (رابط أو اختر صورة لرفعها):</label>
                    <div className="flex gap-2">
                      <input 
                        type="text" 
                        value={newNotifImageUrl} 
                        onChange={(e) => setNewNotifImageUrl(e.target.value)} 
                        placeholder="رابط مباشر للصورة (اختياري)"
                        className="flex-1 bg-white dark:bg-gray-800 text-[11px] py-2 px-3 border rounded-xl focus:outline-none text-left font-mono"
                        dir="ltr"
                      />
                      <label className="bg-amber-100 hover:bg-amber-200 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 py-2.5 px-4 rounded-xl text-xs font-black cursor-pointer transition flex items-center gap-1 shrink-0">
                        <Upload className="w-3.5 h-3.5" />
                        <span>{uploadingNotifImg ? 'جاري الرفع...' : 'رفع صورة'}</span>
                        <input 
                          type="file" 
                          accept="image/*" 
                          onChange={handleNotifImgUpload} 
                          className="hidden" 
                        />
                      </label>
                    </div>
                  </div>
                  <div className="space-y-1 sm:col-span-2">
                    <label className="text-[10px] text-gray-500 font-bold block">محتوى وتفاصيل التنبيه (رسالة الإشعار كاملة):</label>
                    <textarea 
                      value={newNotifMessage} 
                      onChange={(e) => setNewNotifMessage(e.target.value)} 
                      rows={3}
                      placeholder="اكتبي تفاصيل العرض أو التنبيه هنا، سيقرأها العملاء فور فتح المتجر..."
                      className="w-full bg-white dark:bg-gray-800 text-[11px] py-2.5 px-3 border rounded-xl focus:outline-none focus:ring-1 focus:ring-amber-500 leading-relaxed font-bold"
                      required
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-1">
                  {editingNotifId && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingNotifId(null);
                        setNewNotifTitle('');
                        setNewNotifMessage('');
                        setNewNotifImageUrl('');
                        setNewNotifProductId('');
                      }}
                      className="bg-gray-100 hover:bg-gray-200 text-gray-800 dark:bg-gray-800 dark:text-gray-300 font-extrabold text-[11px] py-2.5 px-5 rounded-xl transition"
                    >
                      إلغاء التعديل
                    </button>
                  )}
                  <button
                    type="submit"
                    className="bg-amber-500 hover:bg-amber-600 text-white font-extrabold text-[11px] py-2.5 px-6 rounded-xl shadow transition"
                  >
                    {editingNotifId ? 'حفظ تعديلات الإشعار 💾' : 'إرسال وتعميم الإشعار الآن 📣'}
                  </button>
                </div>
              </form>

              {/* Notifications list */}
              <div className="space-y-3">
                <h4 className="text-xs font-black text-gray-800 dark:text-white">الإشعارات النشطة حالياً في المتجر 📊</h4>

                {appNotifications.length === 0 ? (
                  <div className="text-center py-8 bg-gray-50 dark:bg-gray-950/20 rounded-2xl border border-gray-100 dark:border-gray-800">
                    <span className="text-2xl">🔔</span>
                    <p className="text-[11px] text-gray-400 font-semibold mt-2">لا توجد أي إشعارات نشطة حالياً. الإشعارات منتهية الصلاحية تُحذف تلقائياً بعد 48 ساعة.</p>
                  </div>
                ) : (
                  <div className="overflow-hidden border border-gray-100 dark:border-gray-800 rounded-2xl">
                    <table className="w-full text-right border-collapse bg-white dark:bg-gray-900">
                      <thead>
                        <tr className="bg-gray-50 dark:bg-gray-950 text-gray-500 text-[10px] font-bold border-b border-gray-100 dark:border-gray-800">
                          <th className="p-3">عنوان الإشعار</th>
                          <th className="p-3">المحتوى والرسالة</th>
                          <th className="p-3 text-center">الربط بمنتج</th>
                          <th className="p-3 text-center">تاريخ النشر</th>
                          <th className="p-3 text-center">تاريخ الانتهاء</th>
                          <th className="p-3 text-center">العمليات</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50 dark:divide-gray-800 text-[11px]">
                        {appNotifications.map((notif) => (
                          <tr key={notif.id} className="hover:bg-gray-50 dark:hover:bg-gray-950/40 transition">
                            <td className="p-3 font-bold text-gray-800 dark:text-gray-200">
                              <div className="flex items-center gap-2">
                                {notif.image ? (
                                  <img src={notif.image} alt="" className="w-8 h-8 rounded-lg object-cover shrink-0" referrerPolicy="no-referrer" />
                                ) : (
                                  <div className="w-8 h-8 bg-amber-50 dark:bg-gray-800 text-amber-700 dark:text-amber-400 rounded-lg flex items-center justify-center font-extrabold text-[10px] shrink-0">📣</div>
                                )}
                                <span className="line-clamp-1">{notif.title}</span>
                              </div>
                            </td>
                            <td className="p-3 text-gray-600 dark:text-gray-450 max-w-xs truncate" title={notif.message}>{notif.message}</td>
                            <td className="p-3 text-center font-mono text-xs">{notif.productId || 'إعلان عام'}</td>
                            <td className="p-3 text-center text-gray-450 font-mono text-[9.5px]" dir="ltr">
                              {new Date(notif.createdAt).toLocaleString('en-US', { hour12: false })}
                            </td>
                            <td className="p-3 text-center text-rose-500 font-mono text-[9.5px]" dir="ltr">
                              {new Date(notif.expiryAt).toLocaleString('en-US', { hour12: false })}
                            </td>
                            <td className="p-3 text-center">
                              <div className="flex justify-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => handleEditAppNotification(notif)}
                                  className="bg-blue-50 hover:bg-blue-100 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300 py-1.5 px-2.5 rounded-lg text-[9px] font-black transition flex items-center gap-0.5"
                                  title="تعديل الإشعار"
                                >
                                  <span>تعديل</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteAppNotification(notif.id)}
                                  className="bg-red-50 hover:bg-red-100 text-red-600 dark:bg-red-500/10 dark:text-red-400 p-1.5 rounded-lg transition"
                                  title="حذف الإشعار"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 13.5. REVERSIONS AND ERROR ROLLBACK SECTION */}
          {activeTab === 'reversions' && (
            <div className="bg-white dark:bg-gray-900 p-6 rounded-3xl border border-amber-100/40 dark:border-gray-800 shadow-sm space-y-6 text-right animate-fade-in">
              {/* Header */}
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-amber-50 dark:border-gray-800 pb-4">
                <div>
                  <h3 className="text-sm font-black text-amber-950 dark:text-amber-300 flex items-center gap-2">
                    <span className="inline-block p-1 bg-amber-500/10 rounded-lg text-amber-600">🔄</span>
                    قسم مراجعة وتراجع الأخطاء والتحويلات
                  </h3>
                  <p className="text-[10px] text-gray-400 mt-1">
                    أداة رقابية لمراجعة هدايا وشحنات العملاء، والتراجع الفوري عن التحويلات المعتمدة بالخطأ أو تصفير أرصدة الحسابات لمنع التجاوزات وسحب المبالغ.
                  </p>
                </div>
              </div>

              {/* Sub tabs navigation */}
              <div className="flex bg-gray-50 dark:bg-gray-800/50 p-1.5 rounded-2xl border border-gray-100/50 dark:border-gray-800/80 gap-1.5 overflow-x-auto">
                {[
                  { id: 'users', label: 'أرصدة ومحافظ العملاء 💳' },
                  { id: 'recharges', label: 'عمليات الشحن المعتمدة 💰' },
                  { id: 'gifts', label: 'سجل هدايا الإدارة المباشرة 🎁' }
                ].map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => {
                      setReversionSubTab(tab.id as any);
                      setReversionSearchQuery('');
                    }}
                    className={`px-4 py-2 text-xs font-black rounded-xl transition whitespace-nowrap cursor-pointer ${
                      reversionSubTab === tab.id
                        ? 'bg-amber-500 text-white shadow-md shadow-amber-500/10'
                        : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Search Bar */}
              <div className="relative">
                <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder={
                    reversionSubTab === 'users'
                      ? 'البحث عن اسم العميل أو رقم الهاتف...'
                      : reversionSubTab === 'recharges'
                      ? 'البحث باسم المحول، حساب التحويل، أو اسم العميل...'
                      : 'البحث عن اسم مستلم الهدية أو رقم هاتفها...'
                  }
                  value={reversionSearchQuery}
                  onChange={e => setReversionSearchQuery(e.target.value)}
                  className="w-full pl-4 pr-10 py-3 text-xs bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-800 rounded-2xl focus:outline-none focus:ring-2 focus:ring-amber-500/20 text-gray-800 dark:text-gray-100"
                />
              </div>

              {/* SECTION 1: USERS WALLETS */}
              {reversionSubTab === 'users' && (
                <div className="space-y-4">
                  {/* Info Panel */}
                  <div className="bg-amber-500/5 border border-amber-500/10 p-3.5 rounded-2xl text-amber-800 dark:text-amber-400 text-[10px] font-bold leading-relaxed">
                    💡 يظهر هنا جميع العملاء الذين يمتلكون أرصدة مالية أو هدايا نشطة في محافظهم. يمكنكِ تصفير الرصيد المالي أو الهدية نهائياً لأي عميلة، وسيتم تحديث المحفظة فوراً وسحب الرصيد من جهازها أيضاً بالتزامن.
                  </div>

                  {/* Filter and render users list */}
                  {(() => {
                    const filteredUsers = users.filter(u => {
                      // Only show users with some balance or giftBalance
                      const hasFunds = (u.balance && u.balance > 0) || (u.giftBalance && u.giftBalance > 0);
                      if (!hasFunds) return false;
                      if (!reversionSearchQuery.trim()) return true;
                      const term = reversionSearchQuery.toLowerCase().trim();
                      return u.name.toLowerCase().includes(term) || u.phone.includes(term);
                    });

                    if (filteredUsers.length === 0) {
                      return (
                        <div className="text-center py-12 text-gray-400 text-xs font-bold">
                          لا توجد محافظ عملاء نشطة تطابق معايير البحث الحالية.
                        </div>
                      );
                    }

                    return (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {filteredUsers.map(user => {
                          const userBalCur = user.balanceCurrency || 'YER_NEW';
                          const userGiftCur = user.giftBalanceCurrency || 'YER_NEW';
                          const currencyLabels: Record<string, string> = {
                            YER_NEW: 'ريال يمني جديد',
                            YER_OLD: 'ريال يمني قديم',
                            SAR: 'ريال سعودي'
                          };

                          return (
                            <div key={user.id} className="bg-gray-50/50 dark:bg-gray-800/40 border border-gray-100 dark:border-gray-800 p-4 rounded-3xl space-y-4">
                              {/* Header User info */}
                              <div className="flex justify-between items-start">
                                <div className="space-y-0.5">
                                  <h4 className="text-xs font-black text-gray-900 dark:text-white">{user.name}</h4>
                                  <p className="text-[10px] text-gray-400 font-mono" dir="ltr">{user.phone}</p>
                                </div>
                                <span className="bg-amber-50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-400 text-[8px] font-extrabold px-2.5 py-1 rounded-full">
                                  عميلة مسجلة 👤
                                </span>
                              </div>

                              {/* Balance Slots */}
                              <div className="grid grid-cols-2 gap-3">
                                {/* Wallet Balance */}
                                <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 p-3 rounded-2xl text-center space-y-1">
                                  <span className="text-[9px] text-gray-400 font-bold block">الرصيد المالي</span>
                                  <div className="text-xs font-black text-emerald-600 dark:text-emerald-400">
                                    {(user.balance || 0).toLocaleString()} <span className="text-[9px] font-medium block mt-0.5 text-gray-500">{currencyLabels[userBalCur]}</span>
                                  </div>
                                  <button
                                    onClick={() => {
                                      askConfirmation(
                                        '⚠️ سحب وتصفير الرصيد المالي',
                                        `هل أنتِ متأكدة تماماً من تصفير الرصيد المالي الحالي للعميلة "${user.name}" نهائياً؟ سيتم خصم ${(user.balance || 0).toLocaleString()} وسيعود رصيدها إلى 0 فوراً!`,
                                        () => {
                                          Database.updateUserBalances(user.id, 0, user.giftBalance || 0);
                                          showToast(`تم تصفير الرصيد المالي للعميلة ${user.name} بنجاح! 💸`);
                                          reloadData();
                                        }
                                      );
                                    }}
                                    disabled={!user.balance || user.balance <= 0}
                                    className="w-full mt-2 py-1.5 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/20 dark:hover:bg-rose-950/40 text-rose-600 dark:text-rose-400 font-black text-[9px] rounded-xl transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                  >
                                    تصفير الرصيد
                                  </button>
                                </div>

                                {/* Gift Balance */}
                                <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 p-3 rounded-2xl text-center space-y-1">
                                  <span className="text-[9px] text-gray-400 font-bold block">رصيد الهدايا</span>
                                  <div className="text-xs font-black text-amber-700 dark:text-amber-400">
                                    {(user.giftBalance || 0).toLocaleString()} <span className="text-[9px] font-medium block mt-0.5 text-gray-500">{currencyLabels[userGiftCur]}</span>
                                  </div>
                                  <button
                                    onClick={() => {
                                      askConfirmation(
                                        '🎁 سحب وتصفير رصيد الهدية',
                                        `هل أنتِ متأكدة تماماً من تصفير رصيد الهدايا الحالي للعميلة "${user.name}" نهائياً؟ سيتم سحب ${(user.giftBalance || 0).toLocaleString()} وسيعود رصيد الهدايا إلى 0 فوراً!`,
                                        () => {
                                          Database.updateUserBalances(user.id, user.balance || 0, 0);
                                          showToast(`تم سحب وتصفير رصيد الهدايا للعميلة ${user.name} بنجاح! 🎁`);
                                          reloadData();
                                        }
                                      );
                                    }}
                                    disabled={!user.giftBalance || user.giftBalance <= 0}
                                    className="w-full mt-2 py-1.5 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/20 dark:hover:bg-rose-950/40 text-rose-600 dark:text-rose-400 font-black text-[9px] rounded-xl transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                  >
                                    تصفير الهدية
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* SECTION 2: APPROVED RECHARGES */}
              {reversionSubTab === 'recharges' && (
                <div className="space-y-4">
                  <div className="bg-amber-500/5 border border-amber-500/10 p-3.5 rounded-2xl text-amber-800 dark:text-amber-400 text-[10px] font-bold leading-relaxed">
                    🛡️ يظهر هنا سجل الحوالات المعتمدة (التي تم قبولها بنجاح وشحن رصيد العملاء بموجبها). عند التراجع عن أي عملية، سيتم **خصم مبلغ الشحن مباشرة** من محفظة العميلة وحذف طلب الشحن نهائياً لمنع أي ثغرة.
                  </div>

                  {(() => {
                    const approvedRecharges = recharges.filter(r => {
                      if (r.status !== 'approved') return false;
                      if (!reversionSearchQuery.trim()) return true;
                      const term = reversionSearchQuery.toLowerCase().trim();
                      return (
                        r.userName.toLowerCase().includes(term) ||
                        r.userPhone.includes(term) ||
                        (r.senderName && r.senderName.toLowerCase().includes(term)) ||
                        (r.senderAccount && r.senderAccount.toLowerCase().includes(term))
                      );
                    });

                    if (approvedRecharges.length === 0) {
                      return (
                        <div className="text-center py-12 text-gray-400 text-xs font-bold">
                          لا توجد عمليات شحن مقبولة تطابق البحث حالياً.
                        </div>
                      );
                    }

                    return (
                      <div className="overflow-x-auto border border-gray-100 dark:border-gray-800 rounded-2xl">
                        <table className="w-full text-right text-xs">
                          <thead>
                            <tr className="bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 font-black text-[10px] border-b border-gray-100 dark:border-gray-800">
                              <th className="p-3">صاحبة الحساب</th>
                              <th className="p-3">حساب ومحضر التحويل</th>
                              <th className="p-3 text-center">المبلغ المعتمد</th>
                              <th className="p-3 text-center">التاريخ والوقت</th>
                              <th className="p-3 text-center">إجراء تراجع رقابي</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                            {approvedRecharges.map(req => {
                              const curNames: Record<string, string> = { YER_NEW: 'يمني جديد', YER_OLD: 'يمني قديم', SAR: 'ريال سعودي' };
                              const curLabel = curNames[req.currency || 'YER_NEW'] || 'يمني جديد';

                              return (
                                <tr key={req.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition">
                                  <td className="p-3">
                                    <div className="font-extrabold text-gray-900 dark:text-white">{req.userName}</div>
                                    <div className="text-[10px] text-gray-400 font-mono" dir="ltr">{req.userPhone}</div>
                                  </td>
                                  <td className="p-3">
                                    <div className="text-gray-600 dark:text-gray-300 font-semibold">{req.senderAccount || 'غير محدد'}</div>
                                    <div className="text-[10px] text-gray-400">المرسل: {req.senderName || 'غير محدد'}</div>
                                  </td>
                                  <td className="p-3 text-center font-black text-emerald-600 dark:text-emerald-400">
                                    {req.amount.toLocaleString()} {curLabel}
                                  </td>
                                  <td className="p-3 text-center text-gray-400 font-medium text-[10px]">
                                    {formatArabicDate(req.createdAt)}
                                  </td>
                                  <td className="p-3 text-center">
                                    <button
                                      onClick={() => {
                                        askConfirmation(
                                          '⚠️ التراجع عن عملية الشحن المقبولة',
                                          `هل أنتِ متأكدة تماماً من الرغبة في التراجع وإلغاء عملية الشحن هذه التابعة لـ "${req.userName}"؟ سيتم فوراً خصم مبلغ ${req.amount.toLocaleString()} ${curLabel} من محفظتها، وحذف هذا الطلب نهائياً.`,
                                          () => {
                                            Database.revertRechargeAndDeduct(req.id);
                                            showToast('تم إلغاء عملية الشحن المعتمدة بنجاح وسحب القيمة المالية من رصيد العميلة المستهدفة. ✅');
                                            reloadData();
                                          }
                                        );
                                      }}
                                      className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/20 dark:hover:bg-rose-950/40 text-rose-600 dark:text-rose-400 text-[10px] font-black rounded-xl transition cursor-pointer"
                                    >
                                      تراجع وخصم المبلغ
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* SECTION 3: DIRECT ADMIN GIFTS */}
              {reversionSubTab === 'gifts' && (
                <div className="space-y-4">
                  <div className="bg-amber-500/5 border border-amber-500/10 p-3.5 rounded-2xl text-amber-800 dark:text-amber-400 text-[10px] font-bold leading-relaxed">
                    🎁 يظهر هنا سجل الهدايا والجوائز المالية المباشرة التي تم إرسالها من قبل الإدارة إلى العملاء. يمكنكِ التراجع عن أي هدية أرسلت بالخطأ وسحب قيمتها فوراً من محفظة العميلة وحذف السجل المانح نهائياً.
                  </div>

                  {(() => {
                    const filteredGifts = giftsList.filter(g => {
                      if (!reversionSearchQuery.trim()) return true;
                      const term = reversionSearchQuery.toLowerCase().trim();
                      return (
                        g.userName.toLowerCase().includes(term) ||
                        g.userPhone.includes(term)
                      );
                    });

                    if (filteredGifts.length === 0) {
                      return (
                        <div className="text-center py-12 text-gray-400 text-xs font-bold">
                          لا توجد هدايا مالية مرسلة تطابق البحث حالياً.
                        </div>
                      );
                    }

                    return (
                      <div className="overflow-x-auto border border-gray-100 dark:border-gray-800 rounded-2xl">
                        <table className="w-full text-right text-xs">
                          <thead>
                            <tr className="bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 font-black text-[10px] border-b border-gray-100 dark:border-gray-800">
                              <th className="p-3">صاحبة الحساب المستلمة</th>
                              <th className="p-3 text-center">المبلغ</th>
                              <th className="p-3 text-center">التاريخ والوقت</th>
                              <th className="p-3 text-center">إجراء تراجع رقابي</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                            {filteredGifts.map(gift => {
                              return (
                                <tr key={gift.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition">
                                  <td className="p-3">
                                    <div className="font-extrabold text-gray-900 dark:text-white">{gift.userName}</div>
                                    <div className="text-[10px] text-gray-400 font-mono" dir="ltr">{gift.userPhone}</div>
                                  </td>
                                  <td className="p-3 text-center font-black text-amber-700 dark:text-amber-400">
                                    {gift.amount.toLocaleString()} ريال
                                  </td>
                                  <td className="p-3 text-center text-gray-400 font-medium text-[10px]">
                                    {formatArabicDate(gift.createdAt)}
                                  </td>
                                  <td className="p-3 text-center">
                                    <button
                                      onClick={() => {
                                        askConfirmation(
                                          '⚠️ التراجع عن الهدية المالية المرسلة',
                                          `هل أنتِ متأكدة تماماً من إلغاء الهدية المالية هذه التابعة لـ "${gift.userName}"؟ سيتم سحب قيمة الهدية (${gift.amount.toLocaleString()} ريال) من رصيد هداياها مباشرة وحذف السجل نهائياً.`,
                                          () => {
                                            Database.revertGiftAndDeduct(gift.id);
                                            showToast('تم إلغاء وسحب الهدية المالية من رصيد العميلة بنجاح! 🎁❌');
                                            reloadData();
                                          }
                                        );
                                      }}
                                      className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/20 dark:hover:bg-rose-950/40 text-rose-600 dark:text-rose-400 text-[10px] font-black rounded-xl transition cursor-pointer"
                                    >
                                      إلغاء الهدية وسحبها
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          )}

          {/* 14. COMPREHENSIVE ARCHIVES AND PRINTING SECTION */}
          {activeTab === 'archives' && (
            <div className="bg-white dark:bg-gray-900 p-6 rounded-3xl border border-amber-100/40 dark:border-gray-800 shadow-sm space-y-6 text-right animate-fade-in print:p-0 print:border-none print:shadow-none print:bg-white">
              {/* Header */}
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-amber-50 dark:border-gray-800 pb-4 print:border-b-2 print:border-black print:pb-2">
                <div>
                  <h3 className="text-sm font-black text-amber-950 dark:text-amber-300 flex items-center gap-2 print:text-black print:text-lg">
                    <span className="inline-block p-1 bg-amber-500/10 rounded-lg text-amber-600 print:hidden">📦</span>
                    أرشيف الإدارة المتكامل والطباعة الورقية
                  </h3>
                  <p className="text-[10px] text-gray-400 mt-1 print:text-gray-800 print:text-xs">
                    استعراض وطباعة كافة أرشيف العمليات، شحنات المحفظة، الطلبات، والمسابقات مع إمكانية التصفية والحذف
                  </p>
                </div>

                <div className="flex flex-wrap gap-2 self-stretch sm:self-auto print:hidden">
                  {/* Print Active Archive Button */}
                  <button
                    id="print-archive-btn"
                    onClick={() => window.print()}
                    className="bg-amber-500 hover:bg-amber-600 active:scale-95 text-white font-black text-[10px] py-2 px-4 rounded-xl shadow-md transition flex items-center gap-1.5 cursor-pointer"
                  >
                    <Printer className="w-4 h-4" />
                    <span>طباعة الأرشيف الحالي 📄</span>
                  </button>

                  {/* Empty Selected Archive */}
                  {subArchiveTab === 'recharges' && (
                    <button
                      id="clear-recharges-btn"
                      onClick={handleClearAllRecharges}
                      className="bg-rose-50 border border-rose-100 hover:bg-rose-100 text-rose-700 dark:bg-rose-950/20 dark:border-rose-900/40 dark:text-rose-400 font-extrabold text-[10px] py-2 px-4 rounded-xl transition flex items-center gap-1.5 cursor-pointer"
                    >
                      <Trash2Icon className="w-4 h-4" />
                      <span>تفريغ أرشيف الشحن 🚨</span>
                    </button>
                  )}
                  {subArchiveTab === 'orders' && (
                    <button
                      id="clear-orders-btn"
                      onClick={handleClearAllOrders}
                      className="bg-rose-50 border border-rose-100 hover:bg-rose-100 text-rose-700 dark:bg-rose-950/20 dark:border-rose-900/40 dark:text-rose-400 font-extrabold text-[10px] py-2 px-4 rounded-xl transition flex items-center gap-1.5 cursor-pointer"
                    >
                      <Trash2Icon className="w-4 h-4" />
                      <span>تفريغ أرشيف الطلبات 🚨</span>
                    </button>
                  )}
                  {subArchiveTab === 'events' && (
                    <button
                      id="clear-events-btn"
                      onClick={handleClearAllContestantsAndVotes}
                      className="bg-rose-50 border border-rose-100 hover:bg-rose-100 text-rose-700 dark:bg-rose-950/20 dark:border-rose-900/40 dark:text-rose-400 font-extrabold text-[10px] py-2 px-4 rounded-xl transition flex items-center gap-1.5 cursor-pointer"
                    >
                      <Trash2Icon className="w-4 h-4" />
                      <span>تفريغ وتصفير المسابقات 🏆</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Sub-Archive Tab Switcher */}
              <div className="flex border-b border-gray-100 dark:border-gray-800 gap-2 print:hidden">
                <button
                  id="subtab-recharges"
                  onClick={() => setSubArchiveTab('recharges')}
                  className={`pb-3 px-4 text-xs font-black border-b-2 transition cursor-pointer ${
                    subArchiveTab === 'recharges'
                      ? 'border-amber-500 text-amber-600 dark:text-amber-400'
                      : 'border-transparent text-gray-400 hover:text-gray-600'
                  }`}
                >
                  💳 أرشيف طلبات الشحن ({recharges.length})
                </button>
                <button
                  id="subtab-orders"
                  onClick={() => setSubArchiveTab('orders')}
                  className={`pb-3 px-4 text-xs font-black border-b-2 transition cursor-pointer ${
                    subArchiveTab === 'orders'
                      ? 'border-amber-500 text-amber-600 dark:text-amber-400'
                      : 'border-transparent text-gray-400 hover:text-gray-600'
                  }`}
                >
                  🛍️ أرشيف الطلبات والمبيعات ({orders.length})
                </button>
                <button
                  id="subtab-events"
                  onClick={() => setSubArchiveTab('events')}
                  className={`pb-3 px-4 text-xs font-black border-b-2 transition cursor-pointer ${
                    subArchiveTab === 'events'
                      ? 'border-amber-500 text-amber-600 dark:text-amber-400'
                      : 'border-transparent text-gray-400 hover:text-gray-600'
                  }`}
                >
                  🏆 أرشيف المسابقات والتصويت ({contestants.length})
                </button>
              </div>

              {/* SECTION A: RECHARGES ARCHIVE */}
              {subArchiveTab === 'recharges' && (
                <div className="space-y-4">
                  {/* Filters bar */}
                  <div className="flex flex-wrap items-center justify-between gap-4 bg-gray-50 dark:bg-gray-900/50 p-4 rounded-2xl print:hidden">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-gray-400 font-bold">تصفية حالة الطلب:</span>
                      <div className="flex bg-white dark:bg-gray-800 p-0.5 rounded-lg border">
                        {[
                          { id: 'all', label: 'الكل' },
                          { id: 'pending', label: 'قيد الانتظار ⏳' },
                          { id: 'approved', label: 'مقبول ✅' },
                          { id: 'rejected', label: 'مرفوض ❌' }
                        ].map(f => (
                          <button
                            key={f.id}
                            onClick={() => setRechargeArchiveFilter(f.id as any)}
                            className={`px-3 py-1 text-[10px] font-black rounded-md transition cursor-pointer ${
                              rechargeArchiveFilter === f.id
                                ? 'bg-amber-500 text-white'
                                : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700'
                            }`}
                          >
                            {f.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    
                    <div className="text-[10px] text-gray-400 font-semibold">
                      عدد الطلبات المعروضة: {
                        recharges.filter(r => rechargeArchiveFilter === 'all' || r.status === rechargeArchiveFilter).length
                      } من أصل {recharges.length}
                    </div>
                  </div>

                  {/* Print Title (Visible only when printing) */}
                  <div className="hidden print:block text-center space-y-2 mb-6 text-black" dir="rtl">
                    <h2 className="text-xl font-bold border-b-2 border-black pb-2">تقرير أرشيف طلبات إيداع وشحن رصيد المحفظة</h2>
                    <p className="text-xs">المتجر: متجر أم روح الكبرى 🌸 | تاريخ الاستخراج: {new Date().toLocaleDateString('ar-YE')}</p>
                    <p className="text-xs">حالة التصفية: {
                      rechargeArchiveFilter === 'all' ? 'جميع الطلبات' :
                      rechargeArchiveFilter === 'approved' ? 'الطلبات المقبولة فقط' :
                      rechargeArchiveFilter === 'rejected' ? 'الطلبات المرفوضة فقط' : 'الطلبات المنتظرة'
                    }</p>
                  </div>

                  {/* Table/Cards */}
                  {recharges.filter(r => rechargeArchiveFilter === 'all' || r.status === rechargeArchiveFilter).length === 0 ? (
                    <div className="text-center py-10 text-gray-400 text-xs font-bold">لا يوجد أي طلبات شحن رصيد تطابق معايير التصفية الحالية.</div>
                  ) : (
                    <div className="overflow-x-auto border border-gray-100 dark:border-gray-800 rounded-2xl print:border-black">
                      <table className="w-full text-right text-xs print:text-black">
                        <thead>
                          <tr className="bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 font-black text-[10px] border-b border-gray-100 dark:border-gray-800 print:bg-none print:border-b-2 print:border-black">
                            <th className="p-3">صاحبة الحساب</th>
                            <th className="p-3">حساب التحويل</th>
                            <th className="p-3">الاسم المحول</th>
                            <th className="p-3 text-center">المبلغ</th>
                            <th className="p-3 text-center">التاريخ والوقت</th>
                            <th className="p-3 text-center">الحالة</th>
                            <th className="p-3 text-center print:hidden">إجراءات</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-gray-800 print:divide-y print:divide-black">
                          {recharges
                            .filter(r => rechargeArchiveFilter === 'all' || r.status === rechargeArchiveFilter)
                            .map(req => (
                              <tr key={req.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition print:hover:bg-none">
                                <td className="p-3">
                                  <div className="font-extrabold text-gray-900 dark:text-white print:text-black">{req.userName}</div>
                                  <div className="text-[10px] text-gray-400 font-mono print:text-black" dir="ltr">{req.userPhone}</div>
                                </td>
                                <td className="p-3 text-gray-600 dark:text-gray-300 print:text-black">{req.senderAccount || 'غير محدد'}</td>
                                <td className="p-3 text-gray-600 dark:text-gray-300 print:text-black">{req.senderName || 'غير محدد'}</td>
                                <td className="p-3 text-center font-black text-amber-800 dark:text-amber-400 print:text-black">
                                  {req.amount.toLocaleString()} YER
                                </td>
                                <td className="p-3 text-center text-gray-400 font-medium text-[10px] print:text-black">
                                  {formatArabicDate(req.createdAt)}
                                </td>
                                <td className="p-3 text-center">
                                  <span className={`px-2.5 py-1 rounded-full text-[9px] font-black inline-block ${
                                    req.status === 'approved'
                                      ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400 print:border print:border-black print:text-black print:bg-none'
                                      : req.status === 'rejected'
                                      ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-400 print:border print:border-black print:text-black print:bg-none'
                                      : 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400 print:border print:border-black print:text-black print:bg-none'
                                  }`}>
                                    {req.status === 'approved' ? 'مقبول ✅' : req.status === 'rejected' ? 'مرفوض ❌' : 'قيد الانتظار ⏳'}
                                  </span>
                                </td>
                                <td className="p-3 text-center print:hidden">
                                  <button
                                    onClick={() => handleDeleteRecharge(req.id)}
                                    className="p-1.5 hover:bg-rose-50 rounded-lg text-rose-600 dark:hover:bg-rose-950/30 transition inline-flex items-center justify-center cursor-pointer"
                                    title="حذف هذا الطلب نهائياً"
                                  >
                                    <Trash2Icon className="w-4 h-4" />
                                  </button>
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* SECTION B: ORDERS ARCHIVE */}
              {subArchiveTab === 'orders' && (
                <div className="space-y-4">
                  {/* Filters bar */}
                  <div className="flex flex-wrap items-center justify-between gap-4 bg-gray-50 dark:bg-gray-900/50 p-4 rounded-2xl print:hidden">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-gray-400 font-bold">تصفية نوع الطلبات:</span>
                      <div className="flex bg-white dark:bg-gray-800 p-0.5 rounded-lg border">
                        {[
                          { id: 'all', label: 'الكل' },
                          { id: 'new', label: 'الطلب الجديد/النشط 🆕' },
                          { id: 'completed', label: 'الطلب المستلم/المرسل 🚚' },
                          { id: 'canceled', label: 'الملغية ❌' }
                        ].map(f => (
                          <button
                            key={f.id}
                            onClick={() => setOrderArchiveFilter(f.id as any)}
                            className={`px-3 py-1 text-[10px] font-black rounded-md transition cursor-pointer ${
                              orderArchiveFilter === f.id
                                ? 'bg-amber-500 text-white'
                                : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700'
                            }`}
                          >
                            {f.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    
                    <div className="text-[10px] text-gray-400 font-semibold">
                      عدد الطلبات المعروضة: {
                        orders.filter(o => {
                          if (orderArchiveFilter === 'all') return true;
                          if (orderArchiveFilter === 'new') return o.status === 'pending' || o.status === 'processing';
                          if (orderArchiveFilter === 'completed') return o.status === 'completed' || o.status === 'sent';
                          if (orderArchiveFilter === 'canceled') return o.status === 'canceled';
                          return true;
                        }).length
                      } من أصل {orders.length}
                    </div>
                  </div>

                  {/* Print Title (Visible only when printing) */}
                  <div className="hidden print:block text-center space-y-2 mb-6 text-black" dir="rtl">
                    <h2 className="text-xl font-bold border-b-2 border-black pb-2">تقرير أرشيف طلبات المبيعات والمشتريات</h2>
                    <p className="text-xs">المتجر: متجر أم روح الكبرى 🌸 | تاريخ الاستخراج: {new Date().toLocaleDateString('ar-YE')}</p>
                    <p className="text-xs">حالة التصفية: {
                      orderArchiveFilter === 'all' ? 'جميع الطلبات' :
                      orderArchiveFilter === 'new' ? 'الطلبات النشطة والجديدة فقط' :
                      orderArchiveFilter === 'completed' ? 'الطلبات المستلمة والمنفذة فقط' : 'الطلبات الملغية'
                    }</p>
                  </div>

                  {/* Table/Cards */}
                  {orders.filter(o => {
                    if (orderArchiveFilter === 'all') return true;
                    if (orderArchiveFilter === 'new') return o.status === 'pending' || o.status === 'processing';
                    if (orderArchiveFilter === 'completed') return o.status === 'completed' || o.status === 'sent';
                    if (orderArchiveFilter === 'canceled') return o.status === 'canceled';
                    return true;
                  }).length === 0 ? (
                    <div className="text-center py-10 text-gray-400 text-xs font-bold">لا يوجد أي طلبات شراء تطابق معايير التصفية الحالية.</div>
                  ) : (
                    <div className="overflow-x-auto border border-gray-100 dark:border-gray-800 rounded-2xl print:border-black">
                      <table className="w-full text-right text-xs print:text-black">
                        <thead>
                          <tr className="bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 font-black text-[10px] border-b border-gray-100 dark:border-gray-800 print:bg-none print:border-b-2 print:border-black">
                            <th className="p-3">رقم الطلب والعميلة</th>
                            <th className="p-3">الأصناف والمنتجات المطلوبة</th>
                            <th className="p-3">العنوان وتفاصيل التوصيل</th>
                            <th className="p-3 text-center">القيمة الإجمالية</th>
                            <th className="p-3 text-center">طريقة الدفع</th>
                            <th className="p-3 text-center">التاريخ والوقت</th>
                            <th className="p-3 text-center">الحالة</th>
                            <th className="p-3 text-center print:hidden">إجراءات</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-gray-800 print:divide-y print:divide-black">
                          {orders
                            .filter(o => {
                              if (orderArchiveFilter === 'all') return true;
                              if (orderArchiveFilter === 'new') return o.status === 'pending' || o.status === 'processing';
                              if (orderArchiveFilter === 'completed') return o.status === 'completed' || o.status === 'sent';
                              if (orderArchiveFilter === 'canceled') return o.status === 'canceled';
                              return true;
                            })
                            .map(order => (
                              <tr key={order.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition print:hover:bg-none">
                                <td className="p-3">
                                  <div className="font-extrabold text-amber-950 dark:text-amber-400 font-mono print:text-black">#{order.id.slice(-6).toUpperCase()}</div>
                                  <div className="font-bold text-gray-800 dark:text-white print:text-black mt-0.5">{order.userName || 'عميلة غير مسجلة'}</div>
                                  <div className="text-[9px] text-gray-400 font-mono print:text-black" dir="ltr">{order.userPhone}</div>
                                </td>
                                <td className="p-3 text-gray-600 dark:text-gray-300 print:text-black max-w-xs leading-relaxed">
                                  {order.items.map((it, idx) => (
                                    <div key={idx} className="text-[10px]">
                                      • {it.productName} <span className="font-black text-amber-900 dark:text-amber-300">({it.quantity}×)</span>
                                    </div>
                                  ))}
                                </td>
                                <td className="p-3 text-gray-500 dark:text-gray-400 print:text-black text-[10px]">
                                  <div>{order.city} - {order.address}</div>
                                  <div className="text-[9px] text-gray-400 mt-0.5">ملاحظات: {order.notes || 'لا يوجد'}</div>
                                </td>
                                <td className="p-3 text-center font-black text-amber-800 dark:text-amber-400 print:text-black">
                                  {order.totalAmount.toLocaleString()} YER
                                </td>
                                <td className="p-3 text-center text-gray-600 dark:text-gray-300 font-semibold print:text-black">
                                  {order.paymentMethod === 'wallet' ? '💳 المحفظة' : '💵 عند الاستلام'}
                                </td>
                                <td className="p-3 text-center text-gray-400 font-mono text-[9px] print:text-black">
                                  {formatArabicDate(order.createdAt)}
                                </td>
                                <td className="p-3 text-center">
                                  <span className={`px-2 py-0.5 rounded-full text-[8.5px] font-black inline-block ${
                                    order.status === 'completed' || order.status === 'sent'
                                      ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400 print:border print:border-black print:text-black print:bg-none'
                                      : order.status === 'canceled'
                                      ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-400 print:border print:border-black print:text-black print:bg-none'
                                      : 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400 print:border print:border-black print:text-black print:bg-none'
                                  }`}>
                                    {
                                      order.status === 'completed' ? 'تم الاستلام والتسليم ✅' :
                                      order.status === 'sent' ? 'تم الإرسال والشحن 🚚' :
                                      order.status === 'canceled' ? 'ملغي ❌' : 'جديد قيد المراجعة ⏳'
                                    }
                                  </span>
                                </td>
                                <td className="p-3 text-center print:hidden">
                                  <button
                                    onClick={() => handleDeleteOrder(order.id)}
                                    className="p-1.5 hover:bg-rose-50 rounded-lg text-rose-600 dark:hover:bg-rose-950/30 transition inline-flex items-center justify-center cursor-pointer"
                                    title="حذف هذا الطلب نهائياً"
                                  >
                                    <Trash2Icon className="w-4 h-4" />
                                  </button>
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* SECTION C: EVENTS ARCHIVE */}
              {subArchiveTab === 'events' && (
                <div className="space-y-4">
                  {/* Print Title (Visible only when printing) */}
                  <div className="hidden print:block text-center space-y-2 mb-6 text-black" dir="rtl">
                    <h2 className="text-xl font-bold border-b-2 border-black pb-2">تقرير أرشيف مسابقات وأصوات أم روح</h2>
                    <p className="text-xs">المتجر: متجر أم روح الكبرى 🌸 | تاريخ الاستخراج: {new Date().toLocaleDateString('ar-YE')}</p>
                    <p className="text-xs">عدد المتسابقين الكلي: {contestants.length} متسابق(ة)</p>
                  </div>

                  {contestants.length === 0 ? (
                    <div className="text-center py-10 text-gray-400 text-xs font-bold">لا يوجد أي متسابقين مسجلين في المسابقة حالياً.</div>
                  ) : (
                    <div className="overflow-x-auto border border-gray-100 dark:border-gray-800 rounded-2xl print:border-black">
                      <table className="w-full text-right text-xs print:text-black">
                        <thead>
                          <tr className="bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 font-black text-[10px] border-b border-gray-100 dark:border-gray-800 print:bg-none print:border-b-2 print:border-black">
                            <th className="p-3">صورة المتسابق(ة)</th>
                            <th className="p-3">الاسم ورقم الهاتف</th>
                            <th className="p-3 text-center">الأصوات الذهبية 👍</th>
                            <th className="p-3 text-center">الأصوات الفضية 👎</th>
                            <th className="p-3 text-center">إجمالي عدد الأصوات</th>
                            <th className="p-3 text-center print:hidden">إجراءات</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-gray-800 print:divide-y print:divide-black">
                          {contestants.map(c => (
                            <tr key={c.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition print:hover:bg-none">
                              <td className="p-3">
                                {c.imageUrl ? (
                                  <img src={c.imageUrl} alt={c.name} className="w-10 h-10 object-cover rounded-full border border-gray-200" />
                                ) : (
                                  <div className="w-10 h-10 bg-amber-50 rounded-full flex items-center justify-center text-amber-500 text-xs font-black">👤</div>
                                )}
                              </td>
                              <td className="p-3">
                                <div className="font-extrabold text-gray-900 dark:text-white print:text-black">{c.name}</div>
                                <div className="text-[10px] text-gray-400 font-mono print:text-black" dir="ltr">{c.phone}</div>
                              </td>
                              <td className="p-3 text-center font-black text-emerald-600 dark:text-emerald-400 print:text-black">
                                {c.greenVotes ?? 0} صوت
                              </td>
                              <td className="p-3 text-center font-black text-rose-500 dark:text-rose-400 print:text-black">
                                {c.redVotes ?? 0} صوت
                              </td>
                              <td className="p-3 text-center font-black text-amber-800 dark:text-amber-400 print:text-black">
                                {c.votes ?? 0} صوت كلي
                              </td>
                              <td className="p-3 text-center print:hidden">
                                <button
                                  onClick={() => {
                                    askConfirmation(
                                      'حذف المتسابق(ة) نهائياً 🗑️',
                                      `هل أنتِ متأكدة من رغبتكِ في حذف المتسابق "${c.name}" من أرشيف المسابقات نهائياً وتصفير أصواته؟`,
                                      () => {
                                        Database.deleteContestant(c.id);
                                        showToast('تم حذف المتسابق وإصدار التحديث.');
                                        reloadData();
                                      }
                                    );
                                  }}
                                  className="p-1.5 hover:bg-rose-50 rounded-lg text-rose-600 dark:hover:bg-rose-950/30 transition inline-flex items-center justify-center cursor-pointer"
                                  title="حذف هذا المتسابق"
                                >
                                  <Trash2Icon className="w-4 h-4" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Unauthorized Domain Guide Modal */}
        <UnauthorizedDomainModal isOpen={showDomainModal} onClose={() => setShowDomainModal(false)} errorType={authErrorType} />
      </div>
    </div>
  );
}

// Simple custom Trash icon to avoid missing export references
function Trash2Icon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-4v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
  );
}

// Simple custom Edit icon
function EditIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
    </svg>
  );
}
