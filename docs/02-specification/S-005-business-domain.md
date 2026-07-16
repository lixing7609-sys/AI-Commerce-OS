# S-005 Business Domain

Version: v1.0

---

# Vision

AI-Commerce-OS 是一个 AI Native Commerce Operating System。

它不是 ERP。

不是 CRM。

不是 OA。

它是一个 AI 驱动的商业操作系统。

---

# Core Business Flow

Supplier

↓

Product

↓

Store

↓

Customer

↓

Order

↓

Finance

---

# Domain Objects

## Supplier

代表商品来源。

一个供应商可以拥有多个商品。

---

## Product

商品。

一个商品只能对应一个供应商。

一个商品可以发布到多个店铺。

---

## Store

店铺。

例如：

- 抖音
- TikTok
- 视频号
- Amazon
- Shopee

一个店铺可以拥有很多商品。

---

## Listing

Listing 不是 Product。

Listing 是：

某一个商品，

在某一个店铺，

生成的一条发布记录。

例如：

Product：

AI智能灯带

↓

发布到

↓

抖音旗舰店

↓

生成：

Listing A

↓

发布到

↓

TikTok Shop

↓

生成：

Listing B

所以：

一个 Product

可以拥有多个 Listing。

---

## Inventory

库存。

库存属于 Product。

以后支持：

仓库库存

供应商库存

平台库存

---

## Order

订单。

订单来自：

Listing。

不是 Product。

因为：

抖音订单

TikTok订单

实际上来自不同的平台。

---

## Customer

客户。

客户来自订单。

以后可以：

标签

复购

会员

营销

---

## Finance

财务。

包括：

采购成本

平台佣金

物流

利润

ROI

---

# AI Domain

AI 总经理

↓

AI 选品

↓

AI 文案

↓

AI 图片

↓

AI 视频

↓

AI 发布

↓

AI 客服

↓

AI 数据分析

---

# Workflow

Dashboard

↓

FastAPI

↓

Database

↓

AI Agent

↓

n8n

↓

Platform API

---

# Principle

任何业务，

都必须先经过：

Business Domain。

禁止直接为了接口而设计数据库。

数据库必须服务业务。

API 必须服务 Dashboard。

AI 必须服务运营。