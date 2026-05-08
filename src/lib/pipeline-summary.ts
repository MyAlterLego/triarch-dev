import { db } from '@/lib/db';
import { releaseLogs } from '@/db/schema';
import { sql, inArray } from 'drizzle-orm';

export type PipelineState = 'parity' | 'dev-ahead' | 'inverted';

export interface WhatChangedSummary {
  totalEntries: number;
  fixes: number;
  features: number;
  other: number;
  oneliner: string; // "N entries since prod: A fixes, B features, C other"
}

export interface PipelineSummary {
  projectKey: string;
  prodVersion: string | null;
  prodDeployedAt: string | null;     // ISO; uses COALESCE(deployed_at, released_at)
  devVersion: string | null;
  devDeployedAt: string | null;      // ISO; uses COALESCE(deployed_at, released_at)
  pendingApprovalCount: number;
  pipelineState: PipelineState;
  whatChangedOneliner: string | null; // null when parity; "dev behind prod" when inverted; full breakdown when dev-ahead
}

export async function getProjectPipelineSummaries(
  projectKeys: string[] | null,
): Promise<PipelineSummary[]> {
  throw new Error('NOT_IMPLEMENTED');
}
