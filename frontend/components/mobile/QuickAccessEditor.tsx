'use client';

import { useState } from 'react';
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  arrayMove,
  useSortable,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Star, FolderInput, FolderMinus, FolderPlus, X, Check } from 'lucide-react';
import type { NavItem } from '@/lib/navConfig';
import type { QuickAccessConfig, QuickAccessFolder } from '@/types';

const MAX_PINNED = 4;
const FOLDER_COLORS = ['#0D59E7', '#18C15E', '#F39C12', '#00B4DB', '#6474BB', '#EF4444'];

function SortableRow({
  item,
  children,
}: {
  item: NavItem;
  children: (handleProps: { attributes: any; listeners: any }) => React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.href });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <div ref={setNodeRef} style={style} className="qa-row">
      {children({ attributes, listeners })}
    </div>
  );
}

function Row({
  item,
  handleProps,
  menuOpen,
  onToggleMenu,
  menu,
}: {
  item: NavItem;
  handleProps: { attributes: any; listeners: any };
  menuOpen: boolean;
  onToggleMenu: () => void;
  menu: React.ReactNode;
}) {
  const Icon = item.icon;
  return (
    <>
      <button type="button" className="qa-drag-handle" {...handleProps.attributes} {...handleProps.listeners} aria-label="Reordenar">
        <GripVertical size={16} />
      </button>
      <span className="qa-row-icon" style={{ background: `${item.color}1F`, color: item.color }}>
        <Icon size={16} />
      </span>
      <span className="qa-row-label">{item.label}</span>
      <div className="qa-row-actions">
        {/* stopPropagation: el contenedor raiz (.qa-editor) cierra
            cualquier menu abierto con un onClick propio (closeMenu) para
            poder tocar afuera y cerrarlo -- sin cortar la propagacion aca,
            ese mismo click "subia" hasta la raiz en la misma pasada y
            deshacia el toggle: el menu se abria y cerraba en el mismo tap,
            como si el boton no hiciera nada. */}
        <button
          type="button"
          className="qa-icon-btn"
          onClick={(e) => { e.stopPropagation(); onToggleMenu(); }}
          aria-label="Opciones"
        >
          <FolderInput size={15} />
        </button>
        {menuOpen && menu}
      </div>
    </>
  );
}

function useSensorsSetup() {
  return useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
}

