/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  User as UserIcon, 
  MapPin, 
  Phone, 
  Coins, 
  Settings, 
  Moon, 
  Sun, 
  Upload, 
  Check, 
  AlertCircle, 
  Gift, 
  Lock, 
  LogOut,
  Sparkles,
  DollarSign
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { User, Currency, RechargeRequest, Product, Contestant } from '../types';
import { getCurrencySymbol, getCurrencyCode, showSystemNotification, getWhatsAppLink } from '../utils';
import { Database } from '../Database';
import { initAuth, googleSignIn, logout as googleLogout, uploadFileToDrive } from '../googleAuth';
import { User as FirebaseUser } from 'firebase/auth';
import { UnauthorizedDomainModal } from './UnauthorizedDomainModal';

interface ProfileTabProps {
  user: User;
  onUpdateUser: (updatedUser: User) => void;
  onSubmitRecharge: (rechargeData: Omit<RechargeRequest, 'id' | 'userId' | 'userName' | 'userPhone' | 'createdAt' | 'status'>) => void;
  onSubmitPhoneRequest: (oldPhone: string, newPhone: string, newName?: string) => void;
  adminCode: string;
  onUnlockAdmin: (role: 'full' | 'worker') => void;
  isDarkMode: boolean;
  setIsDarkMode: (isDark: boolean) => void;
  allProducts: Product[];
  onSelectProduct: (product: Product) => void;
}

