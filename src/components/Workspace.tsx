'use client';
import BrandMark from '@/components/BrandMark';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Leaf,
  LayoutDashboard,
  ArrowUpRight,
  Plus,
  Search,
  Bell,
  Menu,
  X,
  ChevronRight,
  ArrowRight,
  RefreshCw,
  ShieldCheck,
  Package,
  Truck,
  Warehouse,
  Users,
  Settings,
  LogOut,
  Download,
  AlertTriangle,
} from 'lucide-react';
import { workspaces, forms, type Field } from '@/lib/workspaces';
import { demoData, demoHarvests } from '@/lib/demo';
import { browserAuth } from '@/lib/supabase/client';
import FarmMap from './FarmMap';
import OptionComparison from './OptionComparison';
type Dialog = {
  title: string;
  endpoint: string;
  fields: Field[];
  initial?: Record<string, any>;
  method?: string;
};
const pretty = (s: string) =>
  s
    .replaceAll('_', ' ')
    .replaceAll('-', ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
const fmt = (x: any) => Number(x || 0).toLocaleString('en-NG', { maximumFractionDigits: 2 });
const money = (n: any) =>
  new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    maximumFractionDigits: 0,
  }).format(Number(n || 0) / 100);
async function api(path: string, body?: unknown, method = 'POST', key?: string) {
  const r = await fetch('/api/' + path, {
    method: body === undefined ? 'GET' : method,
    headers:
      body === undefined
        ? {}
        : { 'Content-Type': 'application/json', 'Idempotency-Key': key || crypto.randomUUID() },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = await r.json();
  if (!data.success) throw new Error(data.error?.message || 'Request failed');
  return data.data;
}
export default function Workspace({
  role,
  section,
  preview,
  platformRole,
}: {
  role: string;
  section: string;
  preview: boolean;
  platformRole: string;
}) {
  const router = useRouter(),
    workspace = workspaces[role],
    isAdmin = ['admin', 'super-admin'].includes(role);
  const [rows, setRows] = useState<any[]>([]),
    [summary, setSummary] = useState<any>({}),
    [catalogs, setCatalogs] = useState<Record<string, any[]>>({}),
    [message, setMessage] = useState(''),
    [loading, setLoading] = useState(true),
    [dialog, setDialog] = useState<Dialog | null>(null),
    [details, setDetails] = useState<any>(null),
    [filter, setFilter] = useState(''),
    [mobile, setMobile] = useState(false),
    [busy, setBusy] = useState(false),
    [cursor, setCursor] = useState<string | null>(null);
  const endpoint = useCallback(() => {
    if (
      isAdmin &&
      [
        'users',
        'organizations',
        'verification',
        'configuration',
        'audit',
        'outbox',
        'privacy',
      ].includes(section)
    )
      return 'admin/' + section;
    const map: Record<string, string> = {
      overview: role === 'operations' ? 'operations/overview' : 'harvests',
      risk: 'operations/overview',
      demand: 'buyer-requirements',
      matches: 'harvests',
      storage: role === 'farmer' ? 'storage/reservations' : 'directory/storage',
      logistics: 'directory/transport',
      vehicles: 'transport/vehicles',
      facilities: 'storage/facilities',
      reservations: 'storage/reservations',
      intake: 'storage/reservations',
      quotes: 'transport/quotes',
      shipments: 'transport/shipments',
      invoices: 'transport/shipments',
      requirements: 'buyer-requirements',
      saved_suppliers: 'saved-suppliers',
      reports: 'impact/summary',
      account: 'me',
      'quote-board': 'transport/requests',
    };
    return map[section] || section;
  }, [section, role, isAdmin]);
  const load = useCallback(async () => {
    setLoading(true);
    setMessage('');
    try {
      if (preview) {
        const key =
          section === 'overview'
            ? isAdmin
              ? 'organizations'
              : 'harvests'
            : section === 'storage'
              ? 'facilities'
              : section === 'logistics'
                ? 'vehicles'
                : section === 'demand'
                  ? 'requirements'
                  : section;
        setRows(demoData[key] || []);
        setSummary({
          available_kg: 4710,
          reserved_kg: 700,
          verified_transactions: 0,
          verified_sold_kg: 0,
          reported_lost_kg: 0,
        });
        setCatalogs({ organizations: demoData.organizations });
        return;
      }
      const [me, cat, result, stats] = await Promise.all([
        api('me'),
        api('catalogs'),
        api(endpoint()),
        api('impact/summary'),
      ]);
      setCatalogs({ ...cat, organizations: me.organizations });
      setRows(
        Array.isArray(result) ? result : section === 'catalogs' ? result.crops : result.items || [],
      );
      setCursor(result.nextCursor || null);
      setSummary(stats);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Unable to load workspace.');
    } finally {
      setLoading(false);
    }
  }, [preview, section, isAdmin, endpoint]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (!dialog && !details) return;
    const previous = document.activeElement as HTMLElement | null;
    const element = document.querySelector<HTMLElement>('[role="dialog"]');
    const first = element?.querySelector<HTMLElement>('button,input,select,textarea,a[href]');
    first?.focus();
    function key(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setDialog(null);
        setDetails(null);
      }
      if (e.key === 'Tab' && element) {
        const nodes = Array.from(
          element.querySelectorAll<HTMLElement>(
            'button:not(:disabled),input,select,textarea,a[href]',
          ),
        );
        const first = nodes[0],
          last = nodes[nodes.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    }
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('keydown', key);
      previous?.focus();
    };
  }, [dialog, details]);
  async function openForm(key: string, initial?: Record<string, any>) {
    const form = forms[key];
    if (!form) return;
    setDialog({ ...form, initial });
    if (!preview) {
      try {
        const extra: Record<string, any[]> = {};
        for (const source of [...new Set(form.fields.map((f) => f.source).filter(Boolean))])
          if (source && !catalogs[source]) {
            const ep =
              source === 'facilities'
                ? 'directory/storage'
                : source === 'vehicles'
                  ? 'transport/vehicles'
                  : source === 'requirements'
                    ? 'buyer-requirements'
                    : source;
            const d = await api(ep);
            extra[source] = Array.isArray(d) ? d : d.items || [];
          }
        setCatalogs((c) => ({ ...c, ...extra }));
      } catch (e) {
        setMessage(String(e));
      }
    }
  }
  async function mutate(path: string, body: unknown = {}, method = 'POST') {
    if (preview) {
      setMessage('Read-only preview. Add Supabase credentials to perform real operations.');
      return;
    }
    setBusy(true);
    try {
      const result = await api(path, body, method);
      setDialog(null);
      await load();
      setMessage('Operation recorded successfully.');
      if (result?.token)
        setDetails({
          invitation_token: result.token,
          instructions:
            'Share this token privately with the invited email address. Expires in seven days.',
        });
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Operation failed.');
    } finally {
      setBusy(false);
    }
  }
  function actionForm(
    title: string,
    endpoint: string,
    fields: Field[],
    initial?: Record<string, any>,
    method = 'POST',
  ) {
    setDialog({ title, endpoint, fields, initial, method });
  }
  async function inspect(row: any) {
    if (['harvests', 'matches', 'risk', 'overview'].includes(section) && row.crop) {
      if (preview) {
        setDetails({
          ...row,
          assumptions: ['Fictional preview data. Prototype urgency is not spoilage probability.'],
        });
        return;
      }
      try {
        const [risk, matches] = await Promise.all([
          api('harvests/' + row.id + '/risk'),
          api('harvests/' + row.id + '/matches'),
        ]);
        setDetails({ harvest: row, risk, matches });
      } catch (e) {
        setMessage(String(e));
      }
    } else setDetails(row);
  }
  const commonCreate =
    section === 'storage' ? 'reservations' : section === 'intake' ? 'reservations' : section;
  const visibleRows = rows.filter((r) =>
    JSON.stringify(r).toLowerCase().includes(filter.toLowerCase()),
  );
  const preferred: Record<string, string[]> = {
    harvests: ['crop', 'grade', 'available_kg', 'reserved_kg', 'sold_kg', 'lost_kg', 'status'],
    risk: ['crop', 'grade', 'estimated_harvest_date', 'score', 'level', 'last_evaluated_at'],
    marketplace: ['crop', 'supplier', 'grade', 'region', 'available_kg', 'price_minor'],
    users: ['full_name', 'platform_role', 'region', 'status'],
    offers: ['quantity_kg', 'price_minor', 'expires_at', 'status'],
    orders: ['status', 'total_minor', 'received_kg', 'receipt_verified', 'created_at'],
  };
  const columns = rows.length
    ? preferred[section] ||
      Object.keys(rows[0])
        .filter(
          (k) =>
            ![
              'id',
              'organization_id',
              'seller_organization_id',
              'buyer_organization_id',
              'created_by',
              'location',
              'photos',
              'factors',
              'weights',
              'thresholds',
              'before_data',
              'after_data',
              'token_hash',
            ].includes(k) && !k.endsWith('_id'),
        )
        .slice(0, 6)
    : [];
  function actions(row: any) {
    return (
      <div className="row-actions">
        <button onClick={() => inspect(row)} aria-label="View record details">
          View <ArrowUpRight size={13} />
        </button>
        {section === 'harvests' && (
          <>
            {row.status === 'draft' ? (
              <>
                <button onClick={() => mutate('harvests/' + row.id + '/publish')}>Publish</button>
                <button
                  onClick={() =>
                    actionForm(
                      'Edit harvest draft',
                      'harvests/' + row.id,
                      [
                        { key: 'version', label: 'Version', type: 'number' },
                        { key: 'grade', label: 'Grade' },
                        { key: 'total_quantity', label: 'Reported quantity', type: 'number' },
                        {
                          key: 'measured_kg',
                          label: 'Measured kg',
                          type: 'number',
                          required: false,
                        },
                        { key: 'estimated_harvest_date', label: 'Harvest date', type: 'date' },
                        {
                          key: 'available_until',
                          label: 'Collection deadline',
                          type: 'datetime-local',
                        },
                      ],
                      row,
                      'PATCH',
                    )
                  }
                >
                  Edit draft
                </button>
              </>
            ) : (
              <>
                <button onClick={() => mutate('harvests/' + row.id + '/risk')}>Reassess</button>
                <button
                  onClick={() =>
                    actionForm(
                      'Update harvest conditions',
                      'harvests/' + row.id,
                      [
                        {
                          key: 'version',
                          label: 'Record version',
                          type: 'number',
                          value: row.version,
                        },
                        {
                          key: 'storage_adequacy',
                          label: 'Storage adequacy (0–100)',
                          type: 'number',
                        },
                        { key: 'delay_hours', label: 'Delay hours', type: 'number' },
                        { key: 'condition_risk', label: 'Condition risk (0–100)', type: 'number' },
                      ],
                      row,
                      'PATCH',
                    )
                  }
                >
                  Update
                </button>
              </>
            )}
          </>
        )}
        {['vehicles', 'facilities', 'farms', 'requirements'].includes(section) && (
          <button
            onClick={() =>
              actionForm(
                'Update ' + section,
                section === 'vehicles'
                  ? 'transport/vehicles/' + row.id
                  : section === 'facilities'
                    ? 'storage/facilities/' + row.id
                    : section + '/' + row.id,
                section === 'requirements'
                  ? [
                      { key: 'status', label: 'Demand status', options: ['open', 'closed'] },
                      { key: 'quantity_kg', label: 'Required mass (kg)', type: 'number' },
                      { key: 'max_price_minor', label: 'Maximum price (kobo/kg)', type: 'number' },
                    ]
                  : section === 'farms'
                    ? [
                        { key: 'name', label: 'Farm name' },
                        { key: 'address_description', label: 'Approximate location' },
                      ]
                    : [
                        { key: 'name', label: 'Name' },
                        { key: 'capacity_kg', label: 'Capacity (kg)', type: 'number' },
                        { key: 'available_from', label: 'Available from', type: 'datetime-local' },
                        {
                          key: 'available_until',
                          label: 'Available until',
                          type: 'datetime-local',
                        },
                      ],
                row,
                'PATCH',
              )
            }
          >
            Edit
          </button>
        )}
        {section === 'marketplace' && (
          <button onClick={() => openForm('offers', { lot_id: row.lot_id })}>Make offer</button>
        )}
        {section === 'offers' &&
          row.status === 'pending' &&
          ['farmer', 'cooperative', 'operations'].includes(role) && (
            <>
              <button onClick={() => mutate('offers/' + row.id + '/accept')}>Accept</button>
              <button onClick={() => mutate('offers/' + row.id + '/reject')}>Reject</button>
              <button
                onClick={() =>
                  actionForm('Propose counteroffer', 'offers/' + row.id + '/counter', [
                    { key: 'price_minor', label: 'Price per kg (kobo)', type: 'number' },
                    { key: 'quantity_kg', label: 'Quantity (kg)', type: 'number' },
                    { key: 'expires_at', label: 'Deadline', type: 'datetime-local' },
                  ])
                }
              >
                Counter
              </button>
            </>
          )}
        {section === 'offers' && row.status === 'countered' && role === 'buyer' && (
          <button
            onClick={() =>
              openForm('offers', { ...row, ...row.counter_terms, parent_offer_id: row.id })
            }
          >
            Respond to counter
          </button>
        )}
        {section === 'orders' && (
          <>
            {['confirmed', 'delivered'].includes(row.status) && role === 'buyer' && (
              <button
                onClick={() =>
                  actionForm('Confirm delivery receipt', 'orders/' + row.id + '/confirm-receipt', [
                    { key: 'received_kg', label: 'Received quantity (kg)', type: 'number' },
                    {
                      key: 'rejected_kg',
                      label: 'Rejected quantity (kg)',
                      type: 'number',
                      value: 0,
                    },
                    { key: 'grade', label: 'Received grade' },
                    { key: 'evidence', label: 'Receipt evidence' },
                  ])
                }
              >
                Receive
              </button>
            )}
            {row.status === 'confirmed' && (
              <button
                onClick={() =>
                  actionForm('Cancel before dispatch', 'orders/' + row.id + '/cancel', [
                    { key: 'reason', label: 'Cancellation reason', type: 'textarea' },
                  ])
                }
              >
                Cancel
              </button>
            )}
            {['coordinator', 'admin', 'super_admin'].includes(platformRole) &&
              ['received', 'disputed'].includes(row.status) &&
              !row.receipt_verified && (
                <button
                  onClick={() =>
                    actionForm(
                      'Independently verify receipt',
                      'orders/' + row.id + '/verify-receipt',
                      [
                        {
                          key: 'transport_minor',
                          label: 'Actual transport cost (kobo)',
                          type: 'number',
                          required: false,
                        },
                        {
                          key: 'storage_minor',
                          label: 'Actual storage cost (kobo)',
                          type: 'number',
                          required: false,
                        },
                        {
                          key: 'fees_minor',
                          label: 'Other documented costs (kobo)',
                          type: 'number',
                          required: false,
                        },
                        {
                          key: 'resolution',
                          label: 'Inspection and rejected-stock return resolution',
                          type: 'textarea',
                          required: false,
                        },
                      ],
                    )
                  }
                >
                  Verify receipt
                </button>
              )}
          </>
        )}
        {['reservations', 'intake'].includes(section) && role === 'storage' && (
          <>
            {row.status === 'requested' && (
              <>
                <button onClick={() => mutate('storage/reservations/' + row.id + '/confirm')}>
                  Confirm capacity
                </button>
                <button onClick={() => mutate('storage/reservations/' + row.id + '/reject')}>
                  Reject
                </button>
              </>
            )}
            {['confirmed', 'received'].includes(row.status) && (
              <button
                onClick={() =>
                  actionForm(
                    row.status === 'confirmed' ? 'Record intake' : 'Record release',
                    'storage/reservations/' +
                      row.id +
                      '/' +
                      (row.status === 'confirmed' ? 'receive' : 'release'),
                    [
                      { key: 'quantity_kg', label: 'Actual mass (kg)', type: 'number' },
                      { key: 'evidence', label: 'Evidence reference' },
                    ],
                  )
                }
              >
                {row.status === 'confirmed' ? 'Receive goods' : 'Release goods'}
              </button>
            )}
          </>
        )}
        {section === 'quotes' && row.status === 'quoted' && role !== 'transport' && (
          <button onClick={() => mutate('transport/quotes/' + row.id + '/accept')}>
            Accept quote
          </button>
        )}
        {section === 'quote-board' && (
          <button onClick={() => openForm('quotes', { order_id: row.order_id })}>
            Submit quote
          </button>
        )}
        {section === 'shipments' && !['delivered', 'failed'].includes(row.status) && (
          <button
            onClick={() =>
              actionForm('Update shipment', 'transport/shipments/' + row.id, [
                {
                  key: 'status',
                  label: 'New status',
                  options: (
                    {
                      assigned: ['dispatched', 'failed'],
                      dispatched: ['collected', 'failed'],
                      collected: ['in_transit', 'failed'],
                      in_transit: ['delivered', 'failed'],
                    } as any
                  )[row.status],
                },
                { key: 'evidence', label: 'Delivery evidence or failure reason' },
                {
                  key: 'actual_charge_minor',
                  label: 'Actual charge (kobo)',
                  type: 'number',
                  required: false,
                },
              ])
            }
          >
            Update job
          </button>
        )}
        {isAdmin && section === 'outbox' && row.status === 'failed' && (
          <button onClick={() => mutate('admin/outbox/' + row.id, {})}>Retry delivery</button>
        )}
        {role === 'super-admin' && section === 'privacy' && (
          <button
            onClick={() =>
              actionForm('Review privacy request', 'admin/privacy/' + row.id, [
                {
                  key: 'status',
                  label: 'Request status',
                  options: ['open', 'processing', 'completed'],
                },
              ])
            }
          >
            Update status
          </button>
        )}
        {isAdmin && section === 'users' && role === 'super-admin' && (
          <button
            onClick={() =>
              actionForm(
                'Change account access',
                'admin/users/' + row.id,
                [
                  {
                    key: 'status',
                    label: 'Account status',
                    options: ['active', 'suspended', 'deactivated'],
                  },
                  {
                    key: 'platform_role',
                    label: 'Platform role',
                    options: ['member', 'coordinator', 'admin', 'super_admin'],
                  },
                  { key: 'region', label: 'Assigned region' },
                ],
                row,
              )
            }
          >
            Manage access
          </button>
        )}
        {isAdmin && ['organizations', 'verification'].includes(section) && (
          <button
            onClick={() =>
              actionForm(
                'Review organization',
                'admin/organizations/' + (row.organization_id || row.id),
                [
                  {
                    key: 'verification_status',
                    label: 'Decision',
                    options: ['pending', 'verified', 'rejected', 'suspended'],
                  },
                  { key: 'reason', label: 'Review evidence and reason', type: 'textarea' },
                ],
              )
            }
          >
            Review
          </button>
        )}
        {isAdmin && section === 'incidents' && (
          <button
            onClick={() =>
              actionForm('Resolve incident', 'admin/incidents/' + row.id, [
                { key: 'status', label: 'Status', options: ['investigating', 'resolved', 'open'] },
                { key: 'resolution', label: 'Documented resolution', type: 'textarea' },
                { key: 'owner_id', label: 'Assigned staff user ID', required: false },
              ])
            }
          >
            Resolve
          </button>
        )}
        {section === 'payments' &&
          ['admin', 'super_admin'].includes(platformRole) &&
          row.status === 'unverified' && (
            <button
              onClick={() =>
                actionForm('Verify trusted payment evidence', 'payments/' + row.id + '/verify', [
                  { key: 'evidence', label: 'Independent verification evidence', type: 'textarea' },
                ])
              }
            >
              Verify
            </button>
          )}
      </div>
    );
  }
  function exportRows() {
    const csv = [
      columns.map((x) => JSON.stringify(pretty(x))).join(','),
      ...visibleRows.map((r) =>
        columns
          .map(
            (k) =>
              '"' +
              String(typeof r[k] === 'object' ? JSON.stringify(r[k]) : (r[k] ?? ''))
                .replaceAll('"', '""')
                .replace(/^[=+@-]/, "'") +
              '"',
          )
          .join(','),
      ),
    ].join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'harvestos-' + section + '.csv';
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <div className={isAdmin ? 'workspace admin-workspace' : 'workspace'}>
      <aside className={'sidebar ' + (mobile ? 'open' : '')}>
        <Link className="brand" href="/">
          <BrandMark />
          Harvest<span>OS</span>
        </Link>
        <button
          className="mobile-close"
          onClick={() => setMobile(false)}
          aria-label="Close navigation"
        >
          <X />
        </button>
        <div className="workspace-select">
          <span className="workspace-avatar">
            <BrandMark size={21} />
          </span>
          <div>
            <strong>HarvestOS</strong>
            <small>{workspace.label}</small>
          </div>
        </div>
        <span className="nav-label">WORKSPACE</span>
        <nav>
          {workspace.items.map(([slug, label], i) => {
            const Icon =
              i === 0
                ? LayoutDashboard
                : slug.includes('storage') || slug === 'facilities'
                  ? Warehouse
                  : slug === 'users'
                    ? Users
                    : slug === 'configuration'
                      ? Settings
                      : slug === 'shipments'
                        ? Truck
                        : Package;
            return (
              <Link
                onClick={() => setMobile(false)}
                key={slug}
                className={section === slug ? 'active' : ''}
                href={'/workspace/' + role + (slug === 'overview' ? '' : '/' + slug)}
              >
                <Icon size={18} />
                {label}
                {slug === 'risk' && preview && <span className="nav-count">4</span>}
              </Link>
            );
          })}
        </nav>
        <div className="sidebar-bottom">
          <div className="help-card">
            <Leaf size={20} />
            <strong>Every harvest matters.</strong>
            <p>Make the next step a clear one.</p>
            <Link href="/how-it-works">
              How HarvestOS works <ArrowUpRight size={13} />
            </Link>
          </div>
          <label className="role-label">
            Switch workspace
            <select value={role} onChange={(e) => router.push('/workspace/' + e.target.value)}>
              {Object.entries(workspaces)
                .filter(
                  ([key]) =>
                    preview ||
                    !['admin', 'super-admin', 'operations'].includes(key) ||
                    platformRole === 'super_admin' ||
                    (key === 'admin' && platformRole === 'admin') ||
                    (key === 'operations' && ['admin', 'coordinator'].includes(platformRole)),
                )
                .map(([key, v]) => (
                  <option key={key} value={key}>
                    {v.label}
                  </option>
                ))}
            </select>
          </label>
          <button
            className="signout"
            onClick={async () => {
              if (!preview) await browserAuth().auth.signOut();
              location.assign('/auth/login');
            }}
          >
            <LogOut size={16} /> {preview ? 'Sign in to connect' : 'Sign out'}
          </button>
        </div>
      </aside>
      <div className="workspace-body">
        <header className="topbar">
          <div>
            <button
              className="mobile-toggle"
              onClick={() => setMobile(true)}
              aria-label="Open navigation"
            >
              <Menu />
            </button>
            <span>{workspace.label}</span>
            <ChevronRight size={14} />
            <strong>{workspace.items.find(([s]) => s === section)?.[1] || pretty(section)}</strong>
          </div>
          <div>
            <span className="region-pill">
              <span className="dot" /> Plateau, Nigeria
            </span>
            <button
              aria-label="Notifications"
              onClick={async () => {
                if (preview) {
                  setDetails({ message: 'No real notifications in preview.' });
                  return;
                }
                try {
                  setDetails(await api('notifications'));
                } catch (e) {
                  setMessage(String(e));
                }
              }}
            >
              <Bell size={19} />
            </button>
            <span className="user-avatar">{isAdmin ? 'SA' : 'HO'}</span>
          </div>
        </header>
        <main id="main" className="workspace-main">
          {preview && (
            <div className="preview-banner">
              <ShieldCheck size={17} />
              <span>
                <strong>Local preview</strong> · Fictional examples, read-only. Connect Supabase to
                start real operations.
              </span>
              <Link href="/auth/login">
                Connect account <ArrowUpRight size={14} />
              </Link>
            </div>
          )}
          <div className="page-heading">
            <div>
              <span className="eyebrow">
                {isAdmin
                  ? 'GOVERNANCE & ACCOUNTABILITY'
                  : section === 'overview'
                    ? 'YOUR DAILY OPERATIONS'
                    : workspace.label.toUpperCase()}
              </span>
              <h1>
                {section === 'overview'
                  ? workspace.title
                  : workspace.items.find(([s]) => s === section)?.[1] || pretty(section)}
              </h1>
              <p>
                {section === 'overview'
                  ? 'The right information. The right connection. The next step forward.'
                  : section === 'risk'
                    ? 'Explainable priority, visible assumptions and a clear path to intervention.'
                    : section === 'reports'
                      ? 'Verified outcomes and reported quantities, without inflated impact claims.'
                      : 'Manage records and keep every operational decision traceable.'}
              </p>
            </div>
            <div className="actions">
              <button className="icon-button" onClick={() => load()} aria-label="Refresh workspace">
                <RefreshCw size={17} />
              </button>
              {(!isAdmin || ['catalogs', 'policies'].includes(section)) && forms[commonCreate] && (
                <button className="button" onClick={() => openForm(commonCreate)}>
                  <Plus size={17} /> {forms[commonCreate].title}
                </button>
              )}
              {section === 'overview' && !isAdmin && (
                <button
                  className="button"
                  onClick={() =>
                    openForm(
                      role === 'buyer'
                        ? 'requirements'
                        : role === 'transport'
                          ? 'vehicles'
                          : role === 'storage'
                            ? 'facilities'
                            : 'harvests',
                    )
                  }
                >
                  <Plus size={17} />
                  {role === 'buyer'
                    ? 'New requirement'
                    : role === 'transport'
                      ? 'Add vehicle'
                      : role === 'storage'
                        ? 'Add facility'
                        : 'New harvest'}
                </button>
              )}
            </div>
          </div>
          {message && (
            <div className="notice" role="status">
              {message}
            </div>
          )}
          {['overview', 'reports'].includes(section) && (
            <div className="stat-grid">
              {[
                ['Available produce', fmt(summary.available_kg), 'kg ready for allocation', Leaf],
                ['Reserved inventory', fmt(summary.reserved_kg), 'kg committed to orders', Package],
                [
                  'Verified sold mass',
                  fmt(summary.verified_sold_kg),
                  'kg independently reviewed',
                  ShieldCheck,
                ],
                [
                  'Verified transactions',
                  fmt(summary.verified_transactions),
                  'completed receipt reviews',
                  ArrowUpRight,
                ],
              ].map(([label, value, caption, Icon]) => {
                const I = Icon as typeof Leaf;
                return (
                  <article className="stat-card" key={String(label)}>
                    <div>
                      <span>{String(label)}</span>
                      <I size={18} />
                    </div>
                    <strong>{String(value)}</strong>
                    <small>{String(caption)}</small>
                  </article>
                );
              })}
            </div>
          )}
          {section === 'farms' && <FarmMap farms={rows} />}
          {section === 'matches' && <OptionComparison />}
          {section === 'reports' ? (
            <>
              <section className="panel">
                <h2>Outcome accounting</h2>
                <div className="report-grid">
                  <div>
                    <span>Reported physical loss</span>
                    <strong>{fmt(summary.reported_lost_kg)} kg</strong>
                  </div>
                  <div>
                    <span>Contracted revenue</span>
                    <strong>
                      {summary.contracted_revenue_minor == null
                        ? 'Not established / see currencies'
                        : money(summary.contracted_revenue_minor)}
                    </strong>
                  </div>
                  <div>
                    <span>Net proceeds, known costs only</span>
                    <strong>
                      {summary.net_proceeds_minor == null
                        ? 'Not yet established'
                        : money(summary.net_proceeds_minor)}
                    </strong>
                  </div>
                  <div>
                    <span>Avoided loss</span>
                    <strong>Not established</strong>
                  </div>
                </div>
                <div className="report-grid">
                  <div>
                    <span>Orders fulfilled / total</span>
                    <strong>
                      {fmt(summary.fulfilled_orders)} / {fmt(summary.order_count)}
                    </strong>
                  </div>
                  <div>
                    <span>Failed pickups / shipments</span>
                    <strong>
                      {fmt(summary.failed_pickups)} / {fmt(summary.shipment_count)}
                    </strong>
                  </div>
                </div>
                {summary.by_currency?.length > 0 && <Details value={summary.by_currency} />}
                <p className="notice">
                  Avoided loss needs a credible measured baseline. Verified sold mass is not a
                  food-rescue claim. Unknown costs remain unknown, and payment verification is
                  separate.
                </p>
              </section>
            </>
          ) : section === 'account' ? (
            <div className="account-grid">
              {[
                [
                  'organizations',
                  'Create an organization',
                  'Separate your business, memberships and operating records.',
                ],
                [
                  'verification',
                  'Request verification',
                  'Submit supporting evidence for privileged participation.',
                ],
                ['invite', 'Invite a member', 'Assign bounded roles with expiring invitations.'],
                [
                  'membership',
                  'Member access',
                  'Suspend or reactivate a bounded organization membership.',
                ],
                [
                  'revoke-invite',
                  'Revoke an invitation',
                  'Cancel a pending invitation with an audit record.',
                ],
                [
                  'accept-invite',
                  'Accept an invitation',
                  'Use the private token sent by your organization.',
                ],
                [
                  'outcome',
                  'End-of-harvest report',
                  'Reconcile sold, lost and held mass with recorded inventory.',
                ],
                ['profile', 'Profile settings', 'Update your name, phone and locale.'],
                ['privacy', 'Privacy requests', 'Request access, correction or deletion.'],
              ].map(([key, title, body]) => (
                <button className="account-card" key={key} onClick={() => openForm(key)}>
                  <Users />
                  <h3>{title}</h3>
                  <p>{body}</p>
                  <ArrowUpRight size={18} />
                </button>
              ))}
              <Link className="account-card" href="/auth/mfa">
                <ShieldCheck />
                <h3>Authenticator security</h3>
                <p>Enroll or verify MFA. Required for administrator access.</p>
              </Link>
              <div className="panel">
                <h3>Members and invitations</h3>
                <p>Inspect authorized members and expiring invitations.</p>
                <button
                  className="button outline"
                  onClick={async () => {
                    if (preview) {
                      setDetails({ message: 'No real memberships in preview.' });
                      return;
                    }
                    try {
                      setDetails(await api('memberships'));
                    } catch (e) {
                      setMessage(String(e));
                    }
                  }}
                >
                  View member records
                </button>
              </div>
              <MediaUpload
                preview={preview}
                organizations={catalogs.organizations || []}
                onMessage={setMessage}
              />
              <div className="panel">
                <h3>Inventory outcome</h3>
                <p>
                  Record loss only against unallocated stock. Uninspected declarations remain
                  unverified.
                </p>
                <button
                  className="button outline"
                  onClick={() =>
                    actionForm('Record harvest loss', '', [
                      { key: 'lot_id', label: 'Lot', source: 'lots' },
                      { key: 'quantity_kg', label: 'Lost mass (kg)', type: 'number' },
                      { key: 'evidence', label: 'Inspection evidence', required: false },
                      { key: 'declaration', label: 'Loss declaration', type: 'textarea' },
                    ])
                  }
                >
                  Report loss
                </button>
              </div>
            </div>
          ) : (
            <>
              {section === 'overview' && (
                <div className="overview-grid">
                  <section className="panel priority-panel">
                    <div className="panel-title">
                      <div>
                        <span className="eyebrow">MAKE THE NEXT MOVE COUNT</span>
                        <h2>{isAdmin ? 'Keep the platform accountable.' : 'Attention today'}</h2>
                      </div>
                      <span className="badge amber">
                        {preview ? 'Sample priorities' : 'Operational review'}
                      </span>
                    </div>
                    <p>
                      {isAdmin
                        ? 'Review organization evidence, investigate incidents, and inspect the audit trail before changing access.'
                        : 'Review harvest windows, confirm pending offers and coordinate collection before delays become losses.'}
                    </p>
                    <div className="priority-bottom">
                      <div className="mini-bars">
                        {[30, 48, 38, 63, 57, 82, 70, 92, 76, 98, 82, 65].map((h, i) => (
                          <i key={i} style={{ height: h + '%' }} />
                        ))}
                      </div>
                      <Link
                        href={
                          '/workspace/' +
                          role +
                          '/' +
                          (isAdmin
                            ? 'verification'
                            : role === 'operations'
                              ? 'risk'
                              : role === 'buyer'
                                ? 'marketplace'
                                : 'orders')
                        }
                        className="button"
                      >
                        {isAdmin ? 'Review verification' : 'View next actions'}{' '}
                        <ArrowRight size={16} />
                      </Link>
                    </div>
                    <small>
                      {preview
                        ? 'Illustrative activity. No live performance data.'
                        : 'Activity visualization is illustrative; use records below for actual quantities.'}
                    </small>
                  </section>
                  <section className="panel integrity-panel">
                    <ShieldCheck />
                    <span className="eyebrow">BUILT ON VERIFIED OUTCOMES</span>
                    <h2>
                      Good records.
                      <br />
                      Grounded decisions.
                    </h2>
                    <p>
                      Recommendations guide action. Only independently reviewed receipts count as
                      verified sales.
                    </p>
                    <Link href="/impact">
                      Our measurement approach <ArrowUpRight size={15} />
                    </Link>
                  </section>
                </div>
              )}
              {section === 'catalogs' && role === 'super-admin' && (
                <section className="panel">
                  <h2>Units and measured mass</h2>
                  <p>
                    Baskets have no universal weight. Leave conversion blank unless a fixed mass is
                    documented.
                  </p>
                  <button className="button outline" onClick={() => openForm('unit')}>
                    Add unit
                  </button>
                </section>
              )}
              {section === 'configuration' && role === 'super-admin' && (
                <section className="panel">
                  <h2>Publish a versioned scoring policy</h2>
                  <p>
                    Weights must sum to one. Thresholds must increase. Prior assessments keep their
                    original version.
                  </p>
                  <button
                    className="button"
                    onClick={() =>
                      actionForm('New scoring policy', 'admin/configuration/new', [
                        { key: 'version', label: 'Unique version', value: 'rules-v2' },
                        {
                          key: 'weights',
                          label: 'Weights (JSON)',
                          type: 'json',
                          value:
                            '{"uncommitted":0.30,"urgency":0.25,"storage":0.20,"delay":0.15,"condition":0.10}',
                        },
                        {
                          key: 'thresholds',
                          label: 'Thresholds (JSON)',
                          type: 'json',
                          value: '{"moderate":35,"high":65,"critical":80}',
                        },
                        {
                          key: 'assumptions',
                          label: 'Assumptions and validation limits',
                          type: 'textarea',
                        },
                      ])
                    }
                  >
                    <Plus size={16} /> Create policy version
                  </button>
                </section>
              )}
              <section className="panel records">
                <div className="panel-title">
                  <div>
                    <h2>
                      {section === 'overview'
                        ? isAdmin
                          ? 'Organization review'
                          : 'Harvest watch'
                        : pretty(section)}{' '}
                      <span className="record-count">{rows.length}</span>
                    </h2>
                    <p>
                      {preview
                        ? 'Fictional records for interface exploration.'
                        : 'Records are limited to your authorized scope.'}
                    </p>
                  </div>
                  <div className="table-tools">
                    <label className="search">
                      <Search size={16} />
                      <input
                        aria-label="Search records"
                        placeholder="Search records…"
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                      />
                    </label>
                    <button
                      className="icon-button"
                      onClick={exportRows}
                      aria-label="Export visible records"
                    >
                      <Download size={17} />
                    </button>
                  </div>
                </div>
                {loading ? (
                  <div className="empty">Loading your workspace…</div>
                ) : rows.length === 0 ? (
                  <div className="empty">
                    <Package size={36} />
                    <h3>No records here yet</h3>
                    <p>
                      {preview
                        ? 'This section is ready for connected operations.'
                        : 'Create an organization in Account, complete verification when required, then add your first record.'}
                    </p>
                    {forms[commonCreate] && (
                      <button className="button outline" onClick={() => openForm(commonCreate)}>
                        Create a record
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          {columns.map((k) => (
                            <th key={k}>{pretty(k)}</th>
                          ))}
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visibleRows.map((r, i) => (
                          <tr key={r.id || i}>
                            {columns.map((k, j) => (
                              <td key={k}>
                                {[
                                  'status',
                                  'level',
                                  'verification_status',
                                  'platform_role',
                                ].includes(k) ? (
                                  <span className={'badge ' + r[k]}>{pretty(String(r[k]))}</span>
                                ) : typeof r[k] === 'boolean' ? (
                                  r[k] ? (
                                    'Yes'
                                  ) : (
                                    'No'
                                  )
                                ) : k.includes('minor') ? (
                                  money(r[k])
                                ) : k.includes('_at') || k.includes('_date') ? (
                                  r[k] ? (
                                    new Date(r[k]).toLocaleDateString('en-NG', {
                                      timeZone: 'Africa/Lagos',
                                      day: 'numeric',
                                      month: 'short',
                                      year: 'numeric',
                                    })
                                  ) : (
                                    '—'
                                  )
                                ) : typeof r[k] === 'object' ? (
                                  <span className="muted">View details</span>
                                ) : j === 0 ? (
                                  <strong>{String(r[k] ?? '—')}</strong>
                                ) : (
                                  String(r[k] ?? '—')
                                )}
                              </td>
                            ))}
                            <td>{actions(r)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {cursor && (
                  <button
                    className="button outline"
                    onClick={async () => {
                      try {
                        const data = await api(endpoint() + '?cursor=' + cursor);
                        setRows((r) => [...r, ...data.items]);
                        setCursor(data.nextCursor);
                      } catch (e) {
                        setMessage(String(e));
                      }
                    }}
                  >
                    Load more records
                  </button>
                )}
              </section>
            </>
          )}
          <div className="workspace-footer">
            <span>
              <Leaf size={14} /> Every harvest deserves a market.
            </span>
            <span>{preview ? 'PREVIEW · NO LIVE DATA' : 'SECURE WORKSPACE · AFRICA/LAGOS'}</span>
          </div>
        </main>
      </div>
      {dialog && (
        <div className="modal-backdrop" onClick={() => !busy && setDialog(null)}>
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="dialog-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="panel-title">
              <div>
                <span className="eyebrow">HARVESTOS / OPERATIONS</span>
                <h2 id="dialog-title">{dialog.title}</h2>
              </div>
              <button aria-label="Close form" onClick={() => setDialog(null)}>
                <X />
              </button>
            </div>
            {preview && (
              <div className="notice">
                Preview only. Connect your Supabase project to save records.
              </div>
            )}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                try {
                  const form = new FormData(e.currentTarget),
                    body: Record<string, any> = {};
                  for (const f of dialog.fields) {
                    const v = form.get(f.key);
                    if (f.type === 'multi') body[f.key] = form.getAll(f.key);
                    else if (v !== null && v !== '')
                      body[f.key] =
                        f.type === 'number'
                          ? Number(v)
                          : f.type === 'datetime-local'
                            ? new Date(String(v)).toISOString()
                            : f.type === 'json'
                              ? JSON.parse(String(v))
                              : v;
                    else if (['owner_id', 'kg_factor'].includes(f.key)) body[f.key] = null;
                  }
                  let path = dialog.endpoint;
                  if (!path && body.lot_id) {
                    path = 'lots/' + body.lot_id + '/loss';
                    delete body.lot_id;
                  }
                  void mutate(path, body, dialog.method);
                } catch {
                  setMessage('Check the form values and JSON syntax.');
                }
              }}
            >
              {dialog.fields.map((f, i) => (
                <label key={f.key}>
                  {f.label}
                  {f.required === false && <small> (optional)</small>}
                  {f.options || f.source ? (
                    <select
                      autoFocus={i === 0}
                      name={f.key}
                      required={f.required !== false}
                      multiple={f.type === 'multi'}
                      defaultValue={
                        dialog.initial?.[f.key] ?? f.value ?? (f.type === 'multi' ? [] : '')
                      }
                    >
                      <option value="" disabled={f.required !== false}>
                        Select…
                      </option>
                      {(f.options || catalogs[f.source!] || []).map((v: any) => (
                        <option
                          key={typeof v === 'string' ? v : v.id}
                          value={typeof v === 'string' ? v : v.id}
                        >
                          {typeof v === 'string' ? pretty(v) : v.name || v.label || v.crop || v.id}
                        </option>
                      ))}
                    </select>
                  ) : ['textarea', 'json'].includes(f.type || '') ? (
                    <textarea
                      name={f.key}
                      rows={4}
                      required={f.required !== false}
                      defaultValue={
                        f.type === 'datetime-local' && dialog.initial?.[f.key]
                          ? new Date(
                              new Date(dialog.initial[f.key]).getTime() -
                                new Date().getTimezoneOffset() * 60000,
                            )
                              .toISOString()
                              .slice(0, 16)
                          : (dialog.initial?.[f.key] ?? f.value)
                      }
                    />
                  ) : (
                    <input
                      autoFocus={i === 0}
                      name={f.key}
                      type={f.type || 'text'}
                      step={f.type === 'number' ? 'any' : undefined}
                      required={f.required !== false}
                      defaultValue={
                        f.type === 'datetime-local' && dialog.initial?.[f.key]
                          ? new Date(
                              new Date(dialog.initial[f.key]).getTime() -
                                new Date().getTimezoneOffset() * 60000,
                            )
                              .toISOString()
                              .slice(0, 16)
                          : (dialog.initial?.[f.key] ?? f.value)
                      }
                    />
                  )}{' '}
                  {f.hint && <small>{f.hint}</small>}
                </label>
              ))}
              <div className="form-actions">
                <button type="button" className="button outline" onClick={() => setDialog(null)}>
                  Cancel
                </button>
                <button disabled={busy || preview} className="button">
                  {busy ? 'Saving…' : 'Save record'} <ArrowRight size={15} />
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
      {details && (
        <div className="modal-backdrop" onClick={() => setDetails(null)}>
          <section
            className="modal detail-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Record details"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="panel-title">
              <h2>Record & decision details</h2>
              <button aria-label="Close details" onClick={() => setDetails(null)}>
                <X />
              </button>
            </div>
            <p className="notice">
              Keep assumptions and evidence visible. A score is a coordination indicator, not a
              probability of spoilage.
            </p>
            <Details value={details} />
          </section>
        </div>
      )}
    </div>
  );
}
function Details({ value }: { value: any }) {
  if (value == null) return <span className="muted">Not established</span>;
  if (typeof value !== 'object') return <span>{String(value)}</span>;
  if (Array.isArray(value))
    return (
      <div className="details-list">
        {value.length ? (
          value.map((v, i) => (
            <div key={i}>
              <Details value={v} />
            </div>
          ))
        ) : (
          <p>No records.</p>
        )}
      </div>
    );
  return (
    <dl className="detail-list">
      {Object.entries(value).map(([k, v]) => (
        <div key={k}>
          <dt>{pretty(k)}</dt>
          <dd>
            {k === 'asset_id' && typeof v === 'string' ? (
              <a className="text-link" href={'/api/media/' + v} target="_blank" rel="noreferrer">
                Open private evidence
              </a>
            ) : (
              <Details value={v} />
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function MediaUpload({
  preview,
  organizations,
  onMessage,
}: {
  preview: boolean;
  organizations: any[];
  onMessage: (m: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <section className="panel">
      <h3>Private harvest photos</h3>
      <p>JPEG, PNG or WebP, up to 5 MB. Images remain authenticated media.</p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            const response = await fetch('/api/media/upload', {
              method: 'POST',
              body: new FormData(e.currentTarget),
            });
            const result = await response.json();
            if (!result.success) throw new Error(result.error.message);
            onMessage('Photo attached. Evidence asset ID: ' + result.data.id);
          } catch (e) {
            onMessage(String(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Organization
          <select name="organization_id" required>
            {organizations.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Harvest ID
          <input name="harvest_id" required />
        </label>
        <label>
          Photograph
          <input type="file" name="file" accept="image/jpeg,image/png,image/webp" required />
        </label>
        <button disabled={preview || busy} className="button">
          {busy ? 'Uploading…' : 'Upload private photo'}
        </button>
      </form>
    </section>
  );
}
