# RA-008 Business Domain Map

Version: v1.0

---

# AI-Commerce-OS Business Domain

```text
                        Supplier
                            │
                            │
                            ▼
                        Product
                            │
            ┌───────────────┴───────────────┐
            │                               │
            ▼                               ▼
      Inventory                         Listing
                                            │
                                            │
                                            ▼
                                         Store
                                            │
                                            ▼
                                         Order
                                            │
                                            ▼
                                         Customer
                                            │
                                            ▼
                                         Finance
```

---

# Domain Description

Supplier

↓

提供商品。

一个 Supplier

可以拥有多个 Product。

---

Product

↓

企业真正拥有的商品。

Product 是整个系统最核心的数据。

---

Inventory

↓

库存。

库存属于 Product。

以后支持：

- 本地仓
- 供应商仓
- 平台仓

---

Listing

↓

发布记录。

Listing ≠ Product。

例如：

Product：

AI灯带

↓

发布到

↓

抖音

↓

Listing A

↓

发布到

↓

TikTok

↓

Listing B

所以：

一个 Product

可以拥有多个 Listing。

---

Store

↓

店铺。

Store 拥有：

多个 Listing。

而不是多个 Product。

---

Order

↓

订单。

订单来自：

Listing。

不是 Product。

---

Customer

↓

客户。

客户来自：

订单。

---

Finance

↓

采购

↓

销售

↓

利润

↓

ROI

↓

现金流

---

# AI Layer

```text
AI CEO

│

├── AI Product Manager

├── AI Purchasing

├── AI Designer

├── AI Video

├── AI Operator

├── AI Customer Service

├── AI Analyst
```

---

# Execution Layer

```text
Dashboard

↓

FastAPI

↓

PostgreSQL

↓

AI Agent

↓

n8n

↓

Platform API
```

---

# Design Principle

Dashboard

↓

Operation

↓

API

↓

Database

所有数据，

都围绕 Business Domain。

任何模块，

不得直接绕过 Business Domain。