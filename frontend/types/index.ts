export type Role = 'ADMIN' | 'EMPLEADO' | 'CLIENTE';
export type TenantSubscriptionStatus = 'TRIAL' | 'ACTIVE' | 'PAST_DUE' | 'SUSPENDED';
export type ProductType = 'SIMPLE' | 'COMPUESTO';
export type SaleUnit = 'UNIT' | 'KG';
export type ReceiptType = 'TICKET' | 'FACTURA';
export type BusinessLocationType = 'BRANCH' | 'WAREHOUSE' | 'STORE';
export type DeliveryMethod = 'PICKUP' | 'LOCAL_DELIVERY' | 'TRANSPORT';
export type DeliveryStatus = 'NONE' | 'PENDING' | 'PREPARING' | 'IN_TRANSIT' | 'DELIVERED' | 'CANCELLED';
export type PaymentMethod =
  | 'EFECTIVO' | 'TARJETA' | 'TRANSFERENCIA' | 'QR' | 'DEBITO' | 'CREDITO'
  | 'QR_NACION' | 'QR_MERCADOPAGO' | 'TARJETA_DEBITO' | 'TARJETA_CREDITO' | 'CUENTA_CORRIENTE';
export type SaleStatus = 'COMPLETED' | 'PENDING' | 'CANCELLED';
export type DiscountType = 'PERCENTAGE' | 'FIXED';
export type ClientCategory = 'Price' | 'Cliente' | 'Mayorista';
export type MovementType = 'TRANSFER' | 'INGRESS' | 'ADJUSTMENT' | 'SALE' | 'SALE_CANCEL';
export type AccountMovementType = 'DEBT' | 'PAYMENT' | 'ADJUSTMENT_POSITIVE' | 'ADJUSTMENT_NEGATIVE' | 'CREDIT_NOTE';
export type CashSessionStatus = 'OPEN' | 'CLOSED';
export type CashMovementType = 'OPENING' | 'SALE_CASH' | 'PAYMENT_RECEIVED' | 'EXPENSE' | 'WITHDRAWAL' | 'DEPOSIT' | 'ADJUSTMENT';
export type PromotionType = 'PRODUCT_DISCOUNT' | 'CATEGORY_DISCOUNT' | 'CART_DISCOUNT';
export type PurchaseOrderStatus = 'DRAFT' | 'SENT' | 'PARTIAL' | 'RECEIVED' | 'CANCELLED';
export type GoalMetric = 'REVENUE' | 'GROSS_PROFIT' | 'UNITS_SOLD' | 'SALES_COUNT';
export type StockCountStatus = 'DRAFT' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
export type NotificationType = 'LOW_STOCK' | 'DEBT_ALERT' | 'GOAL_REACHED' | 'PROMOTION_EXPIRING' | 'CASH_SESSION_OPEN' | 'SYSTEM' | 'ONBOARDING_PENDING' | 'PRINTER_NOT_CONFIGURED';

export interface QuickAccessFolder {
  id: string;
  name: string;
  color: string;
  items: string[];
}

export interface QuickAccessConfig {
  pinned: string[];
  folders: QuickAccessFolder[];
  loose: string[];
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  isActive?: boolean;
  tenantId?: string | null;
  tenantSlug?: string | null;
  tenantName?: string | null;
  client?: Client | null;
  createdAt?: string;
  updatedAt?: string;
  lastLoginAt?: string | null;
  quickAccessConfig?: QuickAccessConfig | null;
}

export interface ProductCategory {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  isActive: boolean;
  _count?: { products: number };
  createdAt?: string;
  updatedAt?: string;
}

export interface ProductComponent {
  id?: string;
  compositeId?: string;
  componentId: string;
  quantity?: number | null;
  quantityKg?: number | null;
  component?: Product;
}

export interface ProductStock {
  id: string;
  productId: string;
  businessLocationId: string;
  businessLocation?: BusinessLocation;
  quantity: number;
  quantityKg: number;
  minQuantity?: number | null;
  minQuantityKg?: number | null;
}

export interface Product {
  id: string;
  name: string;
  description?: string | null;
  sku?: string | null;
  type: ProductType;
  categoryId?: string | null;
  category?: ProductCategory | string | null;
  price: number;
  clientPrice: number;
  wholesalePrice: number;
  purchasePrice?: number | null;
  pricePerKg?: number | null;
  clientPricePerKg?: number | null;
  wholesalePricePerKg?: number | null;
  stock?: ProductStock[];
  saleUnit: SaleUnit;
  imageUrl?: string | null;
  imageId?: string | null;
  isService?: boolean;
  isActive?: boolean;
  components?: ProductComponent[];
  usedIn?: ProductComponent[];
  createdAt?: string;
  updatedAt?: string;
}