export default function QuickAccessEditor({
  allItems,
  initial,
  onSave,
  onCancel,
}: {
  allItems: NavItem[];
  initial: QuickAccessConfig;
  onSave: (config: QuickAccessConfig) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<QuickAccessConfig>(initial);
  const [menuOpenFor, setMenuOpenFor] = useState<string | null>(null);
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const sensors = useSensorsSetup();

  const byHref = new Map(allItems.map((item) => [item.href, item]));
  const pinnedItems = draft.pinned.map((href) => byHref.get(href)).filter(Boolean) as NavItem[];
  const looseItems = draft.loose.map((href) => byHref.get(href)).filter(Boolean) as NavItem[];

  const closeMenu = () => setMenuOpenFor(null);

  function removeFromEverywhere(config: QuickAccessConfig, href: string): QuickAccessConfig {
    return {
      pinned: config.pinned.filter((h) => h !== href),
      folders: config.folders.map((f) => ({ ...f, items: f.items.filter((h) => h !== href) })),
      loose: config.loose.filter((h) => h !== href),
    };
  }

  function pin(href: string) {
    if (draft.pinned.length >= MAX_PINNED) return;
    setDraft((d) => {
      const cleaned = removeFromEverywhere(d, href);
      return { ...cleaned, pinned: [...cleaned.pinned, href] };
    });
    closeMenu();
  }

  function unpin(href: string) {
    setDraft((d) => {
      const cleaned = removeFromEverywhere(d, href);
      return { ...cleaned, loose: [...cleaned.loose, href] };
    });
    closeMenu();
  }

  function removeFromFolder(href: string) {
    setDraft((d) => {
      const cleaned = removeFromEverywhere(d, href);
      return { ...cleaned, loose: [...cleaned.loose, href] };
    });
    closeMenu();
  }

  function moveToFolder(href: string, folderId: string) {
    setDraft((d) => {
      const cleaned = removeFromEverywhere(d, href);
      return {
        ...cleaned,
        folders: cleaned.folders.map((f) => (f.id === folderId ? { ...f, items: [...f.items, href] } : f)),
      };
    });
    closeMenu();
  }

  function createFolderAndMove(href: string) {
    const name = newFolderName.trim();
    if (!name) return;
    const folder: QuickAccessFolder = {
      id: `f_${Date.now().toString(36)}`,
      name,
      color: FOLDER_COLORS[draft.folders.length % FOLDER_COLORS.length],
      items: [],
    };
    setDraft((d) => {
      const cleaned = removeFromEverywhere(d, href);
      return { ...cleaned, folders: [...cleaned.folders, { ...folder, items: [href] }] };
    });
    setNewFolderName('');
    setNewFolderOpen(false);
    closeMenu();
  }

  function deleteFolder(folderId: string) {
    setDraft((d) => {
      const folder = d.folders.find((f) => f.id === folderId);
      if (!folder) return d;
      return {
        ...d,
        folders: d.folders.filter((f) => f.id !== folderId),
        loose: [...d.loose, ...folder.items],
      };
    });
  }

  function handlePinnedDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    setDraft((d) => {
      const oldIndex = d.pinned.indexOf(String(active.id));
      const newIndex = d.pinned.indexOf(String(over.id));
      if (oldIndex < 0 || newIndex < 0) return d;
      return { ...d, pinned: arrayMove(d.pinned, oldIndex, newIndex) };
    });
  }

  function handleLooseDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    setDraft((d) => {
      const oldIndex = d.loose.indexOf(String(active.id));
      const newIndex = d.loose.indexOf(String(over.id));
      if (oldIndex < 0 || newIndex < 0) return d;
      return { ...d, loose: arrayMove(d.loose, oldIndex, newIndex) };
    });
  }

  function handleFolderDragEnd(folderId: string, e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    setDraft((d) => ({
      ...d,
      folders: d.folders.map((f) => {
        if (f.id !== folderId) return f;
        const oldIndex = f.items.indexOf(String(active.id));
        const newIndex = f.items.indexOf(String(over.id));
        if (oldIndex < 0 || newIndex < 0) return f;
        return { ...f, items: arrayMove(f.items, oldIndex, newIndex) };
      }),
    }));
  }

  function renderMenu(item: NavItem, opts: { pinned: boolean; folderId?: string }) {
    return (
      <div className="qa-menu" onClick={(e) => e.stopPropagation()}>
        {!opts.pinned && draft.pinned.length < MAX_PINNED && (
          <button type="button" className="qa-menu-item" onClick={() => pin(item.href)}>
            <Star size={14} /> Fijar abajo
          </button>
        )}
        {opts.pinned && (
          <button type="button" className="qa-menu-item" onClick={() => unpin(item.href)}>
            <Star size={14} /> Quitar de fijos
          </button>
        )}
        {opts.folderId && (
          <button type="button" className="qa-menu-item" onClick={() => removeFromFolder(item.href)}>
            <FolderMinus size={14} /> Sacar de carpeta
          </button>
        )}
        {!opts.folderId &&
          draft.folders.map((folder) => (
            <button key={folder.id} type="button" className="qa-menu-item" onClick={() => moveToFolder(item.href, folder.id)}>
              <FolderInput size={14} /> Mover a &quot;{folder.name}&quot;
            </button>
          ))}
        {!opts.folderId && (
          <button
            type="button"
            className="qa-menu-item"
            onClick={() => {
              setNewFolderOpen(true);
              setMenuOpenFor(`new-folder-for:${item.href}`);
            }}
          >
            <FolderPlus size={14} /> Nueva carpeta…
          </button>
        )}
        {menuOpenFor === `new-folder-for:${item.href}` && newFolderOpen && (
          <div className="qa-new-folder-row" onClick={(e) => e.stopPropagation()}>
            <input
              autoFocus
              type="text"
              placeholder="Nombre de la carpeta"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
            />
            <button type="button" className="qa-icon-btn active" onClick={() => createFolderAndMove(item.href)} aria-label="Crear">
              <Check size={16} />
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="qa-editor" onClick={closeMenu}>
      <div className="qa-section">
        <div className="qa-section-title">Fijos abajo ({pinnedItems.length}/{MAX_PINNED})</div>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handlePinnedDragEnd}>
          <SortableContext items={draft.pinned} strategy={verticalListSortingStrategy}>
            <div className="qa-list">
              {pinnedItems.map((item) => (
                <SortableRow key={item.href} item={item}>
                  {(handleProps) => (
                    <Row
                      item={item}
                      handleProps={handleProps}
                      menuOpen={menuOpenFor === item.href}
                      onToggleMenu={() => setMenuOpenFor((cur) => (cur === item.href ? null : item.href))}
                      menu={renderMenu(item, { pinned: true })}
                    />
                  )}
                </SortableRow>
              ))}
              {pinnedItems.length === 0 && <div className="qa-empty">Sin accesos fijos — elegí hasta {MAX_PINNED} desde &quot;Sueltos&quot;.</div>}
            </div>
          </SortableContext>
        </DndContext>
      </div>

      {draft.folders.map((folder) => {
        const folderItems = folder.items.map((href) => byHref.get(href)).filter(Boolean) as NavItem[];
        return (
          <div key={folder.id} className="qa-folder-block">
            <div className="qa-folder-header">
              <span className="qa-folder-name" style={{ color: folder.color }}>{folder.name}</span>
              <button type="button" className="qa-icon-btn" onClick={() => deleteFolder(folder.id)} aria-label="Eliminar carpeta">
                <X size={14} />
              </button>
            </div>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => handleFolderDragEnd(folder.id, e)}>
              <SortableContext items={folder.items} strategy={verticalListSortingStrategy}>
                <div className="qa-list">
                  {folderItems.map((item) => (
                    <SortableRow key={item.href} item={item}>
                      {(handleProps) => (
                        <Row
                          item={item}
                          handleProps={handleProps}
                          menuOpen={menuOpenFor === item.href}
                          onToggleMenu={() => setMenuOpenFor((cur) => (cur === item.href ? null : item.href))}
                          menu={renderMenu(item, { pinned: false, folderId: folder.id })}
                        />
                      )}
                    </SortableRow>
                  ))}
                  {folderItems.length === 0 && <div className="qa-empty">Carpeta vacía</div>}
                </div>
              </SortableContext>
            </DndContext>
          </div>
        );
      })}

      <div className="qa-section">
        <div className="qa-section-title">Sueltos</div>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleLooseDragEnd}>
          <SortableContext items={draft.loose} strategy={verticalListSortingStrategy}>
            <div className="qa-list">
              {looseItems.map((item) => (
                <SortableRow key={item.href} item={item}>
                  {(handleProps) => (
                    <Row
                      item={item}
                      handleProps={handleProps}
                      menuOpen={menuOpenFor === item.href}
                      onToggleMenu={() => setMenuOpenFor((cur) => (cur === item.href ? null : item.href))}
                      menu={renderMenu(item, { pinned: false })}
                    />
                  )}
                </SortableRow>
              ))}
            </div>
          </SortableContext>
        </DndContext>
      </div>

      <div className="qa-editor-footer">
        <button type="button" className="btn btn-ghost" onClick={onCancel}>Cancelar</button>
        <button type="button" className="btn btn-primary" onClick={() => onSave(draft)}>Guardar</button>
      </div>
    </div>
  );
}
