import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
// last_seen: the session's last visit, at most a day stale (lib/server/session.ts refreshSession()); sessions expire a year after it (#4 §6.2). Backfilled from created by migration 0003.
export const sessions = sqliteTable('sessions', { hash:text('hash').primaryKey(), created:integer('created').notNull(), lastSeen:integer('last_seen') });
// approved_at: set when moderated to approved, cleared when moved away from it.
// status_at: time of the last status change; the 30-day window of non-approved stories counts from it.
// Both added by migration 0003 (status_at backfilled from created, approved_at from created for approved rows).
// Nullable only because SQLite can't ADD a NOT NULL column without a constant default; every write sets
// status_at, and queries read COALESCE(status_at, created) so a missing value fails safe.
export const stories = sqliteTable('stories', {id:text('id').primaryKey(), owner:text('owner').notNull(), title:text('title').notNull(), body:text('body').notNull(), era:text('era').notNull(), source:text('source').notNull(), status:text('status').notNull(), consent:text('consent').notNull(), letterType:text('letter_type').notNull().default('legacy'), mood:text('mood').notNull().default(''), reflection:text('reflection').notNull().default(''), attempt:text('attempt').unique(), created:integer('created').notNull(), approvedAt:integer('approved_at'), statusAt:integer('status_at')});
export const feedback = sqliteTable('feedback',{id:text('id').primaryKey(), owner:text('owner').notNull(), story:text('story').notNull(), kind:text('kind').notNull(), note:text('note').notNull(), created:integer('created').notNull()},(t)=>[index('feedback_story_idx').on(t.story)]);

export const writingAttempts=sqliteTable('writing_attempts',{id:text('id').primaryKey(),owner:text('owner').notNull(),letterType:text('letter_type').notNull(),created:integer('created').notNull(),completed:integer('completed'),shared:integer('shared').notNull().default(0)});

// Append-only consent history (#4 §6.1); action is 'submit' | 'share' | 'unshare'. Same lifetime as
// the story: deleted with it (withdraw, erase, admin delete, retention). Migration 0003 backfills one
// 'submit' row per existing story.
// owner (migration 0006, V5-r): the session hash that made a 'share' / 'unshare' change, so the daily
// sharing limit counts per session. Such a row outlives its story for the day it still counts
// (withdraw, admin delete), and erase-all deletes every row of the owner. NULL for older rows.
export const consentEvents=sqliteTable('consent_events',{id:integer('id').primaryKey(),story:text('story').notNull(),action:text('action').notNull(),consentVersion:text('consent_version').notNull(),created:integer('created').notNull(),owner:text('owner')},(t)=>[index('consent_events_story_idx').on(t.story),index('consent_events_owner_idx').on(t.owner,t.created)]);

// Admin operation log (#4 §5.2): who approved, rejected or deleted what, and when. action is
// 'approve' | 'reject' | 'delete_story' | 'delete_feedback', target_type 'story' | 'feedback'.
// Never holds content, titles or sessions, only the target's opaque id; rows outlive their target
// (a deleted story keeps its log) and are deleted by the retention job after 365 days.
export const adminEvents=sqliteTable('admin_events',{id:integer('id').primaryKey(),adminEmail:text('admin_email').notNull(),action:text('action').notNull(),targetType:text('target_type').notNull(),targetId:text('target_id').notNull(),created:integer('created').notNull()},(t)=>[index('admin_events_created_idx').on(t.created)]);
