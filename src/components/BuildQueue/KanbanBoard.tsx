'use client';

/**
 * KanbanBoard — 4-column DnD board for the Build Queue.
 *
 * Ported from security-admin@7b133f1. CSS tokens inlined (see KanbanCard).
 *
 * Drag-and-drop wiring:
 *   - Each card is `useDraggable({id})` (in KanbanCard).
 *   - Each column is `useDroppable({id})` here.
 *   - On drop, we PATCH the row to the column's mapped status value via
 *     the parent-provided `onStatusChange` callback.
 *
 * The bucket→status mapping is intentionally per-type because bug and
 * feature status taxonomies don't share vocab (bugs go 'fixed', features
 * go 'shipped'). Dragging into "Backlog" maps to 'deferred' for bugs
 * and 'reviewed' for features so the row exits 'submitted' without
 * promising delivery.
 */
import React, { useState } from 'react';
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  useDroppable,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { KanbanCard, BuildQueueItem } from './KanbanCard';
import { BuildQueueFilters } from './BuildQueueFilters';

export interface BuildQueueResponse {
  backlog: BuildQueueItem[];
  next_release: BuildQueueItem[];
  in_progress: BuildQueueItem[];
  done: BuildQueueItem[];
}

interface KanbanBoardProps {
  data: BuildQueueResponse;
  selectedProject: string;
  onProjectChange: (project: string) => void;
  selectedVersion: string;
  onVersionChange: (version: string) => void;
  onStatusChange: (id: string, type: 'bug' | 'feature', newStatus: string) => Promise<void>;
  onVersionItemChange: (id: string, type: 'bug' | 'feature', version: string) => Promise<void>;
  onBulkStatusChange: (ids: string[], type: 'bug' | 'feature', status: string) => Promise<void>;
  onBulkVersionChange: (ids: string[], type: 'bug' | 'feature', version: string) => Promise<void>;
  onApprove?: (item: BuildQueueItem) => void;
}

// ── Inline color tokens (see KanbanCard) ───────────────────────────────────
const BG_SURFACE = '#15151a';
const BG_ELEVATED = '#1a1a1e';
const TEXT_MUTED = '#9a8e6b';
const BORDER = 'rgba(212, 160, 41, 0.2)';
const ACCENT_TEAL = '#00e5b4';
const ACCENT_BLUE = '#60a5fa';
const WARNING = '#f59e0b';
const SUCCESS = '#34d399';

// ── Column config ──────────────────────────────────────────────────────────
const COLUMNS: { id: keyof BuildQueueResponse; label: string; color: string }[] = [
  { id: 'backlog', label: 'Backlog', color: TEXT_MUTED },
  { id: 'next_release', label: 'Next Release', color: ACCENT_BLUE },
  { id: 'in_progress', label: 'In Progress', color: WARNING },
  { id: 'done', label: 'Done', color: SUCCESS },
];

// Map column id → status value for each item type. See class header for rationale.
function getNewStatus(columnId: keyof BuildQueueResponse, type: 'bug' | 'feature'): string {
  switch (columnId) {
    case 'backlog':
      return type === 'bug' ? 'deferred' : 'reviewed';
    case 'next_release':
      return 'approved';
    case 'in_progress':
      return 'in_progress';
    case 'done':
      return type === 'bug' ? 'fixed' : 'shipped';
  }
}

// ── Droppable column ───────────────────────────────────────────────────────

interface DroppableColumnProps {
  id: keyof BuildQueueResponse;
  label: string;
  color: string;
  items: BuildQueueItem[];
  selectedItems: string[];
  onSelect: (id: string, checked: boolean) => void;
  onVersionChange: (id: string, version: string) => void;
  onApprove?: (item: BuildQueueItem) => void;
}