export default function ProfileTab({
  user,
  onUpdateUser,
  onSubmitRecharge,
  onSubmitPhoneRequest,
  adminCode,
  onUnlockAdmin,
  isDarkMode,
  setIsDarkMode,
  allProducts,
  onSelectProduct
}: ProfileTabProps) {
  // Mode control state
  const [activeSubTab, setActiveSubTab] = useState<'info' | 'recharge' | 'gifts' | 'favorites'>('info');

  // Edit fields
  const [name, setName] = useState(user.name);
  const [phone, setPhone] = useState(user.phone);
  const [address, setAddress] = useState(user.address);
  const [currency, setCurrency] = useState<Currency>(user.currency);
  const [isSavedAlert, setIsSavedAlert] = useState(false);
  const [profileError, setProfileError] = useState('');

  // Sync state fields with user prop changes
  useEffect(() => {
    setName(user.name);
    setPhone(user.phone);
    setAddress(user.address);
    setCurrency(user.currency);
  }, [user.name, user.phone, user.address, user.currency]);

  // Contestant states and auto-join registration logic
  const [contestants, setContestants] = useState<Contestant[]>(() => Database.getContestants());
  const [copiedLink, setCopiedLink] = useState(false);

  useEffect(() => {
    if (user.isRegistered && user.name && user.phone) {
      const list = Database.getContestants();
      const alreadyIn = list.some(c => c.id === user.id || c.phone === user.phone);
      if (!alreadyIn) {
        Database.addContestant(user.name, user.phone, user.id, user.id);
        setContestants(Database.getContestants());
      }
    }
  }, [user]);

  const myContestantProfile = contestants.find(c => c.id === user.id);
  const myReferralLink = typeof window !== 'undefined' 
    ? `${window.location.origin}/?referrer_name=${encodeURIComponent(user.name)}&referrer_phone=${encodeURIComponent(user.phone)}` 
    : '';

  const handleCopyLink = () => {
    navigator.clipboard.writeText(myReferralLink);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleShareWhatsApp = () => {
    const text = `صديقاتي الغاليات 🌸 أشارك في مسابقة متجر أم روح الكبرى 🏆 أدعوكن للتصويت لي وتأييدي عبر هذا الرابط المباشر لتسجيل صوتكن وتأكيد فوزي: \n${myReferralLink}`;
    const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  };

  // Google Auth & Drive States
  const [googleUser, setGoogleUser] = useState<FirebaseUser | null>(null);
  const [googleToken, setGoogleToken] = useState<string | null>(null);
  const [isUploadingToDrive, setIsUploadingToDrive] = useState(false);
  const [testDriveLink, setTestDriveLink] = useState('');
  const [showDomainModal, setShowDomainModal] = useState(false);
  const [authErrorType, setAuthErrorType] = useState<'unauthorized-domain' | 'network-request-failed'>('unauthorized-domain');

  const [permission, setPermission] = useState<string>(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      return Notification.permission;
    }
    return 'default';
  });

  const handleRequestPermission = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      alert('متصفحكِ لا يدعم إشعارات النظام الحيوية.');
      return;
    }
    try {
      const res = await Notification.requestPermission();
      setPermission(res);
      if (res === 'granted') {
        showSystemNotification(
          '🌸 تم تفعيل تنبيهات الهاتف بنجاح!',
          'مرحباً بكِ في عالم متجر أم روح الذكي! ستصلكِ العروض وتحديثات الرصيد على شاشتكِ مباشرة الآن! 🥰🛍️'
        );
      }
    } catch (err) {
      console.error('Permission request failed:', err);
    }
  };

  const handleSendTestNotification = () => {
    showSystemNotification(
      '🌸 تجربة التنبيهات من متجر أم روح',
      'يا أهلاً بكِ يا عزيزتي! هذا إشعار تجريبي منبثق يؤكد أن هاتفكِ متصل بنجاح وسيتلقى عروض أم روح الحصرية في خلفية النظام! 🥳✨'
    );
  };

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
      setTestDriveLink('');
    } catch (err) {
      console.error('Google Logout failed:', err);
    }
  };

  const handleTestDriveUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingToDrive(true);
    try {
      const driveUrl = await uploadFileToDrive(file, `test_receipt_${Date.now()}_${file.name}`);
      setTestDriveLink(driveUrl);
    } catch (err: any) {
      alert(err.message || 'فشل الرفع إلى جوجل درايف.');
    } finally {
      setIsUploadingToDrive(false);
    }
  };

  // Phone/Name change request fields
  const [showPhoneModal, setShowPhoneModal] = useState(false);
  const [newPhone, setNewPhone] = useState(user.phone);
  const [newName, setNewName] = useState(user.name);
  const [phoneAlert, setPhoneAlert] = useState('');
  const [phoneSuccess, setPhoneSuccess] = useState(false);

  // Balance Recharge form fields
  const [senderName, setSenderName] = useState('');
  const [senderAccount, setSenderAccount] = useState('');
  const [rechargeAmount, setRechargeAmount] = useState<number>(0);
  const [rechargeCurrency, setRechargeCurrency] = useState<Currency>(user.currency || 'YER_NEW');
  const [receiptImage, setReceiptImage] = useState<string>('');
  const [isUploading, setIsUploading] = useState(false);
  const [rechargeTransferType, setRechargeTransferType] = useState<'kuraimi' | 'najm'>('kuraimi');

  useEffect(() => {
    if (user.currency) {
      setRechargeCurrency(user.currency);
    }
  }, [user.currency]);

  const adminSettings = Database.getAdminSettings();
  const bankAccounts = adminSettings.bankAccounts || [
    { currency: 'YER_NEW', bankName: 'الكريمي المميز (ريال يمني جديد)', accountNumber: '967739563915', accountName: 'متجر أم روح' },
    { currency: 'YER_OLD', bankName: 'الكريمي المميز (ريال يمني قديم)', accountNumber: '967739563915', accountName: 'متجر أم روح' },
    { currency: 'SAR', bankName: 'الكريمي المميز (ريال سعودي)', accountNumber: '967739563915', accountName: 'متجر أم روح' }
  ];
  const activeBank = bankAccounts.find(b => b.currency === user.currency) || bankAccounts[0];
  const [rechargeSuccess, setRechargeSuccess] = useState(false);
  const [rechargeError, setRechargeError] = useState('');

  // Admin secret password unlock states
  const [clickCount, setClickCount] = useState(0);
  const [showAdminPasswordModal, setShowAdminPasswordModal] = useState(false);
  const [enteredPassword, setEnteredPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');

  const handleProfileSave = (e: React.FormEvent) => {
    e.preventDefault();
    setProfileError('');

    let trimmedName = name.trim();
    let trimmedPhone = phone.trim();

    if (!user.isRegistered) {
      if (!trimmedName || trimmedName.startsWith('عميل_جديد_')) {
        setProfileError('يرجى إدخال اسمكِ الحقيقي الكامل لتفعيل الحساب.');
        return;
      }
      if (!/^\d{9}$/.test(trimmedPhone)) {
        setProfileError('رقم الهاتف الحقيقي يجب أن يتكون من 9 أرقام!');
        return;
      }
    } else {
      trimmedName = user.name;
      trimmedPhone = user.phone;
    }

    onUpdateUser({
      ...user,
      name: trimmedName,
      phone: trimmedPhone,
      address,
      currency,
      isRegistered: true
    });

    setIsSavedAlert(true);
    setTimeout(() => setIsSavedAlert(false), 2500);
  };

  const handlePhoneRequestSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPhoneAlert('');
    const trimmedPhone = newPhone.trim();
    const trimmedName = newName.trim();
    if (!trimmedPhone && !trimmedName) {
      setPhoneAlert('يرجى كتابة الاسم المقترح أو رقم الهاتف المقترح.');
      return;
    }
    if (trimmedPhone === user.phone && trimmedName === user.name) {
      setPhoneAlert('البيانات المقترحة مطابقة للبيانات الحالية تماماً.');
      return;
    }
    onSubmitPhoneRequest(user.phone, trimmedPhone, trimmedName);
    setPhoneSuccess(true);
    setTimeout(() => {
      setPhoneSuccess(false);
      setShowPhoneModal(false);
    }, 3000);
  };

  const handleRechargeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setRechargeError('');
    
    if (!senderName.trim()) {
      setRechargeError('يرجى تحديد اسم المرسل.');
      return;
    }
    if (!senderAccount.trim()) {
      setRechargeError(rechargeTransferType === 'kuraimi' ? 'يرجى كتابة رقم الحساب الكريمي.' : 'يرجى كتابة رقم مرجع حوالة النجم.');
      return;
    }
    if (rechargeAmount <= 0) {
      setRechargeError('يرجى تحديد مبلغ إرسال صحيح أكبر من الصفر.');
      return;
    }

    onSubmitRecharge({
      senderName,
      senderAccount: rechargeTransferType === 'kuraimi' ? `كريمي: ${senderAccount}` : `نجم: ${senderAccount}`,
      amount: rechargeAmount,
      currency: rechargeCurrency,
      receiptImage: 'sent_via_whatsapp'
    });

    setRechargeSuccess(true);
    setSenderName('');
    setSenderAccount('');
    setRechargeAmount(0);
    setReceiptImage('');
    
    setTimeout(() => setRechargeSuccess(false), 3500);
  };

  const handleSendToWhatsAppOptional = () => {
    setRechargeError('');
    if (!senderName.trim()) {
      setRechargeError('يرجى تحديد اسم المرسل أولاً لإنشاء رسالة واتساب.');
      return;
    }
    if (!senderAccount.trim()) {
      setRechargeError(rechargeTransferType === 'kuraimi' ? 'يرجى كتابة رقم حساب الكريمي أولاً لإنشاء رسالة واتساب.' : 'يرجى كتابة رقم مرجع حوالة النجم أولاً لإنشاء رسالة واتساب.');
      return;
    }
    if (rechargeAmount <= 0) {
      setRechargeError('يرجى تحديد مبلغ إرسال صحيح أكبر من الصفر لإنشاء رسالة واتساب.');
      return;
    }

    const transferDetailsText = rechargeTransferType === 'kuraimi'
      ? `🏦 *رقم حساب الكريمي (أو رقم الحوالة):* ${senderAccount}`
      : `⭐ *رقم مرجع حوالة النجم:* ${senderAccount}\n👤 *مستلم حوالات النجم المعتمد:* ${adminSettings.najmReceiverName || 'روح أحمد علي'}`;

    const curLabels = { YER_NEW: 'ريال يمني جديد', YER_OLD: 'ريال يمني قديم', SAR: 'ريال سعودي' };
    const curLabel = curLabels[rechargeCurrency] || 'ريال يمني جديد';

    const messageText = `🌸 *طلب شحن رصيد جديد في متجر أم روح* 🌸

👤 *صاحب الحساب:* ${user.name}
📞 *رقم هاتف الحساب:* ${user.phone}

👤 *الاسم للمرسل المحول:* ${senderName}
${transferDetailsText}
💰 *المبلغ المطلوب شحنه:* ${rechargeAmount} ${curLabel}

---
📎 *مرفق صورة سند الحوالة أو إشعار السداد مع هذه الرسالة (اختياري)* 🌸✨`;

    const cleanPhone = adminSettings.whatsappNumber || '967739563915';
    const waUrl = getWhatsAppLink(cleanPhone, messageText);
    window.open(waUrl, '_blank');
  };

  // Handle secret 3-clicks unlock
  const handleFooterClick = () => {
    const nextCount = clickCount + 1;
    setClickCount(nextCount);
    if (nextCount >= 3) {
      setClickCount(0); // reset
      setShowAdminPasswordModal(true);
    }
  };

  const handleAdminVerify = (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError('');
    const entered = enteredPassword.trim();
    const mainCode = adminCode.trim();
    const workerCode = Database.getWorkerCode().trim();

    if (entered === mainCode) {
      onUnlockAdmin('full');
      setShowAdminPasswordModal(false);
      setEnteredPassword('');
    } else if (entered === workerCode) {
      onUnlockAdmin('worker');
      setShowAdminPasswordModal(false);
      setEnteredPassword('');
    } else {
      setPasswordError('رمز الدخول غير صحيح! جربي مرة أخرى.');
    }
  };

  return (
    <div className="bg-amber-50/20 dark:bg-gray-950 min-h-screen pb-32 pt-5 px-4">
      <div className="max-w-md mx-auto space-y-5">
        {/* Profile Card Header */}
        <div className="bg-white dark:bg-gray-900 rounded-3xl p-5 shadow-sm border border-amber-100/40 dark:border-gray-800 flex flex-col gap-4">
          <div className="flex justify-between items-center gap-3 w-full">
            <div className="flex items-center gap-3 text-right">
              <div className="bg-amber-500 text-white p-3 rounded-full shadow-md">
                <UserIcon className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-sm font-extrabold text-amber-950 dark:text-amber-300">{user.name}</h2>
                  <span className="bg-amber-600 text-white px-3 py-1 rounded-full text-[11px] font-black flex items-center gap-1 shadow-sm">
                    <span>💳</span>
                    <span>الرصيد المشحون: {user.balance} ريال يمني جديد</span>
                  </span>
                </div>
                {user.isRegistered && Database.getAdminSettings().isEventActive && (
                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    <div className="bg-emerald-50 dark:bg-emerald-950/25 px-2 py-0.5 rounded-lg border border-emerald-100 dark:border-emerald-900/30 flex items-center gap-1 text-[10px] font-bold text-emerald-800 dark:text-emerald-400">
                      <span>صوت سابق:</span>
                      <span className="font-mono text-xs font-black">{myContestantProfile?.greenVotes || 0}</span>
                    </div>
                    <div className="bg-rose-50 dark:bg-rose-950/25 px-2 py-0.5 rounded-lg border border-rose-100 dark:border-rose-900/30 flex items-center gap-1 text-[10px] font-bold text-rose-800 dark:text-rose-400">
                      <span>صوت جديد:</span>
                      <span className="font-mono text-xs font-black">{myContestantProfile?.redVotes || 0}</span>
                    </div>
                  </div>
                )}
                <div className="mt-1.5 flex flex-col gap-1">
                  <span className="text-[11px] font-extrabold text-amber-700 dark:text-amber-400">
                    🎁 مبلغ الهدايا: {user.giftBalance || 0} ريال يمني جديد
                  </span>
                  <span className="text-[10px] text-gray-400 bg-gray-50 dark:bg-gray-800 px-2 py-0.5 rounded-md font-semibold inline-block self-start mt-0.5" dir="ltr">
                    {user.phone}
                  </span>
                </div>
              </div>
            </div>

            {/* Dark Mode switcher */}
            <button
              id="darkmode-toggle"
              onClick={() => setIsDarkMode(!isDarkMode)}
              className="p-2.5 bg-amber-50 dark:bg-gray-800 hover:bg-amber-100 dark:hover:bg-gray-700 text-amber-900 dark:text-amber-400 rounded-2xl shadow-sm transition shrink-0"
            >
              {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>
          </div>

          {/* Voting / Contestant compact isolated block (Only shown if user is registered and event is active) */}
          {user.isRegistered && Database.getAdminSettings().isEventActive && (
            <div className="border-t border-dashed border-gray-100 dark:border-gray-800 pt-3.5 space-y-3">
              {/* Micro layout headers */}
              <div className="flex items-center justify-between">
                <span className="text-[10.5px] font-extrabold text-amber-950 dark:text-amber-300 flex items-center gap-1">
                  <span>🏆</span>
                  <span>رابط التصويت والمساندة الفريد الخاص بكِ</span>
                </span>
              </div>

              {/* Compact referral inputs */}
              <div className="flex items-center gap-2">
                <div className="flex-1 bg-gray-50 dark:bg-gray-850 p-2 rounded-xl border border-gray-100 dark:border-gray-850 flex items-center justify-between text-[10px] font-mono text-gray-500 overflow-hidden" dir="ltr">
                  <span className="truncate max-w-[210px] select-all">{myReferralLink}</span>
                  <button
                    onClick={handleCopyLink}
                    className="text-amber-700 dark:text-amber-400 hover:text-amber-900 dark:hover:text-amber-300 font-extrabold shrink-0 mr-1.5 transition text-[9.5px]"
                  >
                    {copiedLink ? '✓ تم النسخ' : 'نسخ 📋'}
                  </button>
                </div>
                
                <button
                  onClick={handleShareWhatsApp}
                  className="bg-emerald-500 hover:bg-emerald-600 text-white font-black text-[10px] px-3 py-2 rounded-xl shadow-md transition shrink-0 flex items-center gap-1"
                >
                  <span>واتساب</span>
                  <span>💬</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Mini Tab Selectors */}
        <div className="bg-white dark:bg-gray-900 rounded-3xl p-1.5 shadow-sm border border-amber-100/40 dark:border-gray-800 grid grid-cols-4 gap-1">
          <button
            id="subtab-profile-info"
            onClick={() => setActiveSubTab('info')}
            className={`py-1 text-[10.5px] text-center font-bold rounded-2xl transition ${
              activeSubTab === 'info' 
                ? 'bg-amber-500 text-white shadow' 
                : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50'
            }`}
          >
            بياناتي
          </button>
          <button
            id="subtab-profile-recharge"
            onClick={() => setActiveSubTab('recharge')}
            className={`py-1 text-[10.5px] text-center font-bold rounded-2xl transition ${
              activeSubTab === 'recharge' 
                ? 'bg-amber-500 text-white shadow' 
                : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50'
            }`}
          >
            الشحن
          </button>
          <button
            id="subtab-profile-gifts"
            onClick={() => setActiveSubTab('gifts')}
            className={`py-1 text-[10.5px] text-center font-bold rounded-2xl transition ${
              activeSubTab === 'gifts' 
                ? 'bg-amber-500 text-white shadow' 
                : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50'
            }`}
          >
            الهدايا
          </button>
          <button
            id="subtab-profile-favorites"
            onClick={() => setActiveSubTab('favorites')}
            className={`py-1 text-[10.5px] text-center font-bold rounded-2xl transition ${
              activeSubTab === 'favorites' 
                ? 'bg-amber-500 text-white shadow' 
                : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50'
            }`}
          >
            مفضلتي 💖
          </button>
        </div>

        <AnimatePresence mode="wait">
          {/* Subtab 1: Base User Info Edit */}
          {activeSubTab === 'info' && (
            <motion.div
              key="info"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="bg-white dark:bg-gray-900 rounded-3xl p-5 shadow-sm border border-amber-100/40 dark:border-gray-800 space-y-4"
            >
              <h3 className="text-xs font-extrabold text-amber-950 dark:text-amber-300 border-b border-amber-100/30 dark:border-gray-800 pb-2 text-right">
                تعديل ملفي الشخصي
              </h3>

              <form onSubmit={handleProfileSave} className="space-y-4 text-right">
                {isSavedAlert && (
                  <div className="bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 p-3 rounded-xl text-xs font-bold flex items-center gap-2 border border-emerald-100">
                    <Check className="w-4.5 h-4.5" />
                    <span>تم حفظ تعديلات الملف الشخصي والتخزين المؤقت بنجاح! ✅</span>
                  </div>
                )}

                {profileError && (
                  <div className="bg-red-50 dark:bg-red-950/30 text-red-600 p-3 rounded-xl text-xs font-bold flex items-center gap-2 border border-red-100">
                    <AlertCircle className="w-4.5 h-4.5" />
                    <span>{profileError}</span>
                  </div>
                )}

                {/* Name */}
                {!user.isRegistered ? (
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-600 dark:text-gray-300 block">اسمكِ الحقيقي الكامل:</label>
                    <input
                      id="profile-name-input"
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="اكتبي اسمكِ الحقيقي الثنائي أو الثلاثي هنا"
                      required
                      className="w-full px-3.5 py-2.5 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white border border-amber-100 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 text-xs font-medium text-right"
                    />
                  </div>
                ) : (
                  <div className="space-y-1 bg-gray-50/40 dark:bg-gray-800/20 p-3 rounded-2xl border border-amber-100/10 dark:border-gray-800 flex justify-between items-center">
                    <div className="text-right">
                      <span className="text-[10px] text-gray-400 block">اسم العميل (غير قابل للتعديل المباشر):</span>
                      <span className="text-xs font-black text-gray-800 dark:text-white">{user.name}</span>
                    </div>
                  </div>
                )}

                {/* Delivery Address */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-600 dark:text-gray-300 block">عنوان التوصيل الافتراضي:</label>
                  <input
                    id="profile-address-input"
                    type="text"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    required
                    className="w-full px-3.5 py-2.5 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white border border-amber-100 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 text-xs font-medium text-right"
                  />
                </div>

                {/* Default Currency */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-600 dark:text-gray-300 block">عملة الحساب الافتراضية:</label>
                  <select
                    id="profile-currency-select"
                    value={currency}
                    onChange={(e) => {
                      const newCur = e.target.value as Currency;
                      setCurrency(newCur);
                      onUpdateUser({
                        ...user,
                        address,
                        currency: newCur
                      });
                      setIsSavedAlert(true);
                      setTimeout(() => setIsSavedAlert(false), 2500);
                    }}
                    className="w-full px-3.5 py-2.5 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white border border-amber-100 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 text-xs font-bold text-right"
                  >
                    <option value="YER_NEW">ريال يمني جديد ({getCurrencyCode('YER_NEW')})</option>
                    <option value="YER_OLD">ريال يمني قديم ({getCurrencyCode('YER_OLD')})</option>
                    <option value="SAR">ريال سعودي ({getCurrencyCode('SAR')})</option>
                  </select>
                </div>

                {/* Phone display */}
                {!user.isRegistered ? (
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-600 dark:text-gray-300 block">رقم هاتفكِ المحمول الحقيقي (9 أرقام):</label>
                    <input
                      id="profile-phone-input"
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
                      placeholder="مثال: 771234567"
                      maxLength={9}
                      required
                      className="w-full px-3.5 py-2.5 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white border border-amber-100 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 text-xs font-medium text-right font-mono"
                    />
                    <span className="text-[10px] text-amber-600 font-bold block mt-1">⚠️ تنبيه: يرجى إدخال البيانات بشكل دقيق، لا يمكن تعديلها بعد الحفظ إلا عبر الإدارة لحماية المحفظة.</span>
                  </div>
                ) : (
                  <div className="space-y-1 bg-amber-500/5 p-3 rounded-2xl border border-amber-500/10 flex justify-between items-center">
                    <div className="text-right">
                      <span className="text-[10px] text-gray-400 block">رقم الهاتف (غير قابل للتعديل المباشر):</span>
                      <span className="text-xs font-black text-amber-950 dark:text-white" dir="ltr">{user.phone}</span>
                    </div>
                    
                    <button
                      id="change-phone-trigger"
                      type="button"
                      onClick={() => {
                        setNewName(user.name);
                        setNewPhone(user.phone);
                        setShowPhoneModal(true);
                      }}
                      className="px-3 py-1.5 bg-white dark:bg-gray-800 border border-amber-200 hover:border-amber-400 text-amber-800 dark:text-amber-400 text-[10px] font-black rounded-xl shadow-sm transition"
                    >
                      تعديل الاسم أو الرقم 📝
                    </button>
                  </div>
                )}

                {/* Save profile */}
                <button
                  id="profile-save-btn"
                  type="submit"
                  className="w-full py-2.5 bg-amber-500 hover:bg-amber-600 text-white font-extrabold text-xs rounded-xl shadow transition"
                >
                  {user.isRegistered ? 'حفظ البيانات والعملة' : 'تفعيل وتأكيد الحساب والبدء بالتسوق 🌸'}
                </button>
              </form>

              {/* Notification Center */}
              <div className="mt-5 pt-4 border-t border-amber-100/30 dark:border-gray-800 space-y-3.5 text-right">
                <div className="flex items-center gap-2 justify-end">
                  <h4 className="text-[11.5px] font-black text-amber-950 dark:text-amber-300">
                    🔔 مركز تنبيهات وإشعارات الهاتف والنظام
                  </h4>
                </div>
                
                <p className="text-[10.5px] text-gray-500 dark:text-gray-400 leading-relaxed font-semibold">
                  تحكمي باستلام إشعارات الهاتف الفورية والمنبثقات في خلفية نظام التشغيل لتصلكِ آخر العروض، الهدايا، وتحديثات رصيدكِ والطلبيات فوراً! 🌸✨
                </p>

                <div className="bg-amber-500/5 dark:bg-amber-500/10 p-3.5 rounded-2xl border border-amber-500/10 flex flex-col gap-3">
                  <div className="flex items-center justify-between text-xs font-bold">
                    <span className="text-[10px] text-gray-400">حالة إشعارات النظام:</span>
                    {permission === 'granted' && (
                      <span className="bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold flex items-center gap-1">
                        <span>●</span> مفعلة ونشطة ✅
                      </span>
                    )}
                    {permission === 'default' && (
                      <span className="bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold flex items-center gap-1">
                        <span>●</span> بحاجة لتفعيل 🔔
                      </span>
                    )}
                    {permission === 'denied' && (
                      <span className="bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-400 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold flex items-center gap-1">
                        <span>●</span> محجوبة بالمتصفح ❌
                      </span>
                    )}
                  </div>

                  <div className="flex gap-2 w-full">
                    {permission !== 'granted' ? (
                      <button
                        id="enable-notifications-btn"
                        type="button"
                        onClick={handleRequestPermission}
                        className="flex-1 py-2 bg-amber-600 hover:bg-amber-700 active:scale-95 text-white font-extrabold text-[11px] rounded-xl shadow-md transition cursor-pointer text-center"
                      >
                        طلب وتفعيل إذن الإشعارات 🚀
                      </button>
                    ) : (
                      <button
                        id="test-notification-btn"
                        type="button"
                        onClick={handleSendTestNotification}
                        className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-extrabold text-[11px] rounded-xl shadow-md transition cursor-pointer text-center"
                      >
                        إرسال إشعار تجريبي فوري للجهاز 📲
                      </button>
                    )}
                  </div>

                  {permission === 'denied' && (
                    <p className="text-[9px] text-red-600 dark:text-red-400 font-extrabold leading-relaxed mt-1 text-center bg-red-500/5 p-2 rounded-lg border border-red-500/10">
                      ⚠️ الإشعارات محظورة حالياً. يرجى الدخول إلى إعدادات متصفحكِ أو هاتفكِ، وإلغاء حظر الإشعارات لموقع المتجر لاستلام التنبيهات المنبثقة بنجاح! 🌸
                    </p>
                  )}
                </div>
              </div>

            </motion.div>
          )}

          {/* Subtab 2: Wallet Recharge Balance Requests */}
          {activeSubTab === 'recharge' && (
            <motion.div
              key="recharge"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="bg-white dark:bg-gray-900 rounded-3xl p-5 shadow-sm border border-amber-100/40 dark:border-gray-800 space-y-4 text-right"
            >
              <div className="flex items-center gap-2.5 border-b border-amber-100/30 dark:border-gray-800 pb-2">
                <div className="bg-amber-500 text-white p-1.5 rounded-xl">
                  <Coins className="w-5 h-5 animate-pulse" />
                </div>
                <h3 className="text-xs font-extrabold text-amber-950 dark:text-amber-300">
                  تقديم طلب شحن رصيدي
                </h3>
              </div>

              {/* Sub-tabs for transfer types */}
              <div className="flex border border-amber-100/40 dark:border-gray-800 rounded-xl overflow-hidden">
                <button
                  type="button"
                  onClick={() => {
                    setRechargeTransferType('kuraimi');
                    setSenderAccount('');
                  }}
                  className={`flex-1 py-2 text-center text-[11px] font-black transition-all ${
                    rechargeTransferType === 'kuraimi'
                      ? 'bg-amber-500 text-white'
                      : 'bg-gray-50 dark:bg-gray-800 text-gray-500 hover:text-gray-750'
                  }`}
                >
                  🏦 حساب الكريمي
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setRechargeTransferType('najm');
                    setSenderAccount('');
                  }}
                  className={`flex-1 py-2 text-center text-[11px] font-black transition-all ${
                    rechargeTransferType === 'najm'
                      ? 'bg-amber-500 text-white'
                      : 'bg-gray-50 dark:bg-gray-800 text-gray-500 hover:text-gray-750'
                  }`}
                >
                  ⭐ حوالة النجم وغيرها
                </button>
              </div>

              {rechargeTransferType === 'kuraimi' ? (
                <div className="bg-blue-50/50 dark:bg-gray-800/60 p-3.5 rounded-2xl border border-blue-100/50 text-[10px] text-blue-800 dark:text-blue-400 leading-relaxed font-semibold">
                  ℹ️ لشحن رصيد المحفظة الإلكترونية الخاصة بك، يرجى القيام بتحويل المبلغ المطلوب إلى حساب الكريمي الخاص بالمتجر أدناه:
                  {(() => {
                    const accounts = adminSettings.bankAccounts || [];
                    const matched = accounts.find((acc: any) => acc.currency === rechargeCurrency);
                    const bankName = (matched && matched.bankName) ? matched.bankName : 'الكريمي المميز';
                    const accountNumber = (matched && matched.accountNumber) ? matched.accountNumber : (adminSettings.kuraimiAccountNumber || '967739563915');
                    const accountName = (matched && matched.accountName) ? matched.accountName : (adminSettings.kuraimiAccountName || 'أم روح');
                    return (
                      <div className="mt-2 p-2 bg-amber-500/5 dark:bg-amber-500/10 rounded-lg text-center font-bold text-amber-800 dark:text-amber-400 space-y-0.5 animate-fade-in">
                        <div>🏦 {bankName}</div>
                        <div className="text-xs font-black">الحساب: {accountNumber}</div>
                        <div className="text-[9px] text-gray-500 dark:text-gray-400">باسم: {accountName}</div>
                      </div>
                    );
                  })()}
                </div>
              ) : (
                <div className="bg-amber-500/5 p-3.5 rounded-2xl border border-amber-200/50 text-[10px] text-amber-900 dark:text-amber-300 leading-relaxed font-semibold space-y-2">
                  ℹ️ لشحن رصيد المحفظة الإلكترونية الخاصة بك، يرجى إرسال حوالة بكامل المبلغ المطلوب عبر <span className="font-extrabold text-amber-850">شبكة النجم أو أي شبكة صرافة وحوالات أخرى</span> إلى اسم المستلم أدناه:
                  <div className="mt-2 p-2 bg-amber-500/10 rounded-lg text-center font-bold text-amber-800 dark:text-amber-400 space-y-0.5">
                    <div>⭐ شبكة النجم أو أي شبكة أخرى</div>
                    <div className="text-xs font-black">الاسم رباعياً: {adminSettings.najmReceiverName || 'روح أحمد علي'}</div>
                    <div className="text-[9px] text-gray-500 dark:text-gray-400">حالة الخدمة: معتمد ومباشر (يمكنك التحويل من أي صراف) ⚡</div>
                  </div>
                </div>
              )}

              <form onSubmit={handleRechargeSubmit} className="space-y-4">
                {rechargeSuccess && (
                  <div className="bg-emerald-50 text-emerald-600 p-3.5 rounded-xl text-xs font-bold flex items-center gap-2 border border-emerald-100">
                    <Check className="w-5 h-5" />
                    <span>تم إرسال طلب الشحن بنجاح! بانتظار موافقة الإدارة وتغذية رصيدك. ⏳</span>
                  </div>
                )}
                {rechargeError && (
                  <div className="bg-red-50 text-red-600 p-3 rounded-xl text-xs font-bold flex items-center gap-2 border border-red-100">
                    <AlertCircle className="w-4.5 h-4.5" />
                    <span>{rechargeError}</span>
                  </div>
                )}

                {/* Sender Name */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-600 dark:text-gray-300 block">اسم المرسل المحول:</label>
                  <input
                    id="recharge-sender-name"
                    type="text"
                    value={senderName}
                    onChange={(e) => setSenderName(e.target.value)}
                    placeholder="الاسم الكامل للمرسل بالتحويل"
                    required
                    className="w-full px-3.5 py-2.5 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white border border-amber-100 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 text-xs font-medium text-right"
                  />
                </div>

                {/* Sender Account */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-600 dark:text-gray-300 block">
                    {rechargeTransferType === 'kuraimi' ? 'رقم حساب الكريمي المرسل منه (أو رقم الحوالة):' : 'رقم مرجع حوالة النجم (رقم الحوالة المكون من أرقام):'}
                  </label>
                  <input
                    id="recharge-sender-account"
                    type="text"
                    value={senderAccount}
                    onChange={(e) => setSenderAccount(e.target.value)}
                    placeholder={rechargeTransferType === 'kuraimi' ? 'مثال: 1234567' : 'مثال: 987654321'}
                    required
                    className="w-full px-3.5 py-2.5 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white border border-amber-100 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 text-xs font-medium text-right"
                  />
                </div>

                {/* Currency Selection */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-600 dark:text-gray-300 block">عملة مبلغ التحويل المرسل:</label>
                  <select
                    id="recharge-currency-select"
                    value={rechargeCurrency}
                    onChange={(e) => {
                      const cur = e.target.value as Currency;
                      setRechargeCurrency(cur);
                      onUpdateUser({ ...user, currency: cur });
                    }}
                    className="w-full px-3.5 py-2.5 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white border border-amber-100 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 text-xs font-bold text-right"
                  >
                    <option value="YER_NEW">ريال يمني جديد</option>
                    <option value="YER_OLD">ريال يمني قديم</option>
                    <option value="SAR">ريال سعودي</option>
                  </select>
                </div>

                {/* Amount */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-600 dark:text-gray-300 block">
                    مبلغ التحويل والإرسال ({rechargeCurrency === 'YER_NEW' ? 'بالريال اليمني الجديد' : rechargeCurrency === 'YER_OLD' ? 'بالريال اليمني القديم' : 'بالريال السعودي'}):
                  </label>
                  <input
                    id="recharge-amount"
                    type="number"
                    value={rechargeAmount || ''}
                    onChange={(e) => setRechargeAmount(parseFloat(e.target.value) || 0)}
                    placeholder="مثال: 5000"
                    required
                    className="w-full px-3.5 py-2.5 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white border border-amber-100 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 text-xs font-bold text-right [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                </div>

                  {/* Instructions on optional WhatsApp receipt attachment */}
                  <div className="bg-emerald-50 dark:bg-emerald-950/10 p-3.5 rounded-2xl border border-emerald-100/45 dark:border-emerald-900/20 text-right space-y-1.5 my-3">
                    <div className="flex items-center gap-1.5 text-emerald-800 dark:text-emerald-400 font-extrabold text-xs justify-end">
                      <span className="text-sm">💬</span>
                      <span>سند التحويل وإشعار السداد الافتراضي</span>
                    </div>
                    <p className="text-[10px] text-gray-500 dark:text-gray-400 leading-relaxed font-semibold">
                      عزيزتي، لم نعد نطلب إرفاق صورة السند هنا لتسهيل تسوقكِ! يمكنكِ ببساطة نقر زر **"إتمام وإرسال طلب شحن الرصيد للإدارة"** وسيتم تسجيل طلبكِ فوراً لديهم للتحقق.
                    </p>
                    <p className="text-[10px] text-gray-500 dark:text-gray-400 leading-relaxed font-semibold">
                      كما يمكنكِ (اختيارياً) نقر زر **"إرسال تفاصيل الشحن عبر واتساب"** لتحويلكِ المباشر إلى واتساب ومشاركة تفاصيل العملية وإرفاق صورة السند يدوياً هناك لمن أرادت تسريع التدقيق 🌸✨.
                    </p>
                  </div>

                  <div className="flex flex-col gap-2.5 pt-2">
                    <button
                      id="recharge-submit-btn"
                      type="submit"
                      className="w-full py-2.5 bg-gradient-to-l from-amber-600 to-amber-700 hover:from-amber-700 hover:to-amber-800 text-white font-extrabold text-xs rounded-xl shadow transition transform active:scale-95 flex items-center justify-center gap-1.5"
                    >
                      <span>إتمام وإرسال طلب شحن الرصيد للإدارة ⚡</span>
                    </button>

                    <button
                      id="recharge-whatsapp-btn"
                      type="button"
                      onClick={handleSendToWhatsAppOptional}
                      className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-extrabold text-xs rounded-xl shadow transition transform active:scale-95 flex items-center justify-center gap-1.5"
                    >
                      <span>إرسال تفاصيل الشحن عبر واتساب (اختياري) 💬</span>
                    </button>
                  </div>
                </form>
              </motion.div>
          )}

          {/* Subtab 3: Um Rouh Gifts Balance display */}
          {activeSubTab === 'gifts' && (
            <motion.div
              key="gifts"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="bg-white dark:bg-gray-900 rounded-3xl p-6 shadow-sm border border-amber-100/40 dark:border-gray-800 space-y-4 text-center"
            >
              <div className="mx-auto w-14 h-14 bg-amber-500/10 text-amber-600 rounded-full flex items-center justify-center shadow-inner animate-pulse">
                <Gift className="w-7 h-7" />
              </div>

              <div className="space-y-1">
                <h3 className="text-xs font-bold text-gray-400">رصيد هدايا أم روح المتاح</h3>
                <div className="flex justify-center items-baseline gap-1">
                  <span className="text-2xl font-black text-amber-800 dark:text-amber-400">
                    {user.giftBalance || 0}
                  </span>
                  <span className="text-xs font-extrabold text-amber-700">ريال يمني جديد</span>
                </div>
              </div>

              <div className="bg-amber-50/70 dark:bg-gray-800/60 p-4 rounded-2xl text-[11px] text-amber-950 dark:text-gray-300 leading-relaxed text-right font-medium">
                🎁 <span className="font-extrabold">ما هي هدايا أم روح؟</span>
                <p className="mt-1 text-gray-500 text-[10.5px]">
                  هي مبالغ مالية تقديرية تقوم الإدارة بمنحها وإيداعها مباشرة لعملائنا الأكثر وفاءً وتفاعلاً ونشاطاً بالمتجر! عند توفر هذا الرصيد في حسابك ولديك طلبية في سلة التسوق قيمتها أصغر أو تساوي الرصيد المتاح، سيظهر لديك خيار سداد فوري مباشر من الهدايا بضغطة زر ودون الحاجة لإيداع!
                </p>
              </div>
            </motion.div>
          )}

          {/* Subtab 4: Favorites Products */}
          {activeSubTab === 'favorites' && (
            <motion.div
              key="favorites"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="bg-white dark:bg-gray-900 rounded-3xl p-5 shadow-sm border border-amber-100/40 dark:border-gray-800 space-y-4 text-right"
            >
              <h3 className="text-xs font-extrabold text-amber-950 dark:text-amber-300 border-b border-amber-100/30 dark:border-gray-800 pb-2 text-right flex items-center gap-1 justify-end">
                <span>المنتجات المفضلة لدي 💖</span>
              </h3>

              {(!user.favorites || user.favorites.length === 0) ? (
                <div className="text-center py-10 text-gray-400 text-[11px] font-extrabold leading-relaxed">
                  لا توجد أي أصناف مضافة للمفضلة حالياً! <br/>
                  يمكنك تفضيل الأصناف بالضغط على أيقونة القلب 💖 بداخل صفحة تفاصيل المنتج.
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {allProducts
                    .filter(p => user.favorites?.includes(p.id))
                    .map(prod => (
                      <div
                        key={prod.id}
                        onClick={() => onSelectProduct(prod)}
                        className="bg-gray-50 dark:bg-gray-800/40 p-2 rounded-2xl border border-amber-100/5 hover:border-amber-500/20 cursor-pointer flex flex-col justify-between h-36 transition transform active:scale-98 shadow-sm"
                      >
                        <div className="relative h-20 w-full bg-white dark:bg-gray-900 rounded-xl overflow-hidden mb-1">
                          <img
                            src={prod.images[0]}
                            alt={prod.name}
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <div className="text-right">
                          <h4 className="text-[10.5px] font-black text-amber-950 dark:text-white line-clamp-1">{prod.name}</h4>
                          <span className="text-[10px] text-amber-800 dark:text-amber-400 font-bold">
                            {prod.priceYERNew} ر.ي.ج
                          </span>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Footer Brand Slogan - Klik 3 times to open Admin Panel */}
        <div className="text-center pt-8 pb-4">
          <p
            id="footer-brand"
            onClick={handleFooterClick}
            className="text-[10px] text-gray-400 hover:text-amber-600 transition cursor-pointer select-none font-bold inline-block border-b border-transparent hover:border-gray-300"
          >
            متجر أم روح للأسر المنتجة © ٢٠٢٦
          </p>
        </div>

        {/* Secret Phone Number Change Modal */}
        <AnimatePresence>
          {showPhoneModal && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
              onClick={() => setShowPhoneModal(false)}
            >
              <motion.div
                initial={{ scale: 0.9, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.9, y: 20 }}
                className="bg-white dark:bg-gray-900 w-full max-w-sm rounded-3xl p-5 space-y-4 shadow-2xl text-right"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="border-b border-amber-50 pb-2">
                  <h3 className="text-xs font-black text-amber-950 dark:text-amber-300 flex items-center gap-1.5 justify-end">
                    <span>تقديم طلب تعديل الاسم أو الرقم</span>
                    <Settings className="w-4 h-4 text-amber-500" />
                  </h3>
                </div>

                <form onSubmit={handlePhoneRequestSubmit} className="space-y-4">
                  {phoneSuccess && (
                    <div className="bg-emerald-50 text-emerald-600 p-3 rounded-xl text-xs font-bold flex items-center gap-2 border border-emerald-100">
                      <Check className="w-4.5 h-4.5" />
                      <span>تم تقديم طلب التحديث للإدارة بنجاح! ⏳</span>
                    </div>
                  )}
                  {phoneAlert && (
                    <div className="bg-red-50 text-red-600 p-3 rounded-xl text-xs font-bold flex items-center gap-2 border border-red-100">
                      <AlertCircle className="w-4.5 h-4.5" />
                      <span>{phoneAlert}</span>
                    </div>
                  )}

                  <div className="text-[10px] text-gray-500 leading-relaxed font-semibold">
                    ℹ️ لأمان حسابكِ وتوثيق الهوية بالمنصة، يتطلب تغيير الاسم أو رقم الهاتف مراجعة وموافقة الإدارة. يرجى إدخال البيانات الجديدة وسيقوم المسؤولون بالتحديث فور التدقيق!
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-600 dark:text-gray-300 block">الاسم الجديد المقترح:</label>
                    <input
                      id="name-req-input"
                      type="text"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      placeholder="اسم العميل الجديد"
                      required
                      className="w-full px-3.5 py-2.5 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white border border-amber-100 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 text-xs font-semibold text-right"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-600 dark:text-gray-300 block">رقم الهاتف الجديد المقترح:</label>
                    <input
                      id="phone-req-input"
                      type="text"
                      value={newPhone}
                      onChange={(e) => setNewPhone(e.target.value)}
                      placeholder="رقم الهاتف الجديد"
                      required
                      className="w-full px-3.5 py-2.5 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white border border-amber-100 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 text-xs font-semibold text-right"
                    />
                  </div>

                  <div className="flex gap-2.5">
                    <button
                      id="phone-req-cancel"
                      type="button"
                      onClick={() => setShowPhoneModal(false)}
                      className="flex-1 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold rounded-xl transition"
                    >
                      إلغاء
                    </button>
                    <button
                      id="phone-req-submit"
                      type="submit"
                      className="flex-1 py-2 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold rounded-xl transition"
                    >
                      تقديم الطلب
                    </button>
                  </div>
                </form>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Secret Admin Verification Modal */}
        <AnimatePresence>
          {showAdminPasswordModal && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
              onClick={() => setShowAdminPasswordModal(false)}
            >
              <motion.div
                initial={{ scale: 0.9, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.9, y: 20 }}
                className="bg-white dark:bg-gray-900 w-full max-w-sm rounded-3xl p-5 space-y-4 shadow-2xl text-right"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="border-b border-amber-50 dark:border-gray-800 pb-2 flex justify-between items-center">
                  <button
                    onClick={() => setShowAdminPasswordModal(false)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                  
                  <h3 className="text-xs font-black text-amber-950 dark:text-amber-300 flex items-center gap-1.5 justify-end">
                    <span>بوابة المسؤولين - لوحة التحكم</span>
                    <Lock className="w-4 h-4 text-amber-500" />
                  </h3>
                </div>

                <form onSubmit={handleAdminVerify} className="space-y-4">
                  {passwordError && (
                    <div className="bg-red-50 text-red-600 p-2.5 rounded-xl text-xs font-bold flex items-center gap-2 border border-red-100">
                      <AlertCircle className="w-4.5 h-4.5" />
                      <span>{passwordError}</span>
                    </div>
                  )}

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-600 dark:text-gray-300 block">أدخل رمز الدخول السري للوحة الإدارة:</label>
                    <input
                      id="admin-password-input"
                      type="password"
                      value={enteredPassword}
                      onChange={(e) => setEnteredPassword(e.target.value)}
                      placeholder="••••"
                      required
                      className="w-full px-3.5 py-2.5 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white border border-amber-100 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 text-center text-sm font-black tracking-widest"
                    />
                  </div>

                  <button
                    id="admin-verify-submit"
                    type="submit"
                    className="w-full py-2.5 bg-amber-500 hover:bg-amber-600 text-white font-extrabold text-xs rounded-xl shadow transition"
                  >
                    فتح لوحة الإدارة
                  </button>
                </form>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Unauthorized Domain Guide Modal */}
        <UnauthorizedDomainModal isOpen={showDomainModal} onClose={() => setShowDomainModal(false)} errorType={authErrorType} />

        {/* Floating WhatsApp FAB for Direct Customer Support */}
        <div className="fixed bottom-24 right-4 z-40">
          <a
            href={getWhatsAppLink(Database.getAdminSettings().whatsappNumber || '967739563915', 'السلام عليكم، أريد الاستفسار عن منتج أو شحن رصيد في متجر أم روح 🌸')}
            target="_blank"
            rel="noopener noreferrer"
            className="w-12 h-12 bg-[#25D366] hover:bg-[#20ba5a] active:scale-95 text-white rounded-full shadow-lg hover:shadow-2xl flex items-center justify-center transition-all duration-300 animate-bounce cursor-pointer relative group"
            title="الدعم المباشر عبر واتساب"
          >
            {/* Pulsing ring animation */}
            <span className="absolute inset-0 rounded-full bg-[#25D366]/40 animate-ping" />
            
            <svg className="w-6 h-6 z-10" fill="currentColor" viewBox="0 0 24 24">
              <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946C.003 5.324 5.328 0 11.94 0c3.205.001 6.216 1.248 8.48 3.514 2.264 2.265 3.51 5.275 3.509 8.482-.003 6.616-5.329 11.94-11.94 11.94-2.005-.001-3.973-.502-5.717-1.458L0 24zm6.59-4.846c1.6.95 3.188 1.449 4.747 1.45 5.515 0 10.002-4.487 10.004-10.004.001-2.673-1.037-5.185-2.924-7.07C16.53 1.745 14.02 1.701 11.94 1.701c-5.517 0-10.004 4.486-10.006 10.002-.001 1.93.505 3.813 1.466 5.432l-.968 3.541 3.625-.943zM16.14 13.6c-.23-.115-1.354-.669-1.564-.744-.21-.075-.362-.115-.515.115-.152.23-.591.745-.724.897-.133.151-.265.17-.495.055-.23-.115-.97-.358-1.849-1.141-.684-.61-1.147-1.363-1.28-1.593-.133-.23-.014-.354.1-.468.104-.103.23-.268.344-.403.115-.135.153-.23.23-.384.077-.153.038-.287-.019-.402-.058-.115-.515-1.24-.705-1.7-.186-.447-.375-.387-.515-.394-.132-.007-.284-.008-.435-.008-.152 0-.4-.058-.61.17-.21.23-.8.783-.8 1.91 0 1.127.82 2.217.933 2.272.115.055 1.611 2.46 3.902 3.45.545.235.97.375 1.302.48.548.174 1.047.15 1.44.09.438-.067 1.354-.554 1.545-1.1.19-.545.19-1.013.133-1.1-.057-.087-.21-.132-.44-.247z"/>
            </svg>
            
            {/* Tooltip text */}
            <span className="absolute right-14 scale-0 group-hover:scale-100 transition-all duration-200 bg-gray-900 text-white text-[9px] font-black py-1 px-2.5 rounded-lg whitespace-nowrap shadow-md z-50">
              تواصل مباشر مع الدعم واتساب 🌸
            </span>
          </a>
        </div>
      </div>
    </div>
  );
}
