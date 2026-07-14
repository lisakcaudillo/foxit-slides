'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { FileText, File, Clock, ArrowRight } from 'lucide-react';
import { getAllChats, seedChatsIfEmpty, type ChatEntry } from '@/lib/chatStorage';
import { getAllDocuments, type StoredDocument } from '@/lib/documentStorage';
import { getTemplates, type StoredTemplate } from '@/lib/templateStorage';

/** Accent colors for each skill — matches SkillCardGrid */
const SKILL_ACCENTS: Record<string, string> = {
  'Legal Counsel': '#401842',
  'Executive Writer': '#6B3FA0',
  'Technical Author': '#FF5F00',
  'HR Professional': '#401842',
  'Compliance Officer': '#6B3FA0',
  'Research Analyst': '#FF5F00',
  'Proposal Writer': '#6B3FA0',
  'Visual Designer': '#401842',
  'Prompt Master': '#FF5F00',
};

interface ActivityItem {
  type: 'chat' | 'artifact';
  id: string;
  title: string;
  skillName: string | null;
  timestamp: Date;
  href: string;
  badge: string;
  badgeColor: string;
  prompt?: string;
}

function relativeTime(date: Date): string {
  const now = Date.now();
  const diff = now - date.getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString();
}

export default function RecentActivity() {
  const [items, setItems] = useState<ActivityItem[]>([]);

  useEffect(() => {
    seedChatsIfEmpty();

    const chats = getAllChats();
    const docs = getAllDocuments();
    const templates = getTemplates();

    const activity: ActivityItem[] = [];

    // Chat entries
    chats.forEach((chat: ChatEntry) => {
      activity.push({
        type: 'chat',
        id: chat.id,
        title: chat.taskDescription,
        skillName: chat.skillName,
        timestamp: new Date(chat.timestamp),
        href: `/editor/documents?skill=${encodeURIComponent(chat.skillName)}&prompt=${encodeURIComponent(chat.taskDescription)}${chat.documentId ? `&doc=${chat.documentId}` : ''}`,
        badge: chat.skillName,
        badgeColor: SKILL_ACCENTS[chat.skillName] || '#6B3FA0',
        prompt: chat.taskDescription,
      });
    });

    // Document artifacts
    docs.forEach((doc: StoredDocument) => {
      activity.push({
        type: 'artifact',
        id: doc.documentId,
        title: doc.documentName || 'Untitled Document',
        skillName: null,
        timestamp: new Date(doc.updatedAt || doc.createdAt),
        href: `/editor/documents?doc=${doc.documentId}`,
        badge: 'Document',
        badgeColor: '#6B3FA0',
      });
    });

    // Template artifacts
    templates.forEach((entry: StoredTemplate) => {
      activity.push({
        type: 'artifact',
        id: `template-${entry.template.documentId}`,
        title: entry.template.documentName || 'Untitled Template',
        skillName: null,
        timestamp: new Date(entry.createdAt),
        href: `/editor/documents?template=${entry.template.documentId}`,
        badge: 'Template',
        badgeColor: '#FF5F00',
      });
    });

    // Sort by recency
    activity.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    setItems(activity);
  }, []);

  if (items.length === 0) return null;

  return (
    <div className="bg-white rounded-xl border border-slate-100 p-4 shadow-sm">
      <div className="flex items-center gap-2 mb-3">
        <Clock className="size-4 text-muted-foreground" />
        <h3 className="text-base font-medium text-muted-foreground">Recent activity</h3>
      </div>

      <div className="flex flex-col gap-1.5">
        {items.slice(0, 5).map((item) => (
          <Link
            key={item.id}
            href={item.href}
            className="group flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-150 hover:bg-white/60 focus:outline-none focus:ring-2 focus:ring-primary/40"
          >
            {/* Icon */}
            {item.type === 'chat' ? (
              <div
                className="flex items-center justify-center size-8 rounded-lg flex-shrink-0"
                style={{ background: `${item.badgeColor}25` }}
              >
                <span className="text-xs font-bold" style={{ color: item.badgeColor }}>
                  {item.skillName?.split(' ').map(w => w[0]).join('') || '?'}
                </span>
              </div>
            ) : (
              <div className="flex items-center justify-center size-8 rounded-lg bg-slate-100 flex-shrink-0">
                {item.badge === 'Template' ? (
                  <FileText className="size-4 text-slate-400" />
                ) : (
                  <File className="size-4 text-slate-400" />
                )}
              </div>
            )}

            {/* Content */}
            <div className="flex-1 min-w-0">
              <p className="text-base text-foreground truncate">{item.title}</p>
              <div className="flex items-center gap-2">
                <span
                  className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                  style={{ background: `${item.badgeColor}30`, color: item.badgeColor }}
                >
                  {item.badge}
                </span>
                <span className="text-sm text-muted-foreground">{relativeTime(item.timestamp)}</span>
              </div>
            </div>

            {/* Continue / Open */}
            {item.type === 'chat' && (
              <span className="text-sm font-medium opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 flex-shrink-0" style={{ color: '#FF5F00' }}>
                Continue
                <ArrowRight className="size-3.5" />
              </span>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}