function DroppableColumn({
  id,
  label,
  color,
  items,
  selectedItems,
  onSelect,
  onVersionChange,
  onApprove,
}: DroppableColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id });

  return (
    <div
      ref={setNodeRef}
      style={{
        display: 'flex',
        flexDirection: 'column',
        minWidth: 0,
        background: isOver ? 'rgba(0,229,180,0.04)' : BG_SURFACE,
        borderRadius: '10px',
        border: `1px solid ${isOver ? ACCENT_TEAL : BORDER}`,
        transition: 'border-color 0.15s, background 0.15s',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          padding: '12px 14px',
          borderLeft: `4px solid ${color}`,
          borderBottom: `1px solid ${BORDER}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: BG_ELEVATED,
        }}
      >
        <span
          style={{
            fontSize: '12px',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color,
          }}
        >
          {label}
        </span>
        <span
          style={{
            fontSize: '11px',
            padding: '1px 7px',
            borderRadius: '10px',
            background: `${color}22`,
            color,
            fontWeight: 600,
          }}
        >
          {items.length}
        </span>
      </div>

      <div
        style={{
          padding: '12px',
          flex: 1,
          overflowY: 'auto',
          maxHeight: 'calc(100vh - 260px)',
          minHeight: '120px',
        }}
      >
        {items.length === 0 && (
          <div style={{ textAlign: 'center', color: TEXT_MUTED, fontSize: '12px', paddingTop: '24px' }}>
            No items
          </div>
        )}
        {items.map((item) => (
          <KanbanCard
            key={item.id}
            item={item}
            selected={selectedItems.includes(item.id)}
            onSelect={onSelect}
            onVersionChange={onVersionChange}
            onApprove={onApprove}
          />
        ))}
      </div>
    </div>
  );
}

// ── KanbanBoard ────────────────────────────────────────────────────────────

export function KanbanBoard({
  data,
  selectedProject,
  onProjectChange,
  selectedVersion,
  onVersionChange,
  onStatusChange,
  onVersionItemChange,
  onBulkStatusChange,
  onBulkVersionChange,
  onApprove,
}: KanbanBoardProps) {
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [activeItem, setActiveItem] = useState<BuildQueueItem | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const allItems: BuildQueueItem[] = [
    ...data.backlog,
    ...data.next_release,
    ...data.in_progress,
    ...data.done,
  ];

  function findItemById(id: string): BuildQueueItem | undefined {
    return allItems.find((i) => i.id === id);
  }

  function handleSelect(id: string, checked: boolean) {
    setSelectedItems((prev) => (checked ? [...prev, id] : prev.filter((x) => x !== id)));
  }

  function handleDragStart(event: { active: { id: string | number } }) {
    const item = findItemById(String(event.active.id));
    setActiveItem(item ?? null);
  }

  async function handleDragEnd(event: DragEndEvent) {
    setActiveItem(null);
    const { active, over } = event;
    if (!over) return;
    const itemId = String(active.id);
    const columnId = String(over.id) as keyof BuildQueueResponse;
    const item = findItemById(itemId);
    if (!item) return;
    const currentColumn = COLUMNS.find((c) => data[c.id].some((i) => i.id === itemId))?.id;
    if (currentColumn === columnId) return;
    const newStatus = getNewStatus(columnId, item.type);
    await onStatusChange(item.id, item.type, newStatus);
  }

  function handleVersionChange(id: string, version: string) {
    const item = findItemById(id);
    if (!item) return;
    onVersionItemChange(id, item.type, version);
  }

  async function handleBulkStatusChange(status: string) {
    const bugs = selectedItems.filter((id) => findItemById(id)?.type === 'bug');
    const features = selectedItems.filter((id) => findItemById(id)?.type === 'feature');
    if (bugs.length) await onBulkStatusChange(bugs, 'bug', status);
    if (features.length) await onBulkStatusChange(features, 'feature', status);
    setSelectedItems([]);
  }

  async function handleBulkVersionChange(version: string) {
    const bugs = selectedItems.filter((id) => findItemById(id)?.type === 'bug');
    const features = selectedItems.filter((id) => findItemById(id)?.type === 'feature');
    if (bugs.length) await onBulkVersionChange(bugs, 'bug', version);
    if (features.length) await onBulkVersionChange(features, 'feature', version);
    setSelectedItems([]);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <BuildQueueFilters
        selectedProject={selectedProject}
        onProjectChange={onProjectChange}
        selectedVersion={selectedVersion}
        onVersionChange={onVersionChange}
        selectedItems={selectedItems}
        onBulkStatusChange={handleBulkStatusChange}
        onBulkVersionChange={handleBulkVersionChange}
      />

      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
          {COLUMNS.map((col) => (
            <DroppableColumn
              key={col.id}
              id={col.id}
              label={col.label}
              color={col.color}
              items={data[col.id]}
              selectedItems={selectedItems}
              onSelect={handleSelect}
              onVersionChange={handleVersionChange}
              onApprove={onApprove}
            />
          ))}
        </div>

        <DragOverlay>
          {activeItem && (
            <div style={{ opacity: 0.85, transform: 'scale(1.02)', pointerEvents: 'none' }}>
              <KanbanCard
                item={activeItem}
                selected={selectedItems.includes(activeItem.id)}
                onSelect={() => {}}
                onVersionChange={() => {}}
                onApprove={onApprove}
              />
            </div>
          )}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
