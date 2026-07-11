/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db, COLLECTIONS } from './firebase';
import { Database } from './Database';
import { supabase, isSupabaseConfigured } from './supabase';
import { 
  Category, 
  Product, 
  Order, 
  ExchangeRate, 
  User, 
  OrderItem, 
  RechargeRequest, 
  AdvisorSettings,
  Currency,
  Contestant,
  ArchivedEvent
} from './types';
import Navbar from './components/Navbar';
import NewsTicker from './components/NewsTicker';
import HomeTab from './components/HomeTab';
import CartTab from './components/CartTab';
import ProfileTab from './components/ProfileTab';
import ProductDetails from './components/ProductDetails';
import AdvisorChatDrawer from './components/AdvisorChatDrawer';
import { NotificationsDrawer } from './components/NotificationsDrawer';
import AdminPanel from './components/store-admin-panel';
import OfflineFallback from './components/OfflineFallback';
import RegistrationOnboarding from './components/RegistrationOnboarding';
import InstallPromptModal from './components/InstallPromptModal';
import { convertPrice, getCurrencyCode, getDirectImageUrl, evaluateUserTarget, showSystemNotification, playNotificationSound, getWhatsAppLink } from './utils';
import { motion, AnimatePresence } from 'motion/react';
import { Percent, Flame, Sparkles, ArrowRight, Bell, Clock, X, Trash2, ShieldAlert } from 'lucide-react';

function checkOtaRedirect(settings: any) {
  if (typeof window === 'undefined') return;
  
  // Check if they want to bypass OTA updates via URL parameter (e.g. for maintenance or fixing loops)
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('skip_ota') === 'true' || urlParams.get('no_ota') === 'true') {
    console.log('[OTA Update] Bypass requested via URL parameters.');
    return;
  }

  const currentAppUrlFromDb = settings?.currentAppUrl;
  if (currentAppUrlFromDb && currentAppUrlFromDb.trim() !== "") {
    const cleanDbUrl = currentAppUrlFromDb.trim().replace(/\/$/, ""); // remove trailing slash
    const cleanCurrentUrl = window.location.href.trim().replace(/\/$/, "");
    const cleanCurrentOrigin = window.location.origin.trim().replace(/\/$/, "");
    
    // Ignore localhost, preview/development container environments
    const isLocalhost = 
      window.location.hostname === 'localhost' || 
      window.location.hostname === '127.0.0.1' || 
      window.location.hostname.includes('ais-dev-') || 
      window.location.hostname.includes('run.app');
      
    if (!isLocalhost && cleanCurrentOrigin !== cleanDbUrl && !cleanCurrentUrl.startsWith(cleanDbUrl)) {
      console.log('[OTA Update] Redirecting to new deployment URL with query parameters:', cleanDbUrl);
      localStorage.setItem('amrwh_current_app_url', cleanDbUrl);
      
      // Preserve search parameters (query parameters like ?code=xxx) during OTA redirect
      const searchParams = window.location.search;
      let targetUrl = currentAppUrlFromDb;
      if (searchParams) {
        if (targetUrl.includes('?')) {
          targetUrl += '&' + searchParams.substring(1);
        } else {
          targetUrl += searchParams;
        }
      }
      
      window.location.href = targetUrl;
    }
  }
}

