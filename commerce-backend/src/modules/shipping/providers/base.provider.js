/**
 * BaseShippingProvider — Interface that all shipping providers must implement.
 * Each concrete provider extends this class or implements these methods.
 */
export class BaseShippingProvider {
  constructor({ companyId }) {
    this.companyId = companyId;
  }

  /**
   * Authenticate and store credentials. Called on initial connect.
   * Should also trigger syncWarehouses() immediately after.
   * @param {object} credentials - Provider-specific credentials
   * @returns {Promise<object>} channel record
   */
  // eslint-disable-next-line no-unused-vars
  async connect(credentials) {
    throw new Error(`${this.constructor.name} does not implement connect()`);
  }

  /**
   * Ensure auth token is valid (refresh if needed).
   * @returns {Promise<string>} valid token
   */
  async ensureToken() {
    throw new Error(`${this.constructor.name} does not implement ensureToken()`);
  }

  /**
   * Fetch all warehouses from provider API and upsert into local DB.
   * @returns {Promise<Array>} synchronized warehouses
   */
  async syncWarehouses() {
    throw new Error(`${this.constructor.name} does not implement syncWarehouses()`);
  }

  /**
   * Create a new warehouse on the provider (only if it truly doesn't exist there).
   * @param {object} payload
   * @returns {Promise<object>} warehouse record
   */
  // eslint-disable-next-line no-unused-vars
  async createWarehouse(payload) {
    throw new Error(`${this.constructor.name} does not implement createWarehouse()`);
  }

  /**
   * Register a warehouse that already exists on the provider's own dashboard
   * (its ID was created there, not through us) by its ID alone — no API call,
   * just a local record so it can be used as a pickup location. Providers
   * that expose a real "list warehouses" API don't need this; providers that
   * only support create-and-return-id (no listing) should override it.
   * @param {object} payload - { externalWarehouseId, name, ...address fields }
   * @returns {Promise<object>} warehouse record
   */
  // eslint-disable-next-line no-unused-vars
  async linkExistingWarehouse(payload) {
    throw new Error(`${this.constructor.name} does not support linking an existing warehouse by ID`);
  }

  /**
   * Check serviceability between two PIN codes.
   * @param {object} params - { from, to, weight, paymentMode }
   * @returns {Promise<object>} serviceability result with courier options
   */
  // eslint-disable-next-line no-unused-vars
  async checkServiceability(params) {
    throw new Error(`${this.constructor.name} does not implement checkServiceability()`);
  }

  /**
   * Create a forward (delivery) shipment. Returns AWB code.
   * @param {object} payload - Pre-built shipment payload from buildShipmentPayload()
   * @returns {Promise<object>} shipment record
   */
  // eslint-disable-next-line no-unused-vars
  async createForwardOrder(payload) {
    throw new Error(`${this.constructor.name} does not implement createForwardOrder()`);
  }

  /**
   * Create a return (reverse pickup) shipment.
   * @param {object} payload
   * @returns {Promise<object>} shipment record
   */
  // eslint-disable-next-line no-unused-vars
  async createReturnOrder(payload) {
    throw new Error(`${this.constructor.name} does not implement createReturnOrder()`);
  }

  /**
   * Cancel one or more shipments by AWB.
   * @param {string[]} awbs
   * @returns {Promise<object>}
   */
  // eslint-disable-next-line no-unused-vars
  async cancelOrder(awbs) {
    throw new Error(`${this.constructor.name} does not implement cancelOrder()`);
  }

  /**
   * Track one or more shipments by AWB.
   * @param {string[]} awbs
   * @returns {Promise<object>} tracking info keyed by AWB
   */
  // eslint-disable-next-line no-unused-vars
  async trackOrders(awbs) {
    throw new Error(`${this.constructor.name} does not implement trackOrders()`);
  }

  /**
   * Generate a shipping label for an AWB.
   * @param {string} awb
   * @returns {Promise<string>} label URL or base64 PDF
   */
  // eslint-disable-next-line no-unused-vars
  async generateLabel(awb) {
    throw new Error(`${this.constructor.name} does not implement generateLabel()`);
  }

  /**
   * Build the provider-specific shipment payload from a normalized OMS order.
   * Each provider overrides this to map SyncedOrder fields to their API format.
   * @param {object} order - SyncedOrder document
   * @param {object} warehouse - Warehouse document (with externalWarehouseId)
   * @param {object} options - { courierId, printLabel, etc. }
   * @returns {object} provider payload
   */
  // eslint-disable-next-line no-unused-vars
  buildShipmentPayload(order, warehouse, options = {}) {
    throw new Error(`${this.constructor.name} does not implement buildShipmentPayload()`);
  }
}
