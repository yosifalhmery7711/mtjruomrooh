/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Award, Copy, Check, Share2, ThumbsUp, ThumbsDown, User as UserIcon } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Contestant, User } from '../types';
import { Database } from '../Database';

interface EventTabProps {
  user: User;
  onUpdateUser: (updatedUser: User) => void;
  showToast: (msg: string) => void;
  setActiveTab: (tab: string) => void;
}

export default function EventTab({ user, onUpdateUser, showToast, setActiveTab }: EventTabProps) {
  const [contestants, setContestants] = useState<Contestant[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [votingForId, setVotingForId] = useState<string | null>(null);
  const [voteChoice, setVoteChoice] = useState<'green' | 'red' | null>(null);

  const adminSettings = Database.getAdminSettings();
  const eventImageUrl = adminSettings.eventImageUrl || '';
  const eventTitle = adminSettings.eventTitle || 'مسابقة متجر أم روح الكبرى 🏆🌸';
  const eventDescription = adminSettings.eventDescription || 'شاركي معنا في أكبر فعالية تصويت لربح جوائز قيمة ومباشرة من متجر أم روح! أنشئي رابطكِ الخاص الآن وشاركي صديقاتكِ 🌸.';
  const eventPrize = adminSettings.eventWinnerPrize || 'جائزة مالية كبرى وقسائم تسوق مميزة 🎁';

  const myReferralLink = typeof window !== 'undefined' 
    ? `${window.location.origin}/?vote=${user.id}` 
    : '';

  useEffect(() => {
    setContestants(Database.getContestants());
    
    // Automatically register user as a contestant if they are registered in the system but not yet in the contestants table
    if (user.isRegistered && user.name && user.phone) {
      const list = Database.getContestants();
      const alreadyIn = list.some(c => c.id === user.id || c.phone === user.phone);
      if (!alreadyIn) {
        Database.addContestant(user.name, user.phone, user.id, user.id);
        setContestants(Database.getContestants());
      }
    }
  }, [user]);

  const handleCopyLink = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    showToast('✓ تم نسخ رابط التصويت والمشاركة بنجاح!');
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleShareWhatsApp = (name: string, link: string) => {
    const text = `صديقاتي الغاليات 🌸 أشارك في مسابقة متجر أم روح الكبرى 🏆 أدعوكن للتصويت لي وتأييدي عبر هذا الرابط المباشر لتسجيل صوتكن وتأكيد فوزي: \n${link}`;
    const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  };

  const handleVote = (contestantId: string, type: 'green' | 'red') => {
    const deviceId = localStorage.getItem('amrwh_device_id') || 'DEV-MOCK';
    const result = Database.voteForContestant(contestantId, user.name || 'زائر', deviceId, type);
    if (result.success) {
      showToast(type === 'green' ? '✓ تم تسجيل تأييدكِ للمتسابق بنجاح 👍' : '✓ تم تسجيل اعتراضكِ على المتسابق بنجاح 👎');
      setContestants(Database.getContestants());
    } else {
      showToast(result.error || 'خطأ في عملية التصويت!');
    }
  };

  // Find my contestant profile if exists
  const myContestantProfile = contestants.find(c => c.id === user.id);

  return (
    <div className="space-y-6 pb-24 text-right" dir="rtl">
      {/* Event Header Banner */}
      <div className="relative rounded-3xl overflow-hidden bg-gradient-to-br from-amber-600 to-amber-800 text-white p-6 shadow-xl border border-amber-500/20">
        {/* Background glow effects */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(251,191,36,0.3),transparent_60%)] pointer-events-none" />
        <div className="absolute -bottom-12 -left-12 w-48 h-48 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col md:flex-row gap-6 items-center relative z-10">
          {eventImageUrl && (
            <div className="w-24 h-24 md:w-32 md:h-32 rounded-2xl overflow-hidden shadow-lg border-2 border-white/20 shrink-0">
              <img 
                src={eventImageUrl} 
                alt={eventTitle} 
                className="w-full h-full object-cover" 
                referrerPolicy="no-referrer"
              />
            </div>
          )}
          <div className="space-y-2 flex-1 text-center md:text-right">
            <span className="inline-flex items-center gap-1 bg-amber-500/20 backdrop-blur-md px-3 py-1 rounded-full text-[10px] font-black tracking-wider text-amber-200 border border-amber-400/20">
              <Award className="w-3.5 h-3.5" /> الفعالية والمسابقة النشطة حالياً
            </span>
            <h2 className="text-xl font-black tracking-tight">{eventTitle}</h2>
            <p className="text-xs text-amber-100/90 leading-relaxed font-bold max-w-xl">
              {eventDescription}
            </p>
            <div className="pt-2 flex flex-wrap gap-2 justify-center md:justify-start">
              <div className="bg-white/10 backdrop-blur-sm px-3.5 py-1.5 rounded-xl border border-white/5 text-[11px] font-black">
                🎁 جائزة الفائز الأول: <span className="text-amber-300 font-extrabold">{eventPrize}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* User referral block */}
      {user.isRegistered ? (
        <div className="bg-gradient-to-br from-amber-50 to-amber-100/40 dark:from-amber-950/10 dark:to-amber-950/20 p-5 rounded-3xl border border-amber-500/10 shadow-lg space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-black text-amber-950 dark:text-amber-300 flex items-center gap-1.5">
              <span>🔗</span> رابط تصويتكِ ومشاركتكِ الفريد
            </h3>
            <span className="text-[9px] font-black bg-amber-100 dark:bg-amber-950/50 text-amber-800 dark:text-amber-400 py-1 px-2.5 rounded-lg border border-amber-200/40">
              تأكيد تلقائي فعال ✓
            </span>
          </div>

          <p className="text-[11px] text-gray-500 dark:text-gray-400 font-semibold leading-relaxed">
            عند مشاركة الرابط أدناه مع صديقاتكِ ومجموعاتكِ، يمكنهن الدخول المباشر والتصويت لكِ لتجميع أصوات التأييد الخضراء والفوز بالجائزة الكبرى! 🌸🏆
          </p>

          <div className="flex gap-2 bg-white dark:bg-gray-900 p-2 rounded-2xl border border-amber-200/20 shadow-inner">
            <input 
              type="text" 
              readOnly 
              value={myReferralLink}
              className="flex-1 bg-transparent text-left text-[11px] font-mono py-1 px-2 focus:outline-none text-gray-400 select-all" 
              dir="ltr"
            />
            <button
              onClick={() => handleCopyLink(myReferralLink, 'my-link')}
              className="bg-amber-100 hover:bg-amber-200 text-amber-800 dark:bg-amber-950 dark:text-amber-300 px-3.5 py-1.5 rounded-xl text-xs font-black transition flex items-center gap-1 shrink-0"
            >
              {copiedId === 'my-link' ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedId === 'my-link' ? 'تم النسخ' : 'نسخ'}</span>
            </button>
          </div>

          <div className="flex gap-3 pt-1">
            <button
              onClick={() => handleShareWhatsApp(user.name, myReferralLink)}
              className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white font-extrabold text-xs py-3 px-4 rounded-xl shadow-md transition flex items-center justify-center gap-1.5"
            >
              <span>💬</span> مشاركة عبر واتساب سريعاً
            </button>
          </div>

          {myContestantProfile && (
            <div className="grid grid-cols-3 gap-3 pt-2">
              <div className="bg-emerald-50 dark:bg-emerald-950/20 p-3 rounded-2xl border border-emerald-100/50 dark:border-emerald-900/30 text-center">
                <span className="text-[9px] font-black text-emerald-800 dark:text-emerald-400 block mb-1">أصوات تأييد 👍</span>
                <span className="text-lg font-black text-emerald-700 dark:text-emerald-300">{myContestantProfile.greenVotes || 0}</span>
              </div>
              <div className="bg-rose-50 dark:bg-rose-950/20 p-3 rounded-2xl border border-rose-100/50 dark:border-rose-900/30 text-center">
                <span className="text-[9px] font-black text-rose-800 dark:text-rose-400 block mb-1">أصوات اعتراض 👎</span>
                <span className="text-lg font-black text-rose-700 dark:text-rose-300">{myContestantProfile.redVotes || 0}</span>
              </div>
              <div className="bg-amber-50 dark:bg-amber-950/20 p-3 rounded-2xl border border-amber-100/50 dark:border-amber-900/30 text-center">
                <span className="text-[9px] font-black text-amber-800 dark:text-amber-400 block mb-1">إجمالي الأصوات</span>
                <span className="text-lg font-black text-amber-700 dark:text-amber-300">{(myContestantProfile.greenVotes || 0) + (myContestantProfile.redVotes || 0)}</span>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-gradient-to-br from-amber-500/5 to-amber-500/10 p-5 rounded-3xl border border-amber-500/10 shadow-md space-y-3.5 text-center">
          <div className="w-12 h-12 bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-400 rounded-full flex items-center justify-center mx-auto text-xl">
            🏆
          </div>
          <h3 className="text-xs font-black text-amber-950 dark:text-amber-300">أنتِ لستِ مسجلة في الفعالية بعد!</h3>
          <p className="text-[11px] text-gray-500 dark:text-gray-400 font-semibold leading-relaxed max-w-sm mx-auto">
            لتفعيل حسابكِ في المسابقة والحصول على رابط مشاركة فريد والبدء في تجميع الأصوات للفوز بالجوائز القيمة، يرجى ملء وتفعيل حسابكِ بالاسم والهاتف الحقيقيين أولاً!
          </p>
          <button
            onClick={() => setActiveTab('profile')}
            className="bg-amber-500 hover:bg-amber-600 text-white font-black text-xs py-2.5 px-6 rounded-xl shadow-md transition"
          >
            تفعيل وتأكيد حسابي الآن 🌸
          </button>
        </div>
      )}

      {/* Leaderboard Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-black text-gray-900 dark:text-white flex items-center gap-1.5">
            <span>📊</span> جدول المتسابقين والنتائج المباشرة
          </h3>
          <span className="text-[10px] font-bold text-gray-500">
            {contestants.length} متسابقين نشطين
          </span>
        </div>

        {contestants.length === 0 ? (
          <div className="bg-white dark:bg-gray-900 p-8 rounded-3xl border border-gray-100 dark:border-gray-800 text-center">
            <p className="text-[11px] text-gray-400 font-bold">لا يوجد أي متسابقين مسجلين في المسابقة حالياً.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {contestants
              .sort((a, b) => {
                const totalA = (a.greenVotes || 0) + (a.redVotes || 0);
                const totalB = (b.greenVotes || 0) + (b.redVotes || 0);
                return totalB - totalA;
              })
              .map((c, index) => {
                const totalVotes = (c.greenVotes || 0) + (c.redVotes || 0);
                const isMe = c.id === user.id;

                return (
                  <motion.div
                    key={c.id}
                    layoutId={`contestant-card-${c.id}`}
                    className={`bg-white dark:bg-gray-900 p-4 rounded-3xl border shadow-sm flex flex-col justify-between space-y-4 transition-all duration-300 relative ${
                      isMe 
                        ? 'border-amber-500 ring-2 ring-amber-500/10' 
                        : 'border-gray-100 dark:border-gray-800/60'
                    }`}
                  >
                    {/* Rank Badge */}
                    <div className="absolute top-4 left-4 w-6 h-6 bg-amber-500/10 text-amber-800 dark:text-amber-400 text-[10px] font-black rounded-full flex items-center justify-center">
                      #{index + 1}
                    </div>

                    <div className="flex items-center gap-3">
                      {/* Avatar Image / Placeholder */}
                      <div className="w-12 h-12 rounded-2xl bg-amber-50 dark:bg-gray-800 border border-amber-100 dark:border-gray-700 overflow-hidden flex items-center justify-center shrink-0">
                        {c.imageUrl ? (
                          <img 
                            src={c.imageUrl} 
                            alt={c.name} 
                            className="w-full h-full object-cover"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <UserIcon className="w-5 h-5 text-amber-700/60 dark:text-amber-400/60" />
                        )}
                      </div>

                      <div className="space-y-1">
                        <div className="flex items-center gap-1.5">
                          <h4 className="text-xs font-black text-gray-900 dark:text-white truncate max-w-[120px]">{c.name}</h4>
                          {isMe && (
                            <span className="text-[8px] font-black bg-amber-500 text-white py-0.5 px-1.5 rounded-md">
                              أنا
                            </span>
                          )}
                        </div>
                        <p className="text-[9px] font-mono text-gray-400">{c.createdAt ? new Date(c.createdAt).toLocaleDateString('ar-YE') : ''}</p>
                      </div>
                    </div>

                    {/* Green/Red vote counters */}
                    <div className="grid grid-cols-2 gap-2 text-center">
                      <div className="bg-emerald-50/60 dark:bg-emerald-950/10 py-1.5 px-2.5 rounded-xl border border-emerald-100/30">
                        <span className="text-[8px] font-black text-emerald-800 dark:text-emerald-400 block mb-0.5">تأييد 👍</span>
                        <span className="text-xs font-black text-emerald-700 dark:text-emerald-300">{c.greenVotes || 0}</span>
                      </div>
                      <div className="bg-rose-50/60 dark:bg-rose-950/10 py-1.5 px-2.5 rounded-xl border border-rose-100/30">
                        <span className="text-[8px] font-black text-rose-800 dark:text-rose-400 block mb-0.5">اعتراض 👎</span>
                        <span className="text-xs font-black text-rose-700 dark:text-rose-300">{c.redVotes || 0}</span>
                      </div>
                    </div>

                    {/* Public Vote Actions (Only if NOT the contestant themselves) */}
                    {!isMe && (
                      <div className="flex gap-2 border-t border-dashed border-gray-100 dark:border-gray-800 pt-3">
                        <button
                          onClick={() => handleVote(c.id, 'green')}
                          className="flex-1 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-300 py-2 rounded-xl text-[10px] font-black transition flex items-center justify-center gap-1 border border-emerald-200/20"
                        >
                          <ThumbsUp className="w-3 h-3" />
                          <span>تأييد</span>
                        </button>
                        <button
                          onClick={() => handleVote(c.id, 'red')}
                          className="flex-1 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/20 text-rose-700 dark:text-rose-300 py-2 rounded-xl text-[10px] font-black transition flex items-center justify-center gap-1 border border-rose-200/20"
                        >
                          <ThumbsDown className="w-3 h-3" />
                          <span>اعتراض</span>
                        </button>
                      </div>
                    )}
                  </motion.div>
                );
              })}
          </div>
        )}
      </div>
    </div>
  );
}
