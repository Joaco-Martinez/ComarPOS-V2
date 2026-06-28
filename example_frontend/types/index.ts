export type Role = 'ADMIN' | 'EMPLEADO' | 'CLIENTE';

export type ProductType = 'SIMPLE' | 'COMPUESTO';
export type SaleUnit = 'UNIT' | 'KG';
export type ReceiptType = 'TICKET' | 'FACTURA';
export type BusinessLocationType = 'BRANCH' | 'WAREHOUSE' | 'STORE';

export type DeliveryMethod = 'PICKUP' | 'LOCAL_DELIVERY' | 'TRANSPORT';

export type DeliveryStatus =
  | 'NONE'
  | 'PENDING'
  | 'PREPARING'
  | 'IN_TRANSIT'
  | 'DELIVERED'
  | 'CANCELLED';
export type PaymentMethod =
  | 'EFECTIVO'
  | 'TARJETA'
  | 'TRANSFERENCIA'
  | 'QR'
  | 'DEBITO'
  | 'CREDITO'
  | 'QR_NACION'
  | 'QR_MERCADOPAGO'
  | 'TARJETA_DEBITO'
  | 'TARJETA_CREDITO'
  | 'CUENTA_CORRIENTE';

export type SaleStatus = 'COMPLETED' | 'PENDING' | 'CANCELLED';
export type DiscountType = 'PERCENTAGE' | 'FIXED';

export type ClientCategory = 'Price' | 'Cliente' | 'Mayorista';

export type MovementType =
  | 'TRANSFER'
  | 'INGRESS'
  | 'ADJUSTMENT'
  | 'SALE'
  | 'SALE_CANCEL';

export type MovementLocation = 'LOCAL' | 'DEPOSITO';

export type AccountMovementType =
  | 'DEBT'
  | 'PAYMENT'
  | 'ADJUSTMENT_POSITIVE'
  | 'ADJUSTMENT_NEGATIVE'
  | 'CREDIT_NOTE';

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  isActive?: boolean;
  client?: Client | null;
  createdAt?: string;
  updatedAt?: string;
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

  // Costo interno. No es precio de venta.
  // En productos por KG se usa como costo por KG.
  purchasePrice?: number | null;

  pricePerKg?: number | null;
  clientPricePerKg?: number | null;
  wholesalePricePerKg?: number | null;

  stockLocal: number;
  stockDeposito: number;
  minStock?: number | null;

  stockLocalKg?: number;
  stockDepositoKg?: number;
  minStockKg?: number | null;

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

  createdAt?: string;
  updatedAt?: string;

  _count?: {
    sales?: number;
    accountMovements?: number;
  };
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

  // Snapshots económicos guardados al momento de la venta.
  purchasePriceSnapshot?: number | null;
  profit?: number | null;

  productNameSnapshot?: string | null;
  productSkuSnapshot?: string | null;
  boxContents?: {
    id: string;
    productId: string;
    product?: Product;
    quantity?: number | null;
    quantityKg?: number | null;
  }[];
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

deliveryMethod?: DeliveryMethod;
deliveryStatus?: DeliveryStatus;
deliveryAddressSnapshot?: string | null;
deliveryDistanceKm?: number | null;
deliveryPricePerKm?: number | null;
deliveryCost?: number | null;

transportName?: string | null;
transportCuit?: string | null;
packagesCount?: number | null;
declaredValue?: number | null;

  // Utilidad total calculada en backend.
  grossProfit?: number | null;

  receiptType: ReceiptType;
  paymentMethod: PaymentMethod;
  status: SaleStatus;
  discountType?: DiscountType | null;
  discountValue?: number | null;
  isAccountSale?: boolean;
  accountDebtAmount?: number;
  items: SaleItem[];
  payments?: SalePayment[];
  clientId?: string | null;
  client?: Client | null;
  userId?: string | null;
  user?: User | null;
  createdAt: string;
  invoice?: { cae?: string; pdfUrl?: string | null };
  invoiceAfip?: { cae?: string; pdfUrl?: string | null };
  pdfUrl?: string | null;
}

export interface StockMovement {
  id: string;
  productId: string;
  product?: Product;
  user?: User;
  type: MovementType;
  from?: MovementLocation | null;
  to?: MovementLocation | null;
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
  stockLocal?: number;
  minStock?: number;
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

export interface CartItem {
  product: Product;
  quantity: number;
  quantityKg?: number;
  manualPrice?: number;
isDeliveryItem?: boolean;
  priceType: 'price' | 'clientPrice' | 'wholesalePrice';
}
