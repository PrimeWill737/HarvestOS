export const workspaces: Record<
  string,
  { title: string; label: string; items: [string, string][] }
> = {
  farmer: {
    title: 'Your harvest, in good hands.',
    label: 'Farmer workspace',
    items: [
      ['overview', 'Overview'],
      ['farms', 'Farms'],
      ['harvests', 'Harvests'],
      ['offers', 'Offers'],
      ['orders', 'Orders'],
      ['storage', 'Storage'],
      ['quotes', 'Shipment requests'],
      ['reports', 'Reports'],
      ['account', 'Account'],
    ],
  },
  buyer: {
    title: 'Better supply starts here.',
    label: 'Buyer workspace',
    items: [
      ['overview', 'Overview'],
      ['requirements', 'Requirements'],
      ['marketplace', 'Marketplace'],
      ['offers', 'Offers'],
      ['orders', 'Orders'],
      ['payments', 'Receipts & payments'],
      ['saved_suppliers', 'Saved suppliers'],
      ['destinations', 'Destinations'],
      ['account', 'Account'],
    ],
  },
  transport: {
    title: 'Keep the harvest moving.',
    label: 'Transport workspace',
    items: [
      ['overview', 'Overview'],
      ['vehicles', 'Vehicles & availability'],
      ['quote-board', 'Quote requests'],
      ['quotes', 'My quotes'],
      ['shipments', 'Jobs & delivery evidence'],
      ['invoices', 'Invoices'],
      ['account', 'Account'],
    ],
  },
  storage: {
    title: 'Space for what comes next.',
    label: 'Storage workspace',
    items: [
      ['overview', 'Overview'],
      ['facilities', 'Facilities & calendars'],
      ['reservations', 'Reservation requests'],
      ['intake', 'Inventory intake'],
      ['incidents', 'Incident reports'],
      ['account', 'Account'],
    ],
  },
  cooperative: {
    title: 'Stronger connections, together.',
    label: 'Cooperative workspace',
    items: [
      ['overview', 'Overview'],
      ['farms', 'Farms'],
      ['harvests', 'Harvests'],
      ['delegations', 'Delegated farms'],
      ['batches', 'Aggregation batches'],
      ['offers', 'Offers'],
      ['orders', 'Orders'],
      ['account', 'Account'],
    ],
  },
  operations: {
    title: 'A clearer view of every harvest.',
    label: 'Coordination workspace',
    items: [
      ['overview', 'Overview'],
      ['risk', 'Risk queue'],
      ['demand', 'Buyer demand'],
      ['matches', 'Matches'],
      ['storage', 'Storage partners'],
      ['logistics', 'Logistics'],
      ['orders', 'Orders'],
      ['incidents', 'Incidents'],
      ['reports', 'Impact'],
      ['account', 'Account'],
    ],
  },
  admin: {
    title: 'Build trust into every transaction.',
    label: 'Administration',
    items: [
      ['overview', 'Overview'],
      ['verification', 'Verification'],
      ['users', 'Users'],
      ['organizations', 'Organizations'],
      ['configuration', 'Configuration'],
      ['audit', 'Audit history'],
      ['incidents', 'Incident management'],
      ['outbox', 'Notifications'],
      ['account', 'Account'],
    ],
  },
  'super-admin': {
    title: 'Platform oversight, with accountability.',
    label: 'Super administrator',
    items: [
      ['overview', 'Overview'],
      ['users', 'Users & access'],
      ['organizations', 'Organizations'],
      ['verification', 'Verification'],
      ['configuration', 'Scoring & policies'],
      ['catalogs', 'Crop & unit catalogs'],
      ['policies', 'Operational policies'],
      ['audit', 'Global audit history'],
      ['incidents', 'Incident management'],
      ['outbox', 'Notification outbox'],
      ['privacy', 'Data requests'],
      ['account', 'Account'],
    ],
  },
};
export type Field = {
  key: string;
  label: string;
  type?: string;
  options?: string[];
  source?: string;
  required?: boolean;
  hint?: string;
  value?: string | number;
};
const org: Field = { key: 'organization_id', label: 'Organization', source: 'organizations' };
const region: Field = { key: 'region', label: 'Service region', value: 'Plateau' };
const currency: Field = { key: 'currency', label: 'Currency', value: 'NGN' };
const capacity: Field = { key: 'capacity_kg', label: 'Usable capacity (kg)', type: 'number' };
const window: Field[] = [
  { key: 'available_from', label: 'Available from', type: 'datetime-local' },
  { key: 'available_until', label: 'Available until', type: 'datetime-local' },
];
export const forms: Record<string, { title: string; endpoint: string; fields: Field[] }> = {
  outcome: {
    title: 'Submit end-of-harvest report',
    endpoint: 'outcome',
    fields: [
      { key: 'harvest_id', label: 'Harvest ID' },
      { key: 'reported_sold_kg', label: 'Reported sold mass (kg)', type: 'number' },
      { key: 'reported_lost_kg', label: 'Reported lost mass (kg)', type: 'number' },
      { key: 'reported_held_kg', label: 'Mass still held (kg)', type: 'number' },
      { key: 'evidence', label: 'Evidence and explanation', type: 'textarea' },
    ],
  },
  policies: {
    title: 'Version operational policy',
    endpoint: 'policies',
    fields: [
      { key: 'version', label: 'Version' },
      {
        key: 'settings',
        label: 'Policy settings (JSON)',
        type: 'json',
        value:
          '{"pickup_grace_hours":2,"incident_escalation_hours":24,"retention_days":365,"currency":"NGN","timezone":"Africa/Lagos"}',
      },
      { key: 'reason', label: 'Reason and review record', type: 'textarea' },
    ],
  },
  catalogs: {
    title: 'Add crop catalog entry',
    endpoint: 'catalog',
    fields: [
      { key: 'catalog', label: 'Catalog', options: ['crops'] },
      { key: 'name', label: 'Crop name' },
      { key: 'handling_hours', label: 'Prototype handling window (hours)', type: 'number' },
    ],
  },
  organizations: {
    title: 'Create organization',
    endpoint: 'organizations/create',
    fields: [
      { key: 'name', label: 'Organization name' },
      {
        key: 'type',
        label: 'Stakeholder type',
        options: ['farmer', 'buyer', 'cooperative', 'transporter', 'storage_provider'],
      },
      region,
    ],
  },
  farms: {
    title: 'Register a farm',
    endpoint: 'farms',
    fields: [
      org,
      { key: 'name', label: 'Farm name' },
      { key: 'address_description', label: 'Approximate location' },
      region,
      { key: 'latitude', label: 'Private latitude', type: 'number', required: false },
      { key: 'longitude', label: 'Private longitude', type: 'number', required: false },
    ],
  },
  harvests: {
    title: 'Create a harvest draft',
    endpoint: 'harvests',
    fields: [
      org,
      { key: 'farm_id', label: 'Farm', source: 'farms' },
      { key: 'crop_id', label: 'Crop', source: 'crops' },
      { key: 'variety', label: 'Variety', required: false },
      { key: 'grade', label: 'Grade', options: ['A', 'B', 'Processing'] },
      { key: 'estimated_harvest_date', label: 'Estimated harvest date', type: 'date' },
      { key: 'actual_harvest_date', label: 'Actual harvest date', type: 'date', required: false },
      { key: 'available_until', label: 'Collection deadline', type: 'datetime-local' },
      { key: 'total_quantity', label: 'Original quantity', type: 'number' },
      { key: 'unit_id', label: 'Reported unit', source: 'units' },
      {
        key: 'measured_kg',
        label: 'Measured kilograms',
        type: 'number',
        required: false,
        hint: 'Required for baskets or other units without a fixed mass conversion.',
      },
      {
        key: 'price_minor',
        label: 'Target price per kg (kobo)',
        type: 'number',
        hint: '100 kobo = ₦1',
      },
      currency,
      { key: 'storage_adequacy', label: 'Storage adequacy (0–100)', type: 'number', value: 0 },
      { key: 'delay_hours', label: 'Expected logistics delay (hours)', type: 'number', value: 0 },
      { key: 'condition_risk', label: 'Reported condition risk (0–100)', type: 'number', value: 0 },
    ],
  },
  requirements: {
    title: 'Publish buyer demand',
    endpoint: 'buyer-requirements',
    fields: [
      org,
      { key: 'crop_id', label: 'Crop', source: 'crops' },
      { key: 'grade', label: 'Grade', options: ['A', 'B', 'Processing'] },
      { key: 'quantity_kg', label: 'Required mass (kg)', type: 'number' },
      { key: 'max_price_minor', label: 'Maximum price per kg (kobo)', type: 'number' },
      currency,
      { key: 'window_start', label: 'Collection window starts', type: 'datetime-local' },
      { key: 'window_end', label: 'Collection window ends', type: 'datetime-local' },
      { key: 'expires_at', label: 'Demand expires', type: 'datetime-local' },
      { key: 'destination', label: 'Delivery destination' },
      region,
    ],
  },
  offers: {
    title: 'Make an offer',
    endpoint: 'offers',
    fields: [
      { key: 'parent_offer_id', label: 'Countered offer ID (if responding)', required: false },
      org,
      { key: 'lot_id', label: 'Lot ID' },
      { key: 'requirement_id', label: 'Your requirement', source: 'requirements' },
      { key: 'quantity_kg', label: 'Quantity (kg)', type: 'number' },
      { key: 'price_minor', label: 'Price per kg (kobo)', type: 'number' },
      { key: 'expires_at', label: 'Offer expires', type: 'datetime-local' },
    ],
  },
  vehicles: {
    title: 'Register vehicle',
    endpoint: 'transport/vehicles',
    fields: [
      org,
      { key: 'name', label: 'Vehicle / registration' },
      capacity,
      {
        key: 'suitability',
        label: 'Suitability',
        options: ['open', 'covered', 'insulated', 'refrigerated'],
      },
      region,
      ...window,
    ],
  },
  facilities: {
    title: 'Register storage facility',
    endpoint: 'storage/facilities',
    fields: [
      org,
      { key: 'name', label: 'Facility name' },
      capacity,
      { key: 'crop_ids', label: 'Compatible crops', source: 'crops', type: 'multi' },
      { key: 'conditions', label: 'Storage conditions' },
      { key: 'price_minor', label: 'Price per kg per day (kobo)', type: 'number' },
      currency,
      region,
      ...window,
    ],
  },
  reservations: {
    title: 'Request storage',
    endpoint: 'storage/reservations',
    fields: [
      org,
      { key: 'facility_id', label: 'Facility', source: 'facilities' },
      { key: 'lot_id', label: 'Harvest lot', source: 'lots' },
      { key: 'quantity_kg', label: 'Mass to store (kg)', type: 'number' },
      { key: 'starts_at', label: 'Storage starts', type: 'datetime-local' },
      { key: 'ends_at', label: 'Storage ends', type: 'datetime-local' },
    ],
  },
  quotes: {
    title: 'Request or submit transport quote',
    endpoint: 'transport/quotes',
    fields: [
      org,
      { key: 'order_id', label: 'Order ID' },
      {
        key: 'vehicle_id',
        label: 'Your vehicle (providers only)',
        source: 'vehicles',
        required: false,
      },
      { key: 'price_minor', label: 'Quoted charge (kobo)', type: 'number', required: false },
      currency,
      { key: 'pickup_at', label: 'Pickup time', type: 'datetime-local' },
      { key: 'delivery_at', label: 'Delivery time', type: 'datetime-local' },
    ],
  },
  incidents: {
    title: 'Report an incident',
    endpoint: 'incidents',
    fields: [
      org,
      { key: 'order_id', label: 'Order ID', required: false },
      {
        key: 'kind',
        label: 'Incident type',
        options: [
          'late_pickup',
          'deterioration',
          'wrong_quantity',
          'payment_delay',
          'no_show',
          'dispute',
          'other',
        ],
      },
      { key: 'description', label: 'What happened?', type: 'textarea' },
      { key: 'evidence', label: 'Evidence reference', required: false },
    ],
  },
  payments: {
    title: 'Record a payment reference',
    endpoint: 'payments',
    fields: [
      { key: 'order_id', label: 'Order ID' },
      { key: 'reference', label: 'Payment reference' },
      { key: 'amount_minor', label: 'Amount (kobo)', type: 'number' },
      currency,
      {
        key: 'evidence',
        label: 'Evidence reference',
        hint: 'This creates an unverified claim. An administrator must review trusted evidence.',
      },
    ],
  },
  destinations: {
    title: 'Add delivery destination',
    endpoint: 'destinations',
    fields: [
      org,
      { key: 'label', label: 'Destination name' },
      { key: 'address', label: 'Address' },
      region,
    ],
  },
  saved_suppliers: {
    title: 'Save a supplier',
    endpoint: 'saved-suppliers',
    fields: [org, { key: 'supplier_id', label: 'Supplier organization ID' }],
  },
  verification: {
    title: 'Request verification',
    endpoint: 'verification',
    fields: [org, { key: 'evidence', label: 'Supporting evidence reference', type: 'textarea' }],
  },
  membership: {
    title: 'Update membership status',
    endpoint: 'organizations/membership',
    fields: [
      org,
      { key: 'user_id', label: 'Member user ID' },
      { key: 'status', label: 'Membership status', options: ['active', 'suspended'] },
    ],
  },
  'revoke-invite': {
    title: 'Revoke invitation',
    endpoint: 'organizations/revoke-invite',
    fields: [org, { key: 'invitation_id', label: 'Invitation ID' }],
  },
  unit: {
    title: 'Add unit',
    endpoint: 'catalog',
    fields: [
      { key: 'catalog', label: 'Catalog', options: ['units'] },
      { key: 'code', label: 'Unit code' },
      { key: 'label', label: 'Unit label' },
      { key: 'measurement_type', label: 'Measurement type', options: ['mass', 'count', 'volume'] },
      {
        key: 'kg_factor',
        label: 'Fixed kg conversion, if documented',
        type: 'number',
        required: false,
      },
    ],
  },
  invite: {
    title: 'Invite an organization member',
    endpoint: 'organizations/invite',
    fields: [
      org,
      { key: 'email', label: 'Email', type: 'email' },
      { key: 'role', label: 'Membership role', options: ['manager', 'member', 'agent'] },
    ],
  },
  'accept-invite': {
    title: 'Accept invitation',
    endpoint: 'organizations/accept-invite',
    fields: [{ key: 'token', label: 'Invitation token' }],
  },
  privacy: {
    title: 'Request your data',
    endpoint: 'privacy-requests',
    fields: [
      { key: 'kind', label: 'Request type', options: ['access', 'correction', 'deletion'] },
      { key: 'details', label: 'Details', type: 'textarea' },
    ],
  },
  profile: {
    title: 'Update your account',
    endpoint: 'account',
    fields: [
      { key: 'full_name', label: 'Full name' },
      { key: 'phone', label: 'Phone', required: false },
      { key: 'locale', label: 'Locale', value: 'en-NG' },
    ],
  },
  batches: {
    title: 'Create aggregation batch',
    endpoint: 'batches',
    fields: [
      org,
      { key: 'name', label: 'Batch name' },
      { key: 'lot_ids', label: 'Harvest lots', source: 'lots', type: 'multi' },
    ],
  },
  delegations: {
    title: 'Delegate farm access',
    endpoint: 'delegations',
    fields: [
      { key: 'farm_id', label: 'Your farm', source: 'farms' },
      { key: 'organization_id', label: 'Cooperative organization ID' },
      { key: 'expires_at', label: 'Delegation expires', type: 'datetime-local' },
    ],
  },
};
