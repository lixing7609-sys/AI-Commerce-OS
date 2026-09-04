import {
  getShop,
  startShopOAuth,
  testShopConnection,
} from "../../services/shopApi.js";
import { toPlatformAuthorization, hasConfiguredCredentials } from "./credentialStore.js";
import { AccessMode } from "./types.js";

/**
 * 真实店铺的 StorePlatformAdapter 实现——只做真实的事：
 *   - 店铺档案/凭据状态/连接测试/OAuth 发起：转发到已经真实存在的
 *     后端店铺服务（`services/shopApi.js`，阶段 8E），不重新实现。
 *   - 商品/订单/客户/库存/经营数据的读取：后端 Stage 8E 明确"不保存
 *     任何虚假经营数据"（见 `backend/app/models/shop_db.py` 注释），
 *     即真实的平台商品/订单同步接口本阶段尚未接入后端。这里绝不
 *     编造数据——诚实返回空结果 + `syncNotImplemented` 标记，UI 必须
 *     照此显示"平台数据同步尚未接入"，不能显示成"已同步 0 条"。
 *   - 任何写操作：本阶段没有真实平台写入通道，一律返回
 *     `ok:false` + 明确原因，绝不假装执行成功。
 */

function notConnectedResult() {
  return { items: [], nextCursor: null };
}

const SYNC_NOT_IMPLEMENTED = "平台商品/订单/客户数据同步尚未接入真实后端（阶段 8E 仅实现店铺档案与凭据管理）。";
const WRITE_NOT_IMPLEMENTED = "真实平台写入通道尚未接入，本阶段不支持对真实店铺执行该操作。";

export function createLiveReadonlyAdapter() {
  return {
    async connect(storeId) {
      const shop = await getShop(storeId);
      const auth = toPlatformAuthorization(shop);
      if (!hasConfiguredCredentials(auth)) {
        return auth; // 诚实返回"未配置/等待授权"，不伪造已连接
      }
      const test = await testShopConnection(storeId);
      return { ...auth, lastVerifiedAt: test.tested_at ?? auth.lastVerifiedAt };
    },
    async disconnect() {
      // 真实店铺的断开/停用走 ShopCenter 已有的 disableShop()，
      // 这里不重复实现——Store Connection Center 直接复用该动作。
    },
    async validateCredentials(storeId) {
      const shop = await getShop(storeId);
      return toPlatformAuthorization(shop);
    },
    async refreshAuthorization(storeId) {
      const oauth = await startShopOAuth(storeId);
      const shop = await getShop(storeId);
      const auth = toPlatformAuthorization(shop);
      return { ...auth, missingRequirements: oauth.authorize_url ? [`需要访问授权链接完成授权：${oauth.status}`] : auth.missingRequirements };
    },
    async getStoreProfile(storeId) {
      const shop = await getShop(storeId);
      const auth = toPlatformAuthorization(shop);
      const connected = hasConfiguredCredentials(auth) && shop.connection_status === "connected";
      return {
        storeId: String(shop.id),
        name: shop.shop_name,
        platform: shop.platform,
        platformStoreId: shop.platform_shop_id ?? "",
        accessMode: AccessMode.LIVE_READONLY,
        connectionStatus: connected ? "connected" : "pending_authorization",
        lastSyncedAt: shop.last_sync_at ?? null,
        syncStatus: "idle",
        writeOperationsAllowed: false,
        isRealData: true,
      };
    },
    async listProducts() {
      return notConnectedResult();
    },
    async getProduct() {
      return null;
    },
    async listOrders() {
      return notConnectedResult();
    },
    async getOrder() {
      return null;
    },
    async listCustomers() {
      return notConnectedResult();
    },
    async getCustomer() {
      return null;
    },
    async getInventory() {
      return null;
    },
    async getMetrics() {
      return null;
    },
    async createProductDraft() {
      return { ok: false, requiresApproval: true, error: WRITE_NOT_IMPLEMENTED };
    },
    async updateProductDraft() {
      return { ok: false, error: WRITE_NOT_IMPLEMENTED };
    },
    async publishProduct() {
      return { ok: false, requiresApproval: true, error: WRITE_NOT_IMPLEMENTED };
    },
    async updatePrice() {
      return { ok: false, requiresApproval: true, error: WRITE_NOT_IMPLEMENTED };
    },
    async updateInventory() {
      return { ok: false, requiresApproval: false, error: WRITE_NOT_IMPLEMENTED };
    },
    async createCampaignDraft() {
      return { ok: false, requiresApproval: false, error: WRITE_NOT_IMPLEMENTED };
    },
  };
}

export const SYNC_NOT_IMPLEMENTED_MESSAGE = SYNC_NOT_IMPLEMENTED;