export default function App() {
  // Navigation & Overlays
  const [activeTab, setActiveTab] = useState<string>('home');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedCategoryInTab, setSelectedCategoryInTab] = useState<Category | null>(null);
  const [isAdvisorChatOpen, setIsAdvisorChatOpen] = useState(false);
  const [isAdminUnlocked, setIsAdminUnlocked] = useState(false);
  const [adminRole, setAdminRole] = useState<'full' | 'worker' | null>(null);

  // App Unified Database State
  const [user, setUser] = useState<User>(Database.getUser());
  const [suggestedRecoveryUser, setSuggestedRecoveryUser] = useState<User | null>(null);
  const [categories, setCategories] = useState<Category[]>(Database.getCategories());
  const [products, setProducts] = useState<Product[]>(Database.getProducts());
  const [rates, setRates] = useState<ExchangeRate>(Database.getExchangeRate());
  const [advisor, setAdvisor] = useState<AdvisorSettings>(Database.getAdvisorSettings());
  const [offerImages, setOfferImages] = useState<string[]>(Database.getOffersImages());
  const [adminCode, setAdminCode] = useState<string>(Database.getAdminCode());
  const [shuffledProducts, setShuffledProducts] = useState<Product[]>([]);
  const [tickerTexts, setTickerTexts] = useState<string[]>(() => Database.getTickerTexts());
  const [offersSubTab, setOffersSubTab] = useState<'active' | 'archived'>('active');
  const [archivedEvents, setArchivedEvents] = useState<ArchivedEvent[]>(() => Database.getArchivedEvents());

  // Fetch news ticker texts from the dedicated firestore/supabase collection/table whenever home tab is opened or on startup
  useEffect(() => {
    if (activeTab === 'home') {
      const fetchFreshTicker = async () => {
        try {
          if (Database.isBackupMode()) {
            // في وضع جوجل شيتس، نعتمد بالكامل على البيانات المحدثة والمخزنة محلياً لتفادي استهلاك الكوتا
            const localTexts = Database.getTickerTexts();
            if (localTexts && localTexts.length > 0) {
              setTickerTexts(localTexts);
            }
            return;
          }

          if (isSupabaseConfigured()) {
            const { data, error } = await supabase!
              .from('ticker_texts')
              .select('*')
              .order('sortOrder', { ascending: true });
            
            if (error) throw error;
            if (data && data.length > 0) {
              const texts = data.map(item => item.text).filter(Boolean);
              if (texts.length > 0) {
                setTickerTexts(texts);
                localStorage.setItem('amrwh_ticker_texts', JSON.stringify(texts));
              }
            }
          } else {
            const snap = await getDocs(collection(db, COLLECTIONS.TICKER_TEXTS));
            if (snap && !snap.empty) {
              const list: any[] = [];
              snap.forEach(d => list.push(d.data()));
              list.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
              const texts = list.map(item => item.text).filter(Boolean);
              if (texts.length > 0) {
                setTickerTexts(texts);
                localStorage.setItem('amrwh_ticker_texts', JSON.stringify(texts));
              }
            }
          }
        } catch (err) {
          console.warn("Error fetching fresh ticker on tab open:", err);
        }
      };
      fetchFreshTicker();
    }
  }, [activeTab]);

  // Shuffle products list randomly when products change
  useEffect(() => {
    if (products.length > 0) {
      setShuffledProducts([...products].sort(() => Math.random() - 0.5));
    }
  }, [products.length]);

  const [cart, setCart] = useState<OrderItem[]>(() => {
    try {
      const stored = localStorage.getItem('amrwh_cart_items');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  // Keep cart synced to localStorage
  useEffect(() => {
    localStorage.setItem('amrwh_cart_items', JSON.stringify(cart));
  }, [cart]);

  // Targeted Notifications & Gifts States
  const [showNotificationDrawer, setShowNotificationDrawer] = useState(false);
  const [popupQueue, setPopupQueue] = useState<any[]>([]);
  const [giftPopup, setGiftPopup] = useState<{ amount: number; title: string; expiryStr: string } | null>(null);
  const [giftReminderPopup, setGiftReminderPopup] = useState<{ amount: number; campaignTitle: string; hoursLeft: number } | null>(null);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(() => {
    return typeof window !== 'undefined' ? (window as any).deferredPrompt || null : null;
  });
  const [activeToast, setActiveToast] = useState<{ id: string; title: string; message: string; productId?: string } | null>(null);
  const [voterReferral, setVoterReferral] = useState<Contestant | null>(null);
  const [hasVotedReferral, setHasVotedReferral] = useState<boolean>(false);
  const [voterInputName, setVoterInputName] = useState<string>('');
  const [voterInputPhone, setVoterInputPhone] = useState<string>('');

  const showToast = (message: string) => {
    setActiveToast({
      id: 'TOAST_' + Date.now(),
      title: 'تنبيه من متجر أم روح 🌸',
      message
    });
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const voteId = params.get('vote') || params.get('ref') || params.get('referrer_phone');
    const referrerName = params.get('referrer_name');
    
    if (voteId) {
      const alreadyActioned = localStorage.getItem('amrwh_referral_completed_or_skipped') === 'true';
      if (alreadyActioned) return;

      setTimeout(() => {
        const contestants = Database.getContestants();
        let contestant = contestants.find(c => c.id === voteId || c.phone === voteId);
        
        // If not found as contestant but referrer_phone is provided, register them as contestant
        if (!contestant && params.get('referrer_phone')) {
          const phone = params.get('referrer_phone') || '';
          const name = referrerName || 'متسابق';
          const addRes = Database.addContestant(name, phone);
          if (addRes.success && addRes.contestant) {
            contestant = addRes.contestant;
          }
        }
        
        if (contestant) {
          setVoterReferral(contestant);
        }
      }, 1000);
    }
  }, []);

  // Device Lock States
  const [isDeviceBlocked, setIsDeviceBlocked] = useState<boolean>(false);
  const [isUnlockRequestPending, setIsUnlockRequestPending] = useState<boolean>(false);
  const [newPhoneInput, setNewPhoneInput] = useState('');
  const [changePhoneError, setChangePhoneError] = useState('');

  const handleRequestDeviceUnlock = async () => {
    const currentDeviceId = localStorage.getItem('amrwh_device_id') || '';
    if (!currentDeviceId || !user.phone) return;

    Database.submitDeviceUnlockRequest(
      user.id,
      user.name,
      user.phone,
      currentDeviceId
    );
    setIsUnlockRequestPending(true);
  };

  const handleOpenWhatsappUnlock = () => {
    const currentDeviceId = localStorage.getItem('amrwh_device_id') || '';
    const storePhone = advisor.whatsappNumber || '967739563915';
    const cleanPhone = storePhone.replace(/[+\s-]/g, '');
    const message = `السلام عليكم يا إدارة متجر أم روح، لقد أرسلت طلب إلغاء ربط جهازي القديم وتفعيل جهازي الحالي للرقم (${user.phone}). جهازي الجديد هو: (${currentDeviceId}). يرجى التفعيل والقبول.`;
    const waUrl = getWhatsAppLink(cleanPhone, message);
    window.open(waUrl, '_blank');
  };

  // Periodic Device Lock Validator Effect
  useEffect(() => {
    let active = true;
    const performDeviceCheck = async () => {
      if (!user.phone) return;
      const currentDeviceId = localStorage.getItem('amrwh_device_id') || '';
      if (!currentDeviceId) return;

      const blocked = await Database.checkIsDeviceBlocked(user.phone, currentDeviceId);
      if (active) {
        setIsDeviceBlocked(blocked);
        if (blocked) {
          const pending = await Database.checkPendingUnlockRequest(user.phone, currentDeviceId);
          setIsUnlockRequestPending(pending);
        }
      }
    };

    performDeviceCheck();
    const interval = setInterval(performDeviceCheck, 15000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [user.phone]);

  // Dark Mode
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    return localStorage.getItem('amrwh_theme') === 'dark';
  });

  // Syncing & Online states
  const [isSyncing, setIsSyncing] = useState<boolean>(true);
  const [isOnline, setIsOnline] = useState<boolean>(typeof window !== 'undefined' ? navigator.onLine : true);
  const [showWelcome, setShowWelcome] = useState<boolean>(true);

  const triggerSync = async () => {
    setIsSyncing(true);
    try {
      await Database.syncFromFirestore(() => {
        handleReloadAll();
        setIsSyncing(false);

        // Prioritize loading/pre-fetching of slider, category, and first few product images
        try {
          const currentOffers = Database.getOffersImages();
          const currentCategories = Database.getCategories().map(c => c.image);
          const currentProducts = Database.getProducts().slice(0, 8).flatMap(p => p.images || []);
          
          const allUrls = [...currentOffers, ...currentCategories, ...currentProducts].filter(Boolean);
          allUrls.forEach(url => {
            const img = new Image();
            img.src = url;
          });
        } catch (preloadErr) {
          console.warn("Preloading images failed:", preloadErr);
        }

        // Hide welcome overlay on successful sync
        setShowWelcome(false);
      }, true);
    } catch (e) {
      console.warn("Firestore sync failed:", e);
      setIsSyncing(false);
      setShowWelcome(false);
    }
  };

  // Monitor network status
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      triggerSync(); // Auto-retry sync when coming back online
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Listen to PWA installation prompt
  useEffect(() => {
    // Check if prompt was already captured globally
    if (typeof window !== 'undefined' && (window as any).deferredPrompt) {
      setDeferredPrompt((window as any).deferredPrompt);
    }

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      if (typeof window !== 'undefined') {
        (window as any).deferredPrompt = e;
      }
    };

    const handleGlobalPrompt = (e: any) => {
      if (e.detail) {
        setDeferredPrompt(e.detail);
      }
    };

    const handleAppInstalled = () => {
      setDeferredPrompt(null);
      if (typeof window !== 'undefined') {
        (window as any).deferredPrompt = null;
      }
      console.log('PWA was installed successfully!');
      
      Database.addNotification({
        id: 'NOTIF-' + Math.floor(1000 + Math.random() * 9000),
        userId: user.id || 'guest',
        title: '🎉 تهانينا! تم تثبيت متجر أم روح',
        message: 'تم تثبيت متجر أم روح على الشاشة الرئيسية بنجاح! شكراً لكِ على ثقتكِ الكريمة وولائكِ، ونعدكِ بتقديم تجربة تسوق رائعة وسلسة! 💖',
        createdAt: new Date().toISOString(),
        isRead: false
      });
      handleReloadAll();
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('global-beforeinstallprompt', handleGlobalPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('global-beforeinstallprompt', handleGlobalPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, [user.id]);

  // Real-time notifications listener for in-app toast popups and browser push notifications
  useEffect(() => {
    // Request permission on mount if supported
    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'default') {
        try {
          Notification.requestPermission().catch(() => {});
        } catch (e) {
          console.warn("Notification.requestPermission blocked:", e);
        }
      }
    }

    const handleNewNotification = (e: Event) => {
      const customEvent = e as CustomEvent;
      const notif = customEvent.detail;
      if (!notif) return;

      // Filter: only show if notif is either global (no userId) or specific to the current active user
      if (notif.userId && notif.userId !== user.id) {
        return;
      }

      // 1. Show in-app light and fast toast popup
      setActiveToast({
        id: notif.id,
        title: notif.title,
        message: notif.message,
        productId: notif.productId
      });

      // Automatically auto-dismiss toast after 6 seconds
      const timeoutId = setTimeout(() => {
        setActiveToast(prev => prev?.id === notif.id ? null : prev);
      }, 6000);

      // Reload notifications count / data in App
      handleReloadAll();

      // 2. Background Browser Push Notification
      try {
        showSystemNotification(notif.title, notif.message, {
          tag: notif.id,
          image: notif.image,
          data: { productId: notif.productId }
        });
      } catch (err) {
        console.error("Browser notification failed to trigger:", err);
      }
    };

    window.addEventListener('new-notification-alert', handleNewNotification);
    return () => {
      window.removeEventListener('new-notification-alert', handleNewNotification);
    };
  }, [user.id]);

  // Load and seed database once on mount
  useEffect(() => {
    // Perform database seed
    Database.seed();
    
    // Fetch refreshed listings from local cache first
    setUser(Database.getUser());
    setCategories(Database.getCategories());
    setProducts(Database.getProducts());
    setRates(Database.getExchangeRate());
    setAdvisor(Database.getAdvisorSettings());
    setOfferImages(Database.getOffersImages());
    setAdminCode(Database.getAdminCode());

    // Check OTA update on initial mount from cache
    try {
      const cachedSettings = Database.getAdminSettings();
      checkOtaRedirect(cachedSettings);
    } catch (e) {
      console.warn("OTA check on mount failed:", e);
    }

    // Sync asynchronously from Firestore
    triggerSync();

    // Safety welcome screen timeout (max 4 seconds, shorter if already synced once)
    const hasData = Database.hasSyncedOnce();
    const timeoutDuration = hasData ? 1200 : 4000;
    const timeout = setTimeout(() => {
      setShowWelcome(false);
    }, timeoutDuration);

    return () => clearTimeout(timeout);
  }, []);

  // Handle product deep-linking from shared URLs containing ?code=... or ?prod=...
  useEffect(() => {
    if (products.length > 0) {
      const params = new URLSearchParams(window.location.search);
      const codeParam = params.get('code');
      const prodParam = params.get('prod');
      
      if (codeParam || prodParam) {
        const searchVal = (codeParam || prodParam || '').trim().toLowerCase();
        const found = products.find(p => 
          p.code.toLowerCase() === searchVal || 
          p.id.toLowerCase() === searchVal
        );
        if (found) {
          setSelectedProduct(found);
          // clear code parameters from address bar gracefully
          const cleanUrl = window.location.origin + window.location.pathname;
          window.history.replaceState({ activeTab }, document.title, cleanUrl);
        }
      }
    }
  }, [products]);

  // Account Recovery check based on IP Detection
  useEffect(() => {
    if (user && !user.isRegistered && !isSyncing) {
      const allUsers = Database.getAllUsers();
      const currentIp = user.ip;
      if (currentIp) {
        const found = allUsers.find(u => u.ip === currentIp && u.isRegistered);
        if (found && found.id !== user.id) {
          setSuggestedRecoveryUser(found);
        }
      }
    }
  }, [user, isSyncing]);

  // Keep track of shown system notification IDs to avoid double alerts
  const systemNotifiedIdsRef = React.useRef<string[]>([]);
  const appLoadTimeRef = React.useRef<string>(new Date().toISOString());

  // Periodically check for new incoming notifications to trigger system popups
  useEffect(() => {
    if (!user || !user.id) return;

    // Request notification permission on load
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
      try {
        Notification.requestPermission().catch(() => {});
      } catch (e) {
        console.warn("Notification.requestPermission blocked:", e);
      }
    }

    const checkAndTriggerSystemNotifications = () => {
      try {
        const list = Database.getNotifications(user.id);
        const unreadNew = list.filter(n => {
          // Must be unread
          if (n.isRead) return false;
          // Must not have been notified already in this session
          if (systemNotifiedIdsRef.current.includes(n.id)) return false;
          // Must be for this user or public
          const matchesUser = !n.userId || n.userId === user.id;
          if (!matchesUser) return false;
          // Must be created after or near the app load time
          const notifTime = new Date(n.createdAt).getTime();
          const loadTime = new Date(appLoadTimeRef.current).getTime();
          // Allow up to 10 seconds before load to handle race conditions
          return notifTime > loadTime - 10000;
        });

        if (unreadNew.length > 0) {
          unreadNew.forEach(n => {
            showSystemNotification(n.title, n.message, {
              tag: n.id,
              image: n.image,
              data: { productId: n.productId }
            });
            systemNotifiedIdsRef.current.push(n.id);
          });
        }
      } catch (err) {
        console.warn('Error checking system notifications:', err);
      }
    };

    // Check immediately
    checkAndTriggerSystemNotifications();

    // Check every 10 seconds for real-time notifications
    const interval = setInterval(checkAndTriggerSystemNotifications, 10000);
    return () => clearInterval(interval);
  }, [user.id]);

  // Run evaluation of targeted popups, gifts, and expiry warnings
  useEffect(() => {
    if (!user || !user.id) return;
    
    // 1. Evaluate targeted notifications to find popup ones
    const allTargetedNotifications = Database.getTargetedNotifications();
    const userOrders = Database.getOrders().filter(o => o.userId === user.id);
    
    const matchedPopups = allTargetedNotifications.filter(tn => {
      // Must not be expired
      if (new Date(tn.expiryAt).getTime() <= Date.now()) return false;
      // Must match user criteria
      const matches = evaluateUserTarget(user, userOrders, tn.targetType, tn.targetValue);
      // Must be a popup
      return matches && tn.isPopup;
    });
    
    const shownSessionPopups = sessionStorage.getItem('amrwh_shown_popups');
    const shownIds = shownSessionPopups ? JSON.parse(shownSessionPopups) : [];
    const unshownPopups = matchedPopups.filter(p => !shownIds.includes(p.id));
    
    if (unshownPopups.length > 0) {
      setPopupQueue(unshownPopups);
    }

    // 2. Evaluate targeted gifts
    const allTargetedGifts = Database.getTargetedGifts();
    const activeLogs = Database.getUserTargetedGiftLogs().filter(l => l.userId === user.id);

    allTargetedGifts.forEach(gift => {
      // Must not be expired
      if (new Date(gift.expiryAt).getTime() <= Date.now()) return;
      // Must match user criteria
      const matches = evaluateUserTarget(user, userOrders, gift.targetType, gift.targetValue);
      if (!matches) return;

      // Must not be claimed already (check logs or gift claimed list)
      const isAlreadyClaimed = activeLogs.some(l => l.giftCampaignId === gift.id) || gift.claimedUserIds?.includes(user.id);
      if (isAlreadyClaimed) return;

      // Award the gift!
      const giftAmount = gift.amount;
      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + gift.daysToUse);

      const newLog = {
        id: 'LOG-' + Math.floor(10000 + Math.random() * 90000),
        userId: user.id,
        userName: user.name,
        userPhone: user.phone,
        amount: giftAmount,
        giftCampaignId: gift.id,
        giftCampaignTitle: gift.title,
        createdAt: new Date().toISOString(),
        expiryAt: expiryDate.toISOString(),
        status: 'active' as const
      };

      // Add balance to user
      const updatedUser = {
        ...user,
        giftBalance: (user.giftBalance || 0) + giftAmount
      };
      
      const savedUser = Database.saveUser(updatedUser);
      setUser(savedUser);
      Database.updateUserBalances(savedUser.id, savedUser.balance, savedUser.giftBalance);
      
      // Save log
      Database.saveUserTargetedGiftLog(newLog);

      // Add to claimed users in targeted gift
      const updatedClaimed = gift.claimedUserIds ? [...gift.claimedUserIds, user.id] : [user.id];
      Database.saveTargetedGift({
        ...gift,
        claimedUserIds: updatedClaimed
      });

      // Add standard notification to inform user
      Database.addNotification({
        id: 'NOTIF-' + Math.floor(1000 + Math.random() * 9000),
        userId: user.id,
        title: `🎁 حصلتِ على هدية: ${gift.title}`,
        message: `تهانينا! تم منحكِ رصيد هدية بقيمة ${giftAmount} ريال يمني جديد، وهو صالح للاستخدام حتى ${expiryDate.toLocaleDateString('ar-YE')}! ✨`,
        createdAt: new Date().toISOString(),
        isRead: false
      });

      // Queue gift received popup
      setGiftPopup({
        amount: giftAmount,
        title: gift.title,
        expiryStr: expiryDate.toLocaleDateString('ar-YE')
      });
    });

    // 3. Remind user of expiring gifts before duration ends
    const nowTime = Date.now();
    const activeExpiringGifts = Database.getUserTargetedGiftLogs().filter(l => {
      if (l.userId !== user.id || l.status !== 'active') return false;
      const expTime = new Date(l.expiryAt).getTime();
      const timeLeftMs = expTime - nowTime;
      // Expiring in less than 48 hours but still active
      return timeLeftMs > 0 && timeLeftMs < 48 * 60 * 60 * 1000;
    });

    const warnedSession = sessionStorage.getItem('amrwh_warned_session');
    if (activeExpiringGifts.length > 0 && !warnedSession) {
      const urgentGift = activeExpiringGifts[0];
      const timeLeftMs = new Date(urgentGift.expiryAt).getTime() - nowTime;
      const hoursLeft = Math.ceil(timeLeftMs / (3600 * 1000));
      
      setGiftReminderPopup({
        amount: urgentGift.amount,
        campaignTitle: urgentGift.giftCampaignTitle,
        hoursLeft: hoursLeft
      });
      sessionStorage.setItem('amrwh_warned_session', 'true');
    }
  }, [user.id]);

  // Update theme classes
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('amrwh_theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('amrwh_theme', 'light');
    }
  }, [isDarkMode]);

  // Close product details when active tab changes, except when triggered by history navigation
  // Also silently and automatically refresh categories/products from Firestore on transition
  const lastTabRef = React.useRef<string | null>(null);

  useEffect(() => {
    if (isNavigatingRef.current) {
      lastTabRef.current = activeTab;
      return;
    }
    if (lastTabRef.current !== null && lastTabRef.current !== activeTab) {
      setSelectedProduct(null);
      setSelectedCategoryInTab(null);
    }
    lastTabRef.current = activeTab;

    // Silent background refresh of products/categories on any tab switch
    const syncSilentlyOnTabChange = async () => {
      try {
        await Database.syncFromFirestore(() => {
          handleReloadAll();
        });
      } catch (err) {
        console.warn("Silent background sync on tab change failed:", err);
      }
    };
    syncSilentlyOnTabChange();
  }, [activeTab]);

  // Browser Back Button & Swipe Gesture History Sync
  const isNavigatingRef = React.useRef(false);

  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      isNavigatingRef.current = true;
      const state = event.state;
      if (state) {
        if (state.activeTab !== undefined) {
          setActiveTab(state.activeTab);
        }
        if (state.selectedProductId) {
          const prod = products.find(p => p.id === state.selectedProductId);
          setSelectedProduct(prod || null);
        } else {
          setSelectedProduct(null);
        }
        if (state.selectedCategoryInTabId) {
          const cat = categories.find(c => c.id === state.selectedCategoryInTabId);
          setSelectedCategoryInTab(cat || null);
        } else {
          setSelectedCategoryInTab(null);
        }
        if (state.isAdminUnlocked !== undefined) {
          setIsAdminUnlocked(state.isAdminUnlocked);
        }
      } else {
        setActiveTab('home');
        setSelectedProduct(null);
        setSelectedCategoryInTab(null);
        setIsAdminUnlocked(false);
      }
      setTimeout(() => {
        isNavigatingRef.current = false;
      }, 50);
    };

    window.addEventListener('popstate', handlePopState);

    // Initial state replacement to avoid empty state on mount
    if (!window.history.state) {
      window.history.replaceState({
        activeTab,
        selectedProductId: selectedProduct?.id || null,
        selectedCategoryInTabId: selectedCategoryInTab?.id || null,
        isAdminUnlocked
      }, '');
    }

    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [products, categories]);

  // Synchronize state changes into History Stack
  useEffect(() => {
    if (isNavigatingRef.current) return;

    const newState = {
      activeTab,
      selectedProductId: selectedProduct?.id || null,
      selectedCategoryInTabId: selectedCategoryInTab?.id || null,
      isAdminUnlocked
    };

    const currentState = window.history.state;
    // Check if the state is actually different from current state in history to avoid redundant pushes
    const isDifferent = !currentState || 
      currentState.activeTab !== newState.activeTab ||
      currentState.selectedProductId !== newState.selectedProductId ||
      currentState.selectedCategoryInTabId !== newState.selectedCategoryInTabId ||
      currentState.isAdminUnlocked !== newState.isAdminUnlocked;

    if (isDifferent) {
      window.history.pushState(newState, '');
    }
  }, [activeTab, selectedProduct, selectedCategoryInTab, isAdminUnlocked]);

  // Synchronize state when admin changes occur
  const handleReloadAll = () => {
    setUser(Database.getUser());
    setCategories(Database.getCategories());
    setProducts(Database.getProducts());
    setRates(Database.getExchangeRate());
    setAdvisor(Database.getAdvisorSettings());
    setOfferImages(Database.getOffersImages());
    setAdminCode(Database.getAdminCode());
    setTickerTexts(Database.getTickerTexts());
    setArchivedEvents(Database.getArchivedEvents());

    // Check OTA update after sync is done
    try {
      const freshSettings = Database.getAdminSettings();
      checkOtaRedirect(freshSettings);
    } catch (e) {
      console.warn("OTA check on reload failed:", e);
    }
  };

  // ----------------------------------------------------
  // --- CART OPERATIONS ---
  const getPropertiesKey = (selected: { [key: string]: string }) => {
    return Object.entries(selected).map(([k, v]) => `${k}:${v}`).join('|');
  };

  const handleAddToCart = (newItem: OrderItem) => {
    setCart((prev) => {
      const matchIdx = prev.findIndex(
        (item) => 
          item.productId === newItem.productId && 
          getPropertiesKey(item.selectedProperties) === getPropertiesKey(newItem.selectedProperties)
      );

      if (matchIdx >= 0) {
        const updated = [...prev];
        updated[matchIdx].quantity += newItem.quantity;
        updated[matchIdx].totalPrice = updated[matchIdx].price * updated[matchIdx].quantity;
        return updated;
      } else {
        return [...prev, newItem];
      }
    });
  };

  const handleUpdateCartQuantity = (productId: string, propKey: string, qty: number) => {
    setCart((prev) => 
      prev.map((item) => {
        if (item.productId === productId && getPropertiesKey(item.selectedProperties) === propKey) {
          return {
            ...item,
            quantity: qty,
            totalPrice: item.price * qty
          };
        }
        return item;
      })
    );
  };

  const handleRemoveCartItem = (productId: string, propKey: string) => {
    setCart((prev) => 
      prev.filter(
        (item) => 
          !(item.productId === productId && getPropertiesKey(item.selectedProperties) === propKey)
      )
    );
  };

  const handleClearCart = () => {
    setCart([]);
  };

  // ----------------------------------------------------
  // --- CHECKOUT SUBMISSION ---
  const handleSubmitOrder = (
    orderData: Omit<Order, 'id' | 'userId' | 'userName' | 'userPhone' | 'createdAt' | 'status'>,
    guestInfo?: { name: string; phone: string }
  ) => {
    const isRegisteredNow = user.isRegistered || !!guestInfo;
    const finalName = guestInfo ? guestInfo.name : user.name;
    const finalPhone = guestInfo ? guestInfo.phone : user.phone;

    // Keep user's profile address in sync with the latest order's delivery address
    const updatedUserWithAddress = {
      ...user,
      name: finalName,
      phone: finalPhone,
      address: orderData.address,
      isRegistered: isRegisteredNow
    };

    const generatedOrderId = 'ORD-' + Math.floor(1000 + Math.random() * 9000);

    Database.saveOrder({
      ...orderData,
      id: generatedOrderId,
      userId: user.id,
      userName: finalName,
      userPhone: finalPhone,
      createdAt: new Date().toISOString(),
      status: 'pending'
    });

    // Notify user of successful order submission
    Database.addNotification({
      id: 'NOTIF_' + Date.now() + '_order',
      userId: user.id,
      title: 'تم إرسال طلبكِ بنجاح 🎉',
      message: `يسعدنا إبلاغكِ بأن طلبكِ المميّز ذو الرقم المرجعي (${generatedOrderId}) قد تم تسجيله بنجاح وسوف تقوم الإدارة بمراجعته وتأكيده بأسرع وقت ممكن! شكراً لتسوقكِ معنا 🌸.`,
      createdAt: new Date().toISOString(),
      isRead: false
    });

    // If payment method is wallet, deduct from user's gift balance or recharge balance accordingly
    if (orderData.paymentMethod === 'gift_wallet') {
      const deduction = convertPrice(orderData.totalAmount, 'YER_NEW', rates);
      const updatedUser = {
        ...updatedUserWithAddress,
        giftBalance: Math.max(0, (user.giftBalance || 0) - deduction)
      };
      const savedUser = Database.saveUser(updatedUser);
      setUser(savedUser);
      Database.updateUserBalances(savedUser.id, savedUser.balance, savedUser.giftBalance);
    } else if (orderData.paymentMethod === 'recharge_wallet') {
      const deduction = convertPrice(orderData.totalAmount, 'YER_NEW', rates);
      const updatedUser = {
        ...updatedUserWithAddress,
        balance: Math.max(0, user.balance - deduction)
      };
      const savedUser = Database.saveUser(updatedUser);
      setUser(savedUser);
      Database.updateUserBalances(savedUser.id, savedUser.balance, savedUser.giftBalance || 0);
    } else {
      const savedUser = Database.saveUser(updatedUserWithAddress);
      setUser(savedUser);
    }

    handleReloadAll();
  };

  // ----------------------------------------------------
  // --- PROFILE EDITS SYNC ---
  const handleUpdateUser = (updatedUser: User) => {
    const savedUser = Database.saveUser(updatedUser);
    setUser(savedUser);
    handleReloadAll();
  };

  const handleToggleFavorite = (productId: string) => {
    const updatedUser = Database.toggleProductFavorite(user.id, productId);
    setUser(updatedUser);
    handleReloadAll();
  };

  const handleSubmitRecharge = (rechargeData: Omit<RechargeRequest, 'id' | 'userId' | 'userName' | 'userPhone' | 'createdAt' | 'status'>) => {
    Database.submitRechargeRequest({
      ...rechargeData,
      userId: user.id,
      userName: user.name,
      userPhone: user.phone
    });
    Database.addNotification({
      id: 'NOTIF_' + Date.now() + '_recharge',
      userId: user.id,
      title: 'تم إرسال طلب شحن الرصيد بنجاح 💳',
      message: `تم رفع طلب شحن رصيد محفظتكِ الإلكترونية بنجاح (المبلغ: ${rechargeData.amount} ريال يمني جديد) باسم المرسل (${rechargeData.senderName}). يجري الآن التدقيق ومطابقة الحوالة من قبل الإدارة وسوف يتم تفعيل رصيدكِ السحابي فوراً وتنبيهكِ بإنهاء الإيداع! 👍`,
      createdAt: new Date().toISOString(),
      isRead: false
    });
    handleReloadAll();
  };

  const handleSubmitPhoneRequest = (oldPhone: string, newPhone: string, newName?: string) => {
    Database.submitPhoneRequest(
      user.id,
      user.name,
      oldPhone,
      newPhone,
      newName
    );
    handleReloadAll();
  };

  const handleDownloadApp = () => {
    window.dispatchEvent(new CustomEvent('trigger-install-prompt-modal'));
  };

  // Combine standard and matching active targeted notifications
  const standardNotifications = Database.getNotifications(user.id);
  const matchedTargetedNotifications = Database.getTargetedNotifications()
    .filter(tn => new Date(tn.expiryAt).getTime() > Date.now())
    .filter(tn => evaluateUserTarget(user, Database.getOrders().filter(o => o.userId === user.id), tn.targetType, tn.targetValue));

  const combinedNotifications = [
    ...standardNotifications,
    ...matchedTargetedNotifications.map(tn => ({
      id: tn.id,
      userId: user.id,
      title: `📢 ${tn.title}`,
      message: tn.message,
      createdAt: tn.createdAt,
      isRead: false
    }))
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const totalUnreadNotifications = standardNotifications.filter(n => !n.isRead).length + matchedTargetedNotifications.length;

  // Request native Web Notification permissions and send background system alerts
  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'default') {
        try {
          Notification.requestPermission().catch(() => {});
        } catch (e) {
          console.warn("Notification.requestPermission blocked:", e);
        }
      }
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window) || Notification.permission !== 'granted') return;
    if (combinedNotifications.length === 0) return;

    // Get the latest notification
    const latestNotif = combinedNotifications[0];
    
    // Check if we have already shown a native browser notification for this specific ID in this device session/local storage
    const shownNotifsStr = localStorage.getItem('amrwh_shown_system_notifications');
    const shownNotifIds: string[] = shownNotifsStr ? JSON.parse(shownNotifsStr) : [];

    if (!shownNotifIds.includes(latestNotif.id)) {
      try {
        const titleClean = latestNotif.title.replace(/📢|🎁/g, '').trim();
        const notificationOption = {
          body: latestNotif.message,
          icon: (latestNotif as any).image || 'https://img.icons8.com/color/192/000000/online-store.png',
          image: (latestNotif as any).image, // Full-banner native system image
          dir: 'rtl' as NotificationDirection,
          tag: latestNotif.id
        };
        const n = new Notification(`متجر أم روح 🌸 - ${titleClean}`, notificationOption);
        
        n.onclick = () => {
          window.focus();
          setShowNotificationDrawer(true);
        };

        // Add this notification to shown list so we don't display it again
        shownNotifIds.push(latestNotif.id);
        localStorage.setItem('amrwh_shown_system_notifications', JSON.stringify(shownNotifIds));
      } catch (err) {
        console.error('Failed to trigger background system notification:', err);
      }
    }
  }, [combinedNotifications, user.id]);

  return (
    <div className="bg-amber-50/10 dark:bg-gray-950 min-h-screen text-gray-900 dark:text-gray-100 transition duration-300" dir="rtl">
      
      {/* Admin Panel Overrides Default Tab View */}
      {isAdminUnlocked ? (
        <AdminPanel
          onClose={() => {
            setIsAdminUnlocked(false);
            setAdminRole(null);
            handleReloadAll();
          }}
          rates={rates}
          onRatesUpdate={(newRates) => {
            setRates(newRates);
            handleReloadAll();
          }}
          onAdvisorUpdate={(newAdvisor) => {
            setAdvisor(newAdvisor);
            handleReloadAll();
          }}
          onAdminCodeUpdate={(newCode) => {
            setAdminCode(newCode);
            handleReloadAll();
          }}
          adminCode={adminCode}
          adminRole={adminRole || 'full'}
        />
      ) : (
        /* Standard Customer Portal with custom single-page tabs */
        <div className="fixed inset-0 flex flex-col max-w-md mx-auto bg-amber-50/10 dark:bg-gray-950 overflow-hidden">
          {/* Offline Mode Alert Banner */}
          {!isOnline && (
            <div className="bg-gradient-to-r from-rose-600 to-amber-600 text-white text-center py-2 px-3.5 flex items-center justify-between shadow-sm z-50 shrink-0 text-[11.5px] font-bold border-b border-rose-700/20">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 bg-white rounded-full animate-ping shrink-0" />
                <span>أنتِ تتصفحين المتجر بدون إنترنت (تصفح أوفلاين) 🌸</span>
              </div>
              <button 
                onClick={triggerSync} 
                disabled={isSyncing}
                className="bg-white/20 hover:bg-white/30 text-white font-bold px-2 py-0.5 rounded-lg active:scale-95 transition flex items-center gap-1 shrink-0 text-[10px] cursor-pointer"
              >
                {isSyncing ? 'جاري التحديث...' : 'تحديث 🔄'}
              </button>
            </div>
          )}
          {/* Header branding logo section */}
          <div className="bg-white/95 dark:bg-gray-900/95 backdrop-blur-md px-4 py-4 border-b border-amber-100/40 dark:border-gray-800 shadow-sm flex justify-between items-center rounded-b-3xl shrink-0 z-50">
            {selectedProduct ? (
              <button
                onClick={() => window.history.back()}
                className="flex items-center gap-1 bg-amber-500/10 hover:bg-amber-500/15 text-amber-900 dark:text-amber-400 font-bold text-xs px-3 py-1.5 rounded-xl transition shadow-sm border border-amber-500/10 cursor-pointer"
              >
                <ArrowRight className="w-4 h-4" />
                <span>رجوع 🔙</span>
              </button>
            ) : selectedCategoryInTab && activeTab === 'categories' ? (
              <button
                onClick={() => window.history.back()}
                className="flex items-center gap-1 bg-amber-500/10 hover:bg-amber-500/15 text-amber-900 dark:text-amber-400 font-bold text-xs px-3 py-1.5 rounded-xl transition shadow-sm border border-amber-500/10 cursor-pointer"
              >
                <ArrowRight className="w-4 h-4" />
                <span>رجوع 🔙</span>
              </button>
            ) : (
              <div className="flex gap-1.5">
                {!isOnline && (
                  <span className="text-[10px] bg-rose-500/10 text-rose-700 dark:text-rose-400 font-black px-2.5 py-1.5 rounded-xl animate-pulse">
                    غير متصل 🔌
                  </span>
                )}
                <span className="text-[10px] bg-amber-500/10 text-amber-900 dark:text-amber-400 font-extrabold px-3 py-1.5 rounded-xl">
                  توصيل مجتمعي 🚚
                </span>
              </div>
            )}

            <div className="flex items-center gap-2">
              {/* Notification Bell Button */}
              <button
                id="header-notif-bell-btn"
                onClick={() => setShowNotificationDrawer(true)}
                title="الإشعارات"
                className="relative bg-amber-500 hover:bg-amber-600 active:scale-95 text-white p-2 rounded-xl shadow-md transition-all flex items-center justify-center cursor-pointer"
              >
                <Bell className="w-4 h-4" />
                {totalUnreadNotifications > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-600 text-white text-[8px] font-black w-4 h-4 rounded-full flex items-center justify-center border border-white dark:border-gray-900 animate-pulse">
                    {totalUnreadNotifications}
                  </span>
                )}
              </button>

              <button
                onClick={handleDownloadApp}
                title="تنزيل التطبيق"
                className="bg-amber-500 hover:bg-amber-600 active:scale-95 text-white p-2 rounded-xl shadow-md transition-all flex items-center justify-center cursor-pointer"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
              </button>
              <div className="text-right">
                <h1 className="text-xs sm:text-sm font-black text-amber-950 dark:text-amber-300 tracking-tight">
                  مَتْجَرُ أُمِّ رُوْح 🌸
                </h1>
                <p className="text-[9px] text-gray-400">منصتك للتسوق للأسر المنتجة باليمن</p>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto pt-2 pb-[88px] scrollbar-none scroll-smooth">
            <AnimatePresence mode="wait">
            {/* TAB 1: HOME CATALOG */}
            {activeTab === 'home' && (
              <motion.div
                key="home"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <HomeTab
                  user={user}
                  categories={categories}
                  products={shuffledProducts.length > 0 ? shuffledProducts : products}
                  rates={rates}
                  advisor={advisor}
                  offerImages={offerImages}
                  onSelectProduct={(p) => setSelectedProduct(p)}
                  onOpenAdvisorChat={() => setIsAdvisorChatOpen(true)}
                  tickerTexts={tickerTexts}
                />
              </motion.div>
            )}

            {/* TAB 2: CATEGORIES DISCOVERY SCREEN */}
            {activeTab === 'categories' && (
              <motion.div
                key="categories"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="max-w-md mx-auto px-4 pt-6 space-y-4 text-right"
                dir="rtl"
              >
                {!selectedCategoryInTab ? (
                  <>
                    <div className="border-b pb-2">
                      <h2 className="text-sm font-extrabold text-amber-950 dark:text-amber-300">أقسام وفئات المنتجات 📂</h2>
                      <p className="text-[10px] text-gray-400 mt-0.5">تصفحي تصنيفات معروضات متجر أم روح المميزة</p>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      {categories.map((cat) => (
                        <div
                          key={cat.id}
                          onClick={() => {
                            setSelectedCategoryInTab(cat);
                          }}
                          className="bg-white dark:bg-gray-900 rounded-3xl overflow-hidden shadow-sm hover:shadow-md border border-amber-100/20 cursor-pointer transition transform active:scale-98"
                        >
                          <img 
                            referrerPolicy="no-referrer"
                            src={getDirectImageUrl(cat.image)} 
                            alt={cat.name} 
                            className="w-full h-24 object-cover" 
                          />
                          <div className="p-3 text-center">
                            <h4 className="text-xs font-black text-amber-950 dark:text-amber-300">{cat.name}</h4>
                            <span className="text-[10px] text-gray-400 mt-0.5 inline-block">{cat.productCount || 0} صنف</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="space-y-4">
                    <div className="flex justify-between items-center border-b pb-2">
                      <div className="text-right">
                        <h2 className="text-sm font-extrabold text-amber-950 dark:text-amber-300">{selectedCategoryInTab.name}</h2>
                        <p className="text-[10px] text-gray-400 mt-0.5">تصفح المنتجات في هذا القسم</p>
                      </div>
                      <button
                        onClick={() => window.history.back()}
                        className="flex items-center gap-1.5 text-xs font-extrabold text-amber-800 dark:text-amber-400 bg-amber-500/10 hover:bg-amber-500/15 px-3 py-1.5 rounded-xl transition"
                      >
                        <span>رجوع للأقسام 🔙</span>
                      </button>
                    </div>

                    {(shuffledProducts.length > 0 ? shuffledProducts : products).filter(p => p.categoryId === selectedCategoryInTab.id || (p.subCategoryIds && p.subCategoryIds.includes(selectedCategoryInTab.id))).length === 0 ? (
                      <div className="text-center py-12 bg-white dark:bg-gray-900 rounded-3xl border text-xs text-gray-400 font-bold">
                        عذراً! لا توجد أصناف مضافة في هذه الفئة حالياً.
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-4">
                        {(shuffledProducts.length > 0 ? shuffledProducts : products)
                          .filter(p => p.categoryId === selectedCategoryInTab.id || (p.subCategoryIds && p.subCategoryIds.includes(selectedCategoryInTab.id)))
                          .map(prod => {
                            const convertedPrice = convertPrice(prod.priceYERNew, user.currency, rates);
                            const hasOffer = prod.isOnOffer && prod.offerPriceNew;
                            const convertedOfferPrice = hasOffer ? convertPrice(prod.offerPriceNew!, user.currency, rates) : undefined;

                            return (
                              <div
                                key={prod.id}
                                onClick={() => setSelectedProduct(prod)}
                                className="bg-white dark:bg-gray-900 rounded-3xl overflow-hidden shadow-sm hover:shadow-md border border-amber-100/20 dark:border-gray-800 flex flex-col cursor-pointer transition transform active:scale-98 text-right"
                              >
                                <div className="relative h-32 w-full bg-amber-50/30 overflow-hidden">
                                  <img
                                    referrerPolicy="no-referrer"
                                    src={getDirectImageUrl(prod.images[0])}
                                    alt={prod.name}
                                    className="w-full h-full object-cover transition duration-500 hover:scale-105"
                                  />
                                  {hasOffer && (
                                    <span className="absolute top-2.5 right-2.5 bg-red-500 text-white font-black text-[9px] px-2 py-1 rounded-lg flex items-center gap-0.5 shadow-sm">
                                      <Flame className="w-3 h-3 fill-white" />
                                      <span>تخفيض!</span>
                                    </span>
                                  )}
                                </div>

                                <div className="p-3.5 flex-1 flex flex-col justify-between space-y-2">
                                  <div className="space-y-1">
                                    <h4 className="text-xs font-extrabold text-gray-900 dark:text-white line-clamp-1 leading-snug">{prod.name}</h4>
                                  </div>

                                  <div className="flex flex-col items-baseline">
                                    {hasOffer ? (
                                      <>
                                        <span className="text-[10px] text-gray-400 line-through">
                                          {convertedPrice} {getCurrencyCode(user.currency)}
                                        </span>
                                        <span className="text-xs font-black text-amber-800 dark:text-amber-400">
                                          {convertedOfferPrice} {getCurrencyCode(user.currency)}
                                        </span>
                                      </>
                                    ) : (
                                      <span className="text-xs font-black text-amber-800 dark:text-amber-400">
                                        {convertedPrice} {getCurrencyCode(user.currency)}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                      </div>
                    )}
                  </div>
                )}
              </motion.div>
            )}

            {/* TAB 3: DISCOUNTS & OFFERS SCREEN */}
            {activeTab === 'offers' && (
              <motion.div
                key="offers"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="max-w-md mx-auto px-4 pt-6 space-y-5 text-right pb-24"
              >
                {/* Modern Pill Sub-Tabs Selector */}
                <div className="bg-gray-100 dark:bg-gray-800/80 p-1 rounded-2xl flex items-center justify-between w-full border border-gray-200/20">
                  <button
                    onClick={() => setOffersSubTab('archived')}
                    className={`flex-1 py-2.5 text-center text-xs font-extrabold rounded-xl transition-all duration-200 flex items-center justify-center gap-1.5 ${
                      offersSubTab === 'archived'
                        ? 'bg-white dark:bg-gray-900 text-amber-900 dark:text-amber-300 shadow-sm'
                        : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-400'
                    }`}
                  >
                    <span>ذكريات الفعاليات</span>
                    <span className="text-sm">🏆</span>
                  </button>
                  <button
                    onClick={() => setOffersSubTab('active')}
                    className={`flex-1 py-2.5 text-center text-xs font-extrabold rounded-xl transition-all duration-200 flex items-center justify-center gap-1.5 ${
                      offersSubTab === 'active'
                        ? 'bg-white dark:bg-gray-900 text-amber-900 dark:text-amber-300 shadow-sm'
                        : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-400'
                    }`}
                  >
                    <span>عروض اليوم الترويجية</span>
                    <span className="text-sm">%</span>
                  </button>
                </div>

                {offersSubTab === 'active' ? (
                  <div className="space-y-4">
                    <div className="border-b border-dashed border-amber-100 dark:border-gray-800 pb-2">
                      <h2 className="text-sm font-extrabold text-amber-950 dark:text-amber-300 flex items-center gap-1 justify-end">
                        <span>العروض الترويجية النشطة اليوم 🔥</span>
                        <Percent className="w-4.5 h-4.5 text-amber-500 animate-bounce" />
                      </h2>
                      <p className="text-[10px] text-gray-400 mt-0.5">تخفيضات ومزايا ترويجية لا تعوض على أفخر الموديلات والأدوات</p>
                    </div>

                    {products.filter(p => p.isOnOffer).length === 0 ? (
                      <div className="text-center py-12 text-gray-400 text-xs font-bold bg-white dark:bg-gray-900 rounded-[2rem] border border-dashed border-gray-200/40">
                        لا توجد عروض نشطة بالمتجر حالياً.
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-4">
                        {products.filter(p => p.isOnOffer).map(prod => {
                          const convertedPrice = convertPrice(prod.priceYERNew, user.currency, rates);
                          const convertedOfferPrice = prod.offerPriceNew ? convertPrice(prod.offerPriceNew, user.currency, rates) : undefined;

                          return (
                            <div
                              key={prod.id}
                              onClick={() => setSelectedProduct(prod)}
                              className="bg-white dark:bg-gray-900 rounded-3xl overflow-hidden shadow-sm hover:shadow-md border border-amber-100/20 cursor-pointer transition transform active:scale-98 flex flex-col justify-between"
                            >
                              <div className="relative h-28 bg-gray-50">
                                <img src={prod.images[0]} alt={prod.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                <span className="absolute top-2 right-2 bg-red-500 text-white font-black text-[9px] px-2 py-0.5 rounded-lg">
                                  خصم!
                                </span>
                              </div>

                              <div className="p-3 text-right space-y-1.5">
                                <h4 className="text-xs font-black text-gray-900 dark:text-white line-clamp-1">{prod.name}</h4>
                                
                                <div className="flex flex-col">
                                  <span className="text-[10px] text-gray-400 line-through">
                                    {convertedPrice} {getCurrencyCode(user.currency)}
                                  </span>
                                  <span className="text-xs font-black text-amber-800 dark:text-amber-400">
                                    {convertedOfferPrice} {getCurrencyCode(user.currency)}
                                  </span>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="border-b border-dashed border-amber-100 dark:border-gray-800 pb-2">
                      <h2 className="text-sm font-extrabold text-amber-950 dark:text-amber-300 flex items-center gap-1 justify-end">
                        <span>سجل ذكريات الفعاليات والمسابقات المنتهية 🏆✨</span>
                      </h2>
                      <p className="text-[10px] text-gray-400 mt-0.5">توثيق شفاف لأسماء الفائزات، مبالغ الجوائز، وصور استلام الهدايا بكل مصداقية</p>
                    </div>

                    {archivedEvents.length === 0 ? (
                      <div className="text-center py-16 text-gray-400 text-xs font-bold bg-white dark:bg-gray-900 rounded-[2rem] border border-dashed border-amber-100/30 p-6 flex flex-col items-center justify-center space-y-3">
                        <span className="text-3xl">🌸</span>
                        <p className="leading-relaxed">لا توجد مسابقات مؤرشفة حالياً. انتظروا مفاجآت وفعاليات متجر أم روح القادمة!</p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {archivedEvents.map(evt => {
                          const convertedPrize = convertPrice(evt.giftAmount, user.currency, rates);
                          return (
                            <div
                              key={evt.id}
                              className="bg-white dark:bg-gray-900 rounded-[2rem] p-5 shadow-sm border border-amber-100/40 dark:border-gray-850/50 space-y-4 relative overflow-hidden"
                            >
                              {/* Top accent badge */}
                              <div className="absolute top-0 left-0 bg-gradient-to-r from-amber-400 to-amber-500 text-amber-950 px-4 py-1 rounded-br-2xl text-[9px] font-black">
                                فعالية منتهية ✓
                              </div>

                              <div className="space-y-1 pt-1">
                                <h3 className="text-xs font-extrabold text-amber-950 dark:text-amber-200">
                                  {evt.name}
                                </h3>
                                <p className="text-[9.5px] text-gray-400 font-bold font-mono">
                                  📅 تاريخ الفعالية: {evt.date}
                                </p>
                              </div>

                              {/* Highlight box for Winner */}
                              <div className="bg-gradient-to-l from-amber-50/50 to-amber-100/10 dark:from-amber-950/20 dark:to-transparent p-3.5 rounded-2xl border-r-4 border-amber-500 space-y-1">
                                <div className="flex items-center justify-end gap-1 text-[11px] text-gray-500 dark:text-gray-400 font-bold">
                                  <span>الفائزة بالمركز الأول</span>
                                  <span className="text-amber-500">👑</span>
                                </div>
                                <div className="text-xs font-black text-amber-950 dark:text-amber-200">
                                  {evt.winnerName}
                                </div>
                                <div className="text-[10px] text-amber-800 dark:text-amber-400 font-black">
                                  🎁 مقدار الجائزة: {convertedPrize} {getCurrencyCode(user.currency)}
                                </div>
                              </div>

                              {/* Proof Image */}
                              {evt.deliveryProofImage && (
                                <div className="space-y-1.5">
                                  <div className="text-[10px] font-bold text-gray-400 flex items-center justify-end gap-1">
                                    <span>صورة إثبات تسليم الهدية والمصداقية</span>
                                    <span>📸</span>
                                  </div>
                                  <div className="relative rounded-2xl overflow-hidden border border-gray-100 dark:border-gray-800 h-44 bg-gray-50 dark:bg-gray-950">
                                    <img
                                      src={evt.deliveryProofImage}
                                      alt="إثبات التسليم"
                                      className="w-full h-full object-cover"
                                      referrerPolicy="no-referrer"
                                    />
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </motion.div>
            )}

            {/* TAB 4: SHOPPING CART */}
            {activeTab === 'cart' && (
              <motion.div
                key="cart"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <CartTab
                  user={user}
                  cartItems={cart}
                  rates={rates}
                  onUpdateQuantity={handleUpdateCartQuantity}
                  onRemoveItem={handleRemoveCartItem}
                  onClearCart={handleClearCart}
                  onSubmitOrder={handleSubmitOrder}
                  onChangeCurrency={(cur) => handleUpdateUser({ ...user, currency: cur })}
                />
              </motion.div>
            )}

            {/* TAB 5: MY PROFILE */}
            {activeTab === 'profile' && (
              <motion.div
                key="profile"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <ProfileTab
                  user={user}
                  onUpdateUser={handleUpdateUser}
                  onSubmitRecharge={handleSubmitRecharge}
                  onSubmitPhoneRequest={handleSubmitPhoneRequest}
                  adminCode={adminCode}
                  onUnlockAdmin={(role) => {
                    setIsAdminUnlocked(true);
                    setAdminRole(role);
                  }}
                  isDarkMode={isDarkMode}
                  setIsDarkMode={setIsDarkMode}
                  allProducts={products}
                  onSelectProduct={(p) => setSelectedProduct(p)}
                />
              </motion.div>
            )}
           </AnimatePresence>
          </div>

          {/* Bottom Tab Navigation bar */}
          <Navbar
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            cartCount={cart.reduce((acc, c) => acc + c.quantity, 0)}
            isEventActive={Database.getAdminSettings().isEventActive}
          />
        </div>
      )}

      {/* Full-Screen Product Details View Modal Overlay */}
      <AnimatePresence>
        {selectedProduct && (
          <ProductDetails
            product={selectedProduct}
            rates={rates}
            onBack={() => window.history.back()}
            onAddToCart={(product, quantity, selectedProperties, currency) => {
              const isSale = product.isOnOffer && product.offerPriceNew;
              const basePriceNew = isSale ? product.offerPriceNew! : product.priceYERNew;
              const finalPrice = convertPrice(basePriceNew, currency, rates);
              handleAddToCart({
                productId: product.id,
                productName: product.name,
                productCode: product.code,
                image: product.images[0] || '',
                selectedProperties,
                price: finalPrice,
                currency,
                quantity,
                totalPrice: finalPrice * quantity
              });
            }}
            allProducts={products}
            onSelectProduct={(p) => setSelectedProduct(p)}
            user={user}
            onToggleFavorite={handleToggleFavorite}
          />
        )}
      </AnimatePresence>

      {/* Floating Advisor "روح" Chatbot Drawer */}
      <AdvisorChatDrawer
        isOpen={isAdvisorChatOpen}
        onClose={() => setIsAdvisorChatOpen(false)}
        advisor={advisor}
        products={products}
        onSelectProduct={(p) => {
          setSelectedProduct(p);
          setIsAdvisorChatOpen(false);
        }}
      />

      {/* Notifications Drawer */}
      <NotificationsDrawer
        isOpen={showNotificationDrawer}
        onClose={() => setShowNotificationDrawer(false)}
        notifications={combinedNotifications}
        userId={user.id}
        onRefresh={handleReloadAll}
        onNotificationClick={(notif) => {
          if (notif.productId) {
            const foundProduct = products.find(p => p.id === notif.productId);
            if (foundProduct) {
              setSelectedProduct(foundProduct);
              setShowNotificationDrawer(false);
            }
          }
        }}
      />

      {/* PWA Auto-Install Prompt Modal */}
      <InstallPromptModal 
        deferredPrompt={deferredPrompt}
        onInstallSuccess={() => setDeferredPrompt(null)}
      />

      {/* Floating In-App Toast Notification */}
      <AnimatePresence>
        {activeToast && (
          <motion.div
            initial={{ opacity: 0, y: -50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            className="fixed top-20 left-4 right-4 z-[9999] max-w-sm mx-auto bg-white/95 dark:bg-gray-900/95 backdrop-blur-md border border-amber-500/25 rounded-2xl shadow-2xl p-4 text-right flex flex-row-reverse items-start gap-3 select-none cursor-pointer"
            dir="rtl"
            onClick={() => {
              if (activeToast.productId) {
                const foundProduct = products.find(p => p.id === activeToast.productId);
                if (foundProduct) {
                  setSelectedProduct(foundProduct);
                  setActiveToast(null);
                  return;
                }
              }
              setActiveToast(null);
              setShowNotificationDrawer(true);
            }}
          >
            {/* Bell Icon styled beautifully */}
            <div className="bg-amber-500/10 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400 p-2.5 rounded-xl shrink-0 animate-bounce">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
            </div>

            {/* Title and Message */}
            <div className="flex-1 space-y-1">
              <h4 className="text-xs font-black text-amber-950 dark:text-amber-300">
                {activeToast.title}
              </h4>
              <p className="text-[10px] text-gray-600 dark:text-gray-300 leading-relaxed font-semibold">
                {activeToast.message}
              </p>
            </div>

            {/* Dismiss button */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                setActiveToast(null);
              }}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-white p-1 rounded-lg transition"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Device Lock Overlay Modal */}
      <AnimatePresence>
        {isDeviceBlocked && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/95 backdrop-blur-xl z-[99999] flex items-center justify-center p-4"
            dir="rtl"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="bg-white dark:bg-gray-900 border border-red-500/20 rounded-3xl p-6 md:p-8 max-w-md w-full shadow-2xl text-right space-y-6"
            >
              <div className="flex flex-col items-center text-center space-y-3">
                <div className="bg-red-500/10 text-red-600 dark:text-red-400 p-4 rounded-full animate-pulse">
                  <ShieldAlert className="w-12 h-12" />
                </div>
                <h3 className="text-lg font-black text-gray-900 dark:text-white">
                  حماية وتأمين الحساب 🔐
                </h3>
                <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed font-semibold">
                  عذراً، رقم الهاتف <span className="text-red-600 dark:text-red-400 font-extrabold">{user.phone}</span> مسجل مسبقاً على جهاز آخر. لا يُسمح باستخدام نفس الحساب من أجهزة متعددة في آن واحد.
                </p>
              </div>

              <div className="border-t border-b border-gray-100 dark:border-gray-800 py-5 space-y-4">
                {isUnlockRequestPending ? (
                  <div className="bg-amber-500/5 border border-amber-500/10 p-4 rounded-2xl text-center space-y-3">
                    <span className="text-xs font-black text-amber-600 dark:text-amber-400 block animate-pulse">
                      طلبكِ قيد المراجعة لدى الإدارة ⏳
                    </span>
                    <p className="text-[10px] text-gray-500 dark:text-gray-400 leading-normal">
                      تم إرسال طلب إلغاء ربط جهازك القديم وتفعيل هذا الجهاز بنجاح. لتسريع عملية التفعيل من الإدارة، يرجى النقر أدناه لإرسال الطلب عبر واتساب.
                    </p>
                    <button
                      onClick={handleOpenWhatsappUnlock}
                      className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-extrabold text-xs py-2.5 px-4 rounded-xl shadow-md transition flex items-center justify-center gap-2"
                    >
                      <span>إرسال الطلب عبر واتساب 💬</span>
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider block">الخيار الأول: إلغاء ربط جهازي القديم</span>
                      <p className="text-[10px] text-gray-500 dark:text-gray-400">
                        إذا قمتِ بتغيير هاتفكِ وتريدين تفعيل هذا الجهاز الجديد بدلاً من القديم:
                      </p>
                      <button
                        onClick={handleRequestDeviceUnlock}
                        className="w-full bg-amber-500 hover:bg-amber-600 text-amber-950 font-black text-xs py-2.5 px-4 rounded-xl shadow-md transition"
                      >
                        إرسال طلب تفعيل جهازي الحالي 🔓
                      </button>
                    </div>

                    <div className="border-t border-gray-100 dark:border-gray-800 pt-4 space-y-2.5">
                      <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider block">الخيار الثاني: استخدام رقم هاتف آخر</span>
                      <div className="flex gap-2">
                        <input
                          type="tel"
                          placeholder="رقم هاتف جديد (9 أرقام)"
                          value={newPhoneInput}
                          onChange={(e) => {
                            setNewPhoneInput(e.target.value.replace(/\D/g, ''));
                            setChangePhoneError('');
                          }}
                          maxLength={9}
                          className="flex-1 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-xs text-right font-bold focus:outline-none focus:ring-2 focus:ring-amber-500 text-gray-900 dark:text-white"
                        />
                        <button
                          onClick={() => {
                            if (!/^\d{9}$/.test(newPhoneInput)) {
                              setChangePhoneError('رقم الهاتف يجب أن يتكون من 9 أرقام!');
                              return;
                            }
                            const updatedUser = {
                              ...user,
                              phone: newPhoneInput,
                              isRegistered: true
                            };
                            const savedUser = Database.saveUser(updatedUser);
                            setUser(savedUser);
                            setIsDeviceBlocked(false);
                            setNewPhoneInput('');
                            setChangePhoneError('');
                          }}
                          className="bg-gray-900 dark:bg-gray-700 text-white font-extrabold text-xs px-4 py-2 rounded-xl hover:bg-gray-800 transition"
                        >
                          تحديث رقمي
                        </button>
                      </div>
                      {changePhoneError && (
                        <p className="text-[9px] font-extrabold text-red-500 text-right">{changePhoneError}</p>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="text-center">
                <p className="text-[8px] font-black text-gray-400">
                  بصمة الجهاز الحالي: {localStorage.getItem('amrwh_device_id') || 'غير معرف'}
                </p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Welcome SplashScreen Overlay - Premium Transparent Rose Loading Screen */}
      <AnimatePresence>
        {showWelcome && (
          <motion.div
            initial={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 1.02 }}
            transition={{ duration: 0.5, ease: 'easeInOut' }}
            className="fixed inset-0 bg-rose-50/80 dark:bg-rose-950/80 backdrop-blur-lg z-[99999] flex flex-col items-center justify-center p-6 text-center select-none"
            dir="rtl"
          >
            <div className="flex flex-col items-center space-y-6 max-w-sm">
              {/* Premium Pulsing Rose Animation */}
              <div className="relative w-28 h-28 flex items-center justify-center">
                <div className="absolute inset-0 rounded-full bg-rose-400/20 animate-ping" />
                <div className="absolute inset-2 rounded-full border-2 border-rose-500/30 animate-pulse" />
                <div className="w-20 h-20 bg-gradient-to-br from-rose-400 to-rose-500 rounded-full flex items-center justify-center shadow-lg shadow-rose-500/30 text-3xl z-10 animate-bounce">
                  🌹
                </div>
              </div>
              <div className="space-y-2">
                <h2 className="text-lg font-black text-rose-950 dark:text-rose-200">
                  مرحباً بكِ في متجر أم روح 🌸🌹
                </h2>
                <p className="text-xs text-rose-900 dark:text-rose-300 leading-relaxed font-extrabold animate-pulse">
                  جاري تحميل أحدث المنتجات والفعاليات اللحظية من السحابة... ✨
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Account Recovery Dialog based on IP Detection */}
      <AnimatePresence>
        {suggestedRecoveryUser && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 dark:bg-black/80 backdrop-blur-sm z-[9999] flex items-center justify-center p-4"
            dir="rtl"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="bg-white dark:bg-gray-950 rounded-[2.5rem] p-6 shadow-2xl border border-amber-100/50 dark:border-gray-800 max-w-sm w-full text-center space-y-5"
            >
              <div className="w-14 h-14 bg-amber-500/10 text-amber-600 rounded-full flex items-center justify-center text-2xl mx-auto animate-bounce">
                🔓
              </div>
              
              <div className="space-y-2">
                <h3 className="text-sm font-black text-amber-950 dark:text-amber-200">
                  هل قمتِ بإعادة تثبيت التطبيق؟ 🌸
                </h3>
                <p className="text-[11.5px] text-gray-500 dark:text-gray-400 leading-relaxed font-medium">
                  لقد اكتشفنا حساباً مسجلاً مسبقاً باسمكِ من موقعكِ الحالي:
                  <strong className="block text-xs text-amber-600 my-1">
                    {suggestedRecoveryUser.name} ({suggestedRecoveryUser.phone})
                  </strong>
                  هل ترغبين باستعادة حسابكِ ومحفظتكِ الإلكترونية ونقاطكِ فوراً؟
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <button
                  onClick={() => {
                    // Recover account!
                    const restoredUser = {
                      ...suggestedRecoveryUser,
                      // update current deviceId to allow seamless work on this browser
                      deviceId: localStorage.getItem('amrwh_device_id') || suggestedRecoveryUser.deviceId
                    };
                    Database.saveUser(restoredUser);
                    setUser(restoredUser);
                    setSuggestedRecoveryUser(null);
                  }}
                  className="py-2.5 bg-amber-500 hover:bg-amber-600 text-white font-extrabold text-[11px] rounded-2xl shadow transition"
                >
                  نعم، استعادة حسابي ✅
                </button>
                <button
                  onClick={() => {
                    setSuggestedRecoveryUser(null);
                  }}
                  className="py-2.5 bg-gray-100 dark:bg-gray-850 hover:bg-gray-200 text-gray-500 dark:text-gray-400 font-extrabold text-[11px] rounded-2xl transition"
                >
                  لا، إنشاء حساب جديد
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Interactive Voter Referral Modal (Deep Linking) */}
      <AnimatePresence>
        {voterReferral && (() => {
          const modalDeviceId = localStorage.getItem('amrwh_device_id') || 'DEV-MOCK';
          const modalAllUsers = Database.getAllUsers();
          const isVoterRegistered = user.isRegistered || (user.phone && user.name && !user.name.startsWith('عميل_جديد_')) || modalAllUsers.some(u => (u.deviceId === modalDeviceId || u.phone === user.phone) && u.isRegistered);

          const handleVoteAndRegister = async () => {
            const finalVoterName = isVoterRegistered ? user.name : voterInputName.trim();
            const finalVoterPhone = isVoterRegistered ? user.phone : voterInputPhone.trim();

            if (!isVoterRegistered && (!finalVoterName || !finalVoterPhone)) {
              showToast('⚠️ يرجى تعبئة الاسم ورقم الهاتف للمشاركة بالتصويت!');
              return;
            }

            // Cast vote: green if registered, red if new
            const voteType = isVoterRegistered ? 'green' : 'red';

            // TASK 1: Save voter's real-name profile if they are new
            let savedUserObj = user;
            if (!isVoterRegistered) {
              try {
                const updatedUser = {
                  ...user,
                  name: finalVoterName,
                  phone: finalVoterPhone,
                  isRegistered: true,
                  deviceId: modalDeviceId
                };
                setUser(updatedUser);
                savedUserObj = Database.saveUser(updatedUser);
              } catch (err) {
                console.error("Voter registration/saving failed:", err);
              }
            }

            // TASK 2: Cast the vote in database
            let voteRes: { success: boolean; error?: string } = { success: false, error: 'خطأ غير متوقع في قاعدة البيانات' };
            try {
              voteRes = Database.voteForContestant(voterReferral.id, finalVoterName, modalDeviceId, voteType);
            } catch (err: any) {
              console.error("Casting vote failed:", err);
              voteRes = { success: false, error: err.message || 'فشل الاتصال بالخادم للتصويت' };
            }

            // TASK 3: Register this voter as a contestant so they get their own unique voting board
            try {
              const contestants = Database.getContestants();
              const isAlreadyContestant = contestants.some(c => c.phone === finalVoterPhone || c.id === savedUserObj.id);
              if (!isAlreadyContestant) {
                Database.addContestant(finalVoterName, finalVoterPhone, savedUserObj.id, savedUserObj.id);
              }
            } catch (err) {
              console.error("Adding voter as contestant failed:", err);
            }

            // TASK 4: Trigger PWA install in background (with async try-catch to ensure zero thread-blocking)
            if (deferredPrompt) {
              setTimeout(() => {
                try {
                  deferredPrompt.prompt();
                } catch (err) {
                  console.warn("Deferred PWA install prompt failed (Safe Catch):", err);
                }
              }, 100);
            }

            // TASK 5: Trigger immediate in-app / push notification to the friend (contestant)
            try {
              Database.addNotification({
                id: 'NOTIF_VOTE_' + Date.now(),
                userId: voterReferral.userId || voterReferral.id,
                title: 'قام صديقك بدعمك والتصويت لك بنجاح! 🚀',
                message: `قام صديقك ${finalVoterName} بدعمك والتصويت لك بنجاح! 🚀`,
                createdAt: new Date().toISOString(),
                isRead: false
              });
            } catch (err) {
              console.warn("Friend notification trigger failed (Safe Catch):", err);
            }

            // Feedbacks
            if (voteRes.success) {
              showToast(`✓ تم تسجيل مشاركتك وتصويتك لصديقتك ${voterReferral.name} بنجاح! 🏆🌸`);
            } else {
              showToast(voteRes.error || `مرحباً بكِ! تم ربط حسابك وتفعيل مسابقة التصويت بنجاح! 🌸`);
            }

            // Transition to success state and show link inside modal
            setHasVotedReferral(true);
            localStorage.setItem('amrwh_referral_completed_or_skipped', 'true');
          };

          const handleCloseReferralModal = () => {
            // Dropout Tracking: If new user and closed without voting
            if (!hasVotedReferral && !isVoterRegistered) {
              try {
                // Ensure they get their 9-digit default ID preserved and saved in local and cloud db
                Database.saveUser(user);
              } catch (err) {
                console.error("Failed to persist default user on dropout:", err);
              }
            }
            localStorage.setItem('amrwh_referral_completed_or_skipped', 'true');
            setVoterReferral(null);
            setHasVotedReferral(false);
          };

          const sharedName = isVoterRegistered ? user.name : voterInputName.trim() || 'متسابق';
          const sharedPhone = isVoterRegistered ? user.phone : voterInputPhone.trim() || 'هاتف';
          const myShareUrl = `${window.location.origin}/?referrer_name=${encodeURIComponent(sharedName)}&referrer_phone=${encodeURIComponent(sharedPhone)}`;

          return (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/65 dark:bg-black/85 backdrop-blur-sm z-[99999] flex items-center justify-center p-4 text-right"
              dir="rtl"
            >
              <motion.div
                initial={{ scale: 0.9, y: 30 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.9, y: 30 }}
                className="bg-white dark:bg-gray-900 rounded-[2.5rem] p-6 shadow-2xl border border-amber-500/20 max-w-sm w-full space-y-5 relative overflow-hidden"
              >
                {/* Top ambient glow */}
                <div className="absolute top-0 inset-x-0 h-2 bg-gradient-to-l from-emerald-500 via-amber-500 to-rose-500" />
                
                {/* Close Button X */}
                <button
                  onClick={handleCloseReferralModal}
                  className="absolute top-4 left-4 w-7 h-7 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 rounded-full flex items-center justify-center text-xs font-bold transition z-10"
                >
                  ✕
                </button>

                <div className="text-center space-y-3">
                  <div className="w-16 h-16 bg-gradient-to-br from-amber-400 to-amber-500 rounded-full flex items-center justify-center text-3xl mx-auto shadow-lg shadow-amber-500/20 animate-bounce">
                    🏆
                  </div>
                  <h3 className="text-sm font-black text-amber-950 dark:text-amber-300">
                    مرحباً بكِ في فعاليات متجر أم روح الكبرى! 🌸✨
                  </h3>
                  <p className="text-[11.5px] text-gray-500 dark:text-gray-400 leading-relaxed font-bold">
                    صديقتكِ <span className="text-amber-600 dark:text-amber-400 font-black">"{voterReferral.name}"</span> تدعوكِ لتسجيل تصويتكِ وتأييدكِ لها للفوز بمسابقة المتجر النشطة!
                  </p>
                </div>

                {hasVotedReferral ? (
                  <div className="space-y-4">
                    <div className="bg-emerald-50 dark:bg-emerald-950/20 p-4 rounded-2xl border border-emerald-100 dark:border-emerald-900/30 text-center text-xs font-black text-emerald-800 dark:text-emerald-400">
                      ✓ تم تسجيل صوتكِ ومشاركتكِ في المسابقة بنجاح! 🌸🏆
                    </div>

                    {/* Unique Referral Link Presentation */}
                    <div className="bg-amber-50/50 dark:bg-amber-950/10 p-4 rounded-2xl border border-amber-500/10 space-y-3">
                      <h4 className="text-xs font-black text-amber-900 dark:text-amber-300">
                        🏆 رابط التصويت والمساندة الفريد الخاص بكِ:
                      </h4>
                      <p className="text-[10px] text-gray-400 dark:text-gray-500 leading-relaxed font-semibold">
                        انشري الرابط أدناه لصديقاتكِ لجمع الأصوات والمنافسة بقوة في فعاليات الفوز بالجوائز القيمة! 🚀✨
                      </p>
                      <div className="flex items-center gap-2 bg-white dark:bg-gray-850 p-2.5 rounded-xl border border-gray-100 dark:border-gray-800">
                        <span className="flex-1 truncate text-[10px] text-gray-500 font-mono text-left" dir="ltr">
                          {myShareUrl}
                        </span>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(myShareUrl);
                            showToast('✓ تم نسخ رابط دعوتكِ بنجاح! انطلقي الآن وانشريه 🚀🌸');
                          }}
                          className="bg-amber-600 hover:bg-amber-700 text-white px-3 py-1.5 rounded-lg text-[10px] font-black transition shrink-0 animate-pulse"
                        >
                          نسخ الرابط 📋
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {isVoterRegistered ? (
                      <div className="bg-amber-50 dark:bg-amber-950/20 p-3.5 rounded-2xl border border-amber-200/50 text-right text-xs font-bold text-amber-900 dark:text-amber-300">
                        دعاك صديقك <span className="font-black text-amber-600 dark:text-amber-400">"{voterReferral.name}"</span> إلى المشاركة في المسابقة. أنت مسجل بالفعل في المتجر ✨
                      </div>
                    ) : (
                      <div className="space-y-3 bg-gray-50 dark:bg-gray-950/30 p-4 rounded-2xl border border-gray-100 dark:border-gray-800">
                        <div className="text-right">
                          <label className="text-[11px] font-black text-gray-500 dark:text-gray-400 mb-1 block">الاسم الحقيقي بالكامل (إجباري)</label>
                          <input
                            type="text"
                            placeholder="مثال: منى الأهدل..."
                            value={voterInputName}
                            onChange={(e) => setVoterInputName(e.target.value)}
                            className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-750 rounded-xl px-3 py-2.5 text-xs font-bold text-gray-900 dark:text-white focus:outline-none focus:border-amber-500"
                          />
                        </div>
                        <div className="text-right">
                          <label className="text-[11px] font-black text-gray-500 dark:text-gray-400 mb-1 block">رقم الهاتف الحقيقي (إجباري)</label>
                          <input
                            type="tel"
                            placeholder="مثال: 771234567..."
                            value={voterInputPhone}
                            onChange={(e) => setVoterInputPhone(e.target.value)}
                            className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-750 rounded-xl px-3 py-2.5 text-xs font-mono font-bold text-gray-900 dark:text-white text-right focus:outline-none focus:border-amber-500"
                          />
                        </div>
                      </div>
                    )}

                    <button
                      onClick={handleVoteAndRegister}
                      disabled={!isVoterRegistered && (!voterInputName.trim() || !voterInputPhone.trim())}
                      className={`w-full py-3.5 rounded-2xl font-black text-xs shadow-lg transition flex items-center justify-center gap-1.5 ${
                        (!isVoterRegistered && (!voterInputName.trim() || !voterInputPhone.trim()))
                          ? 'bg-gray-300 text-gray-500 cursor-not-allowed dark:bg-gray-800 dark:text-gray-600 shadow-none'
                          : 'bg-gradient-to-l from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white shadow-emerald-500/10'
                      }`}
                    >
                      <span>المشاركة والتصويت 🏆</span>
                    </button>
                  </div>
                )}

                <div className="flex flex-col gap-2 border-t border-dashed border-gray-100 dark:border-gray-800 pt-3">
                  <button
                    onClick={handleCloseReferralModal}
                    className="w-full py-2.5 bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/20 dark:hover:bg-amber-950/35 text-amber-800 dark:text-amber-400 font-black text-xs rounded-xl transition shadow-sm text-center"
                  >
                    إغلاق وتصفح المتجر 🌸
                  </button>
                </div>
              </motion.div>
            </motion.div>
          );
        })()}
      </AnimatePresence>
    </div>
  );
}