export interface BusinessLocation {
  id: string;
  name: string;
  type: BusinessLocationType;
  addressStreet?: string | null;
  addressNumber?: string | null;
  addressCity?: string | null;
  addressProvince?: string | null;
  addressPostalCode?: string | null;
  addressNotes?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  isDefault: boolean;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface Client {
  id: string;
  nombre: string;
  apellido: string;
  dni: string;
  telefono?: string | null;
  gmail?: string | null;
  addressStreet?: string | null;
  addressNumber?: string | null;
  addressFloor?: string | null;
  addressApartment?: string | null;
  addressCity?: string | null;
  addressProvince?: string | null;
  addressPostalCode?: string | null;
  addressNotes?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  category: ClientCategory;
  userId?: string | null;
  user?: User | null;
  currentBalance: number;
  creditLimit?: number | null;
  isAccountEnabled?: boolean;
  loyaltyAccount?: { points: number; transactions?: LoyaltyTransaction[] } | null;
  createdAt?: string;
  updatedAt?: string;
  _count?: { sales?: number; accountMovements?: number };
}

export interface LoyaltyTransaction {
  id: string;
  loyaltyAccountId: string;
  type: 'EARN' | 'REDEEM' | 'EXPIRE' | 'ADJUSTMENT';
  points: number;
  reference?: string | null;
  description?: string | null;
  createdAt: string;
}

export interface SaleItem {
  id: string;
  saleId?: string;
  productId: string;
  product?: Product;
  quantity: number;
  quantityKg?: number | null;
  price: number;
  subtotal?: number;
  purchasePriceSnapshot?: number | null;
  profit?: number | null;
  productNameSnapshot?: string | null;
  productSkuSnapshot?: string | null;
  boxContents?: { id: string; productId: string; product?: Product; quantity?: number | null; quantityKg?: number | null }[];
}

export interface SalePayment {
  id?: string;
  method: PaymentMethod;
  amount: number;
  reference?: string | null;
  notes?: string | null;
  createdAt?: string;
}

export interface Sale {
  id: string;
  subtotal: number;
  total: number;
  businessLocationId?: string | null;
  businessLocation?: BusinessLocation | null;
  stockLocationId?: string | null;
  stockLocationRef?: BusinessLocation | null;
  deliveryMethod?: DeliveryMethod;
  deliveryStatus?: DeliveryStatus;
  deliveryAddressSnapshot?: string | null;
  deliveryDistanceKm?: number | null;
  deliveryPricePerKm?: number | null;
  deliveryCost?: number | null;
  grossProfit?: number | null;
  receiptType: ReceiptType;
  paymentMethod: PaymentMethod;
  status: SaleStatus;
  discountType?: DiscountType | null;
  discountValue?: number | null;
  promotionId?: string | null;
  promotionDiscount?: number | null;
  isAccountSale?: boolean;
  accountDebtAmount?: number;
  items: SaleItem[];
  payments?: SalePayment[];
  clientId?: string | null;
  client?: Client | null;
  userId?: string | null;
  user?: User | null;
  createdAt: string;
  invoiceAfip?: {
    id?: string;
    cae?: string;
    pdfUrl?: string | null;
    creditNotes?: { resultado: string; cae?: string | null }[];
  };
  pdfUrl?: string | null;
}

export interface CartItem {
  product: Product;
  quantity: number;
  quantityKg?: number;
  manualPrice?: number;
  priceType: 'price' | 'wholesalePrice';
}

export interface StockMovement {
  id: string;
  productId: string;
  product?: Product;
  user?: User;
  type: MovementType;
  fromLocationId?: string | null;
  toLocationId?: string | null;
  fromLocation?: { id: string; name: string } | null;
  toLocation?: { id: string; name: string } | null;
  quantity?: number | null;
  quantityKg?: number | null;
  reason?: string | null;
  reference?: string | null;
  createdAt: string;
}

export interface Alert {
  id: string;
  productId: string;
  product?: Product;
  message?: string;
  resolved?: boolean;
  createdAt: string;
  productName?: string;
}

export interface FinanceEntry {
  id: string;
  type: 'INGRESO' | 'EGRESO';
  amount: number;
  description?: string | null;
  category: string;
  paymentMethod?: PaymentMethod | null;
  date: string;
  createdAt: string;
}

export interface AccountMovement {
  id: string;
  clientId: string;
  client?: Client;
  saleId?: string | null;
  sale?: Sale | null;
  userId?: string | null;
  user?: User | null;
  type: AccountMovementType;
  amount: number;
  previousBalance: number;
  newBalance: number;
  paymentMethod?: PaymentMethod | null;
  reference?: string | null;
  description?: string | null;
  date: string;
  createdAt: string;
}

export interface Purchase {
  id: string;
  supplierId?: string | null;
  supplier?: Supplier | null;
  purchaseOrderId?: string | null;
  date: string;
  totalAmount: number;
  description?: string | null;
  businessLocationId?: string | null;
  businessLocation?: BusinessLocation | null;
  items?: PurchaseItem[];
  createdAt: string;
  updatedAt: string;
}

export interface PurchaseItem {
  id: string;
  purchaseId: string;
  productId: string;
  product?: Product;
  quantity: number;
  quantityKg?: number | null;
  unitCost: number;
  subtotal: number;
}

export interface Supplier {
  id: string;
  name: string;
  cuit?: string | null;
  contactName?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  notes?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CashSession {
  id: string;
  tenantId?: string | null;
  userId: string;
  user?: User;
  businessLocationId?: string | null;
  businessLocation?: BusinessLocation | null;
  status: CashSessionStatus;
  openingBalance: number;
  expectedBalance?: number;
  actualBalance?: number | null;
  difference?: number | null;
  openedAt: string;
  closedAt?: string | null;
  notes?: string | null;
  closeNotes?: string | null;
  movements?: CashMovement[];
}

export interface CashMovement {
  id: string;
  cashSessionId: string;
  type: CashMovementType;
  amount: number;
  description?: string | null;
  reference?: string | null;
  createdAt: string;
}

export interface Promotion {
  id: string;
  name: string;
  description?: string | null;
  type: PromotionType;
  discountType: DiscountType;
  discountValue: number;
  minAmount?: number | null;
  productIds?: string[];
  categoryIds?: string[];
  startsAt?: string | null;
  endsAt?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PurchaseOrder {
  id: string;
  supplierId?: string | null;
  supplier?: Supplier | null;
  status: PurchaseOrderStatus;
  notes?: string | null;
  expectedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  items?: PurchaseOrderItem[];
}

export interface PurchaseOrderItem {
  id: string;
  purchaseOrderId: string;
  productId: string;
  product?: Product;
  quantity: number;
  unitCost?: number | null;
}

export interface ReturnItem {
  id: string;
  returnId: string;
  productId: string;
  product?: { name: string; sku?: string | null } | null;
  quantity: number;
  quantityKg?: number | null;
  unitPrice: number;
  subtotal: number;
}

export interface Return {
  id: string;
  saleId: string;
  sale?: Sale | null;
  clientId?: string | null;
  client?: { nombre: string; apellido: string } | null;
  userId?: string | null;
  user?: { name: string } | null;
  total: number;
  reason?: string | null;
  refundMethod?: PaymentMethod | null;
  items?: ReturnItem[];
  createdAt: string;
}

export interface Notification {
  id: string;
  userId?: string | null;
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, unknown> | null;
  isRead: boolean;
  createdAt: string;
}

export interface PlatformAdmin {
  id: string;
  email: string;
  name: string;
  isActive: boolean;
}

export interface TenantPaymentLog {
  id: string;
  tenantId: string;
  platformAdminId?: string | null;
  platformAdmin?: { id: string; name: string; email: string } | null;
  previousStatus: TenantSubscriptionStatus;
  newStatus: TenantSubscriptionStatus;
  note?: string | null;
  paidUntil?: string | null;
  createdAt: string;
}

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  subscriptionStatus: TenantSubscriptionStatus;
  paidUntil?: string | null;
  suspendedAt?: string | null;
  trialEndsAt?: string | null;
  contactPhone?: string | null;
  mpPreapprovalId?: string | null;
  mpSubscriptionAmount?: number | null;
  notes?: string | null;
  createdAt: string;
  paymentLogs?: TenantPaymentLog[];
  users?: User[];
}

export type PrintboxDeviceStatus = 'PENDING_PAIRING' | 'ACTIVE' | 'REVOKED';

export interface PrintboxDevice {
  id: string;
  name: string;
  status: PrintboxDeviceStatus;
  hardwareId?: string | null;
  printerIp?: string | null;
  remoteHost?: string | null;
  pairingCode?: string | null;
  pairingCodeExpiresAt?: string | null;
  lastSeenAt?: string | null;
  createdAt: string;
  updatedAt: string;
}
