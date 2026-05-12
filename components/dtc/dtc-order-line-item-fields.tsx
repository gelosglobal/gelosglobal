'use client'

import { useState } from 'react'
import { Check, ChevronsUpDown, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { formatGhs } from '@/lib/dtc-orders'
import { cn } from '@/lib/utils'

export type DtcInventoryPickerRow = {
  id: string
  sku: string
  name: string
  warehouse: string
  priceGhs: number | null
  onHand: number
}

export function normalizeDtcInventoryPickerRows(raw: unknown[]): DtcInventoryPickerRow[] {
  const normalized: DtcInventoryPickerRow[] = []
  for (const x of raw) {
    if (!x || typeof x !== 'object') continue
    const o = x as Record<string, unknown>
    const id = typeof o.id === 'string' ? o.id : ''
    const sku = typeof o.sku === 'string' ? o.sku : ''
    const name = typeof o.name === 'string' ? o.name : ''
    if (!id || !sku) continue
    const warehouse = typeof o.warehouse === 'string' ? o.warehouse : ''
    const priceGhs =
      typeof o.priceGhs === 'number' && Number.isFinite(o.priceGhs) ? o.priceGhs : null
    const onHand =
      typeof o.onHand === 'number' && Number.isFinite(o.onHand) ? Math.max(0, o.onHand) : 0
    normalized.push({ id, sku, name, warehouse, priceGhs, onHand })
  }
  normalized.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
  return normalized
}

export const INV_PICK_NONE = '__none__'
export const INV_PICK_CUSTOM = '__custom__'

export type DtcOrderLineDraftItem = {
  pick: string
  sku: string
  name: string
  qty: string
  unitPrice: string
  /** From a saved order when `pick` is custom but the line is still tied to `dtc_inventory`. */
  inventoryItemId?: string
}

export function emptyDraftItem(): DtcOrderLineDraftItem {
  return { pick: INV_PICK_NONE, sku: '', name: '', qty: '1', unitPrice: '' }
}

const MONGO_OBJECT_ID_HEX = /^[a-f\d]{24}$/i

/** When `pick` is a DTC inventory row id from the catalog picker, return it for order API payloads. */
export function inventoryItemIdFromDraftPick(pick: string): string | undefined {
  if (pick === INV_PICK_NONE || pick === INV_PICK_CUSTOM) return undefined
  if (MONGO_OBJECT_ID_HEX.test(pick)) return pick
  return undefined
}

/** Prefer picker id (`pick`); otherwise a stored id from a loaded order (manual row still linked to stock). */
export function inventoryItemIdForOrderPayload(line: DtcOrderLineDraftItem): string | undefined {
  const fromPick = inventoryItemIdFromDraftPick(line.pick)
  if (fromPick) return fromPick
  const sid = line.inventoryItemId?.trim()
  if (sid && MONGO_OBJECT_ID_HEX.test(sid)) return sid
  return undefined
}

export function applyInventoryPick(
  prev: DtcOrderLineDraftItem,
  value: string,
  catalog: DtcInventoryPickerRow[],
): DtcOrderLineDraftItem {
  if (value === INV_PICK_NONE) {
    return { ...prev, pick: INV_PICK_NONE, sku: '', name: '', unitPrice: '', inventoryItemId: undefined }
  }
  if (value === INV_PICK_CUSTOM) {
    return { ...prev, pick: INV_PICK_CUSTOM, inventoryItemId: undefined }
  }
  const row = catalog.find((r) => r.id === value)
  if (!row) return { ...prev, pick: INV_PICK_CUSTOM, inventoryItemId: undefined }
  const price =
    row.priceGhs != null && Number.isFinite(row.priceGhs) && row.priceGhs > 0
      ? String(row.priceGhs)
      : ''
  return {
    pick: row.id,
    sku: row.sku,
    name: row.name,
    qty: prev.qty,
    unitPrice: price || prev.unitPrice,
    inventoryItemId: row.id,
  }
}

export function DtcOrderLineItemFields({
  idx,
  item,
  catalog,
  idPrefix,
  onPickChange,
  onItemPatch,
  onRemove,
  disableRemove,
  pickerCopy,
}: {
  idx: number
  item: DtcOrderLineDraftItem
  catalog: DtcInventoryPickerRow[]
  idPrefix: string
  onPickChange: (idx: number, value: string) => void
  onItemPatch: (idx: number, patch: Partial<DtcOrderLineDraftItem>) => void
  onRemove: (idx: number) => void
  disableRemove: boolean
  /** Override default “DTC inventory” strings (e.g. B2B → retail stock). */
  pickerCopy?: {
    productPickerLabel?: string
    triggerPlaceholder?: string
    emptyCatalogText?: string
    emptyCatalogHint?: string
    catalogGroupHeading?: string
  }
}) {
  const [pickerOpen, setPickerOpen] = useState(false)

  const pc = {
    productPickerLabel: pickerCopy?.productPickerLabel ?? 'Product (DTC inventory)',
    triggerPlaceholder:
      pickerCopy?.triggerPlaceholder ?? 'Search or pick a DTC inventory product…',
    emptyCatalogText: pickerCopy?.emptyCatalogText ?? 'No products match your search.',
    emptyCatalogHint:
      pickerCopy?.emptyCatalogHint ??
      'No DTC inventory loaded. Add SKUs under DTC Inventory, then use Refresh on this page.',
    catalogGroupHeading: pickerCopy?.catalogGroupHeading ?? 'DTC inventory',
  }

  const selectedRow =
    item.pick !== INV_PICK_NONE && item.pick !== INV_PICK_CUSTOM
      ? catalog.find((r) => r.id === item.pick)
      : undefined
  const fromInventory = Boolean(selectedRow)
  const showManualFields = !fromInventory

  const triggerSummary = (() => {
    if (fromInventory && selectedRow) {
      return (
        <span className="min-w-0 flex-1 truncate text-left">
          <span className="font-medium">{selectedRow.name}</span>
          <span className="text-muted-foreground"> · {selectedRow.sku}</span>
        </span>
      )
    }
    if (item.pick === INV_PICK_CUSTOM && (item.name.trim() || item.sku.trim())) {
      return (
        <span className="min-w-0 flex-1 truncate text-left">
          <span className="text-muted-foreground">Manual · </span>
          {item.name.trim() || item.sku.trim()}
        </span>
      )
    }
    if (item.name.trim()) {
      return <span className="min-w-0 flex-1 truncate text-left">{item.name.trim()}</span>
    }
    return (
      <span className="min-w-0 flex-1 truncate text-left text-muted-foreground">
        {pc.triggerPlaceholder}
      </span>
    )
  })()

  return (
    <div className="rounded-lg border border-border p-3">
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-item-pick-${idx}`}>{pc.productPickerLabel}</Label>
        <Popover open={pickerOpen} onOpenChange={setPickerOpen} modal={false}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              role="combobox"
              aria-expanded={pickerOpen}
              id={`${idPrefix}-item-pick-${idx}`}
              className="h-auto min-h-9 w-full justify-between gap-2 py-2 font-normal"
            >
              {triggerSummary}
              <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            className="z-[300] w-[min(100vw-2rem,var(--radix-popover-trigger-width))] max-w-[min(420px,calc(100vw-2rem))] p-0"
            onOpenAutoFocus={(e) => e.preventDefault()}
          >
            <Command>
              <CommandInput placeholder="Search product name or SKU…" />
              <CommandList className="max-h-[280px]">
                <CommandEmpty>
                  {catalog.length === 0 ? pc.emptyCatalogHint : pc.emptyCatalogText}
                </CommandEmpty>
                <CommandGroup heading={pc.catalogGroupHeading}>
                  {catalog.map((row) => (
                    <CommandItem
                      key={row.id}
                      value={`${row.name} ${row.sku} ${row.warehouse}`}
                      keywords={[row.sku, row.name, row.warehouse]}
                      onSelect={() => {
                        onPickChange(idx, row.id)
                        setPickerOpen(false)
                      }}
                    >
                      <Check
                        className={cn(
                          'h-4 w-4 shrink-0',
                          item.pick === row.id ? 'opacity-100' : 'opacity-0',
                        )}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{row.name}</p>
                        <p className="truncate font-mono text-xs text-muted-foreground">
                          {row.sku}
                          {row.warehouse ? ` · ${row.warehouse}` : ''}
                          {Number.isFinite(row.onHand) ? ` · ${row.onHand} on hand` : ''}
                        </p>
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
                <CommandSeparator />
                <CommandGroup heading="Other">
                  <CommandItem
                    value="manual other entry custom line not in list"
                    onSelect={() => {
                      onPickChange(idx, INV_PICK_CUSTOM)
                      setPickerOpen(false)
                    }}
                  >
                    Other (manual entry)
                  </CommandItem>
                  <CommandItem
                    value="clear reset blank selection"
                    onSelect={() => {
                      onPickChange(idx, INV_PICK_NONE)
                      setPickerOpen(false)
                    }}
                  >
                    Clear selection
                  </CommandItem>
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>

      {fromInventory && selectedRow ? (
        <div className="mt-3 rounded-md bg-muted/40 px-3 py-2 text-sm">
          <p className="font-medium text-foreground">{selectedRow.name}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            SKU{' '}
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground">
              {selectedRow.sku}
            </code>
            {selectedRow.warehouse ? (
              <>
                {' '}
                · <span>{selectedRow.warehouse}</span>
              </>
            ) : null}
            {Number.isFinite(selectedRow.onHand) ? (
              <>
                {' '}
                · On hand: <span className="tabular-nums">{selectedRow.onHand}</span>
              </>
            ) : null}
          </p>
        </div>
      ) : null}

      {showManualFields ? (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor={`${idPrefix}-item-name-${idx}`}>Item name</Label>
            <Input
              id={`${idPrefix}-item-name-${idx}`}
              value={item.name}
              onChange={(e) => onItemPatch(idx, { name: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${idPrefix}-item-sku-${idx}`}>SKU (optional)</Label>
            <Input
              id={`${idPrefix}-item-sku-${idx}`}
              value={item.sku}
              onChange={(e) => onItemPatch(idx, { sku: e.target.value })}
            />
          </div>
        </div>
      ) : null}

      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-item-qty-${idx}`}>Qty</Label>
          <Input
            id={`${idPrefix}-item-qty-${idx}`}
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            value={item.qty}
            onChange={(e) => onItemPatch(idx, { qty: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-item-unit-${idx}`}>Unit price (GHS)</Label>
          <Input
            id={`${idPrefix}-item-unit-${idx}`}
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            value={item.unitPrice}
            onChange={(e) => onItemPatch(idx, { unitPrice: e.target.value })}
          />
        </div>
        <div className="flex items-end justify-between gap-2">
          <div className="text-sm text-muted-foreground">
            <span className="block">Line total</span>
            <span className="font-medium text-foreground">
              {(() => {
                const q = Number.parseInt(item.qty, 10)
                const u = Number.parseFloat(item.unitPrice)
                if (!Number.isFinite(q) || !Number.isFinite(u)) return '—'
                return formatGhs(q * u)
              })()}
            </span>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => onRemove(idx)}
            disabled={disableRemove}
            aria-label="Remove item"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
